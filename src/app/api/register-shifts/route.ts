import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ApiError, handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";

const schema = z.object({
  registerId: z.string().min(1),
  employeeId: z.string().nullable().optional().transform((value) => value || undefined),
  openingFloat: z.coerce.string().regex(/^\d+(?:\.\d{1,2})?$/, "Informe um valor válido."),
});

export async function GET() {
  return handleApi(async () => {
    await requireManager();
    return prisma.cashRegisterShift.findMany({
      include: { register: true, employee: true, withdrawals: { orderBy: { createdAt: "asc" } }, closing: true },
      orderBy: { openedAt: "desc" },
      take: 100,
    });
  });
}

export async function POST(request: Request) {
  return handleApi(async () => {
    const actor = await requireManager();
    const input = schema.parse(await request.json());
    const idempotencyKey = z.string().uuid().parse(request.headers.get("x-idempotency-key"));
    const openingFloat = new Prisma.Decimal(input.openingFloat);

    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "CashRegister" WHERE "id" = ${input.registerId} FOR UPDATE`;
      const repeated = await tx.cashRegisterShift.findUnique({ where: { idempotencyKey } });
      if (repeated) {
        const same = repeated.registerId === input.registerId &&
          repeated.employeeId === (input.employeeId || null) &&
          repeated.openingFloat.equals(openingFloat);
        if (!same) throw new ApiError(409, "A chave de idempotência já foi usada em outra abertura.");
        return repeated;
      }

      const register = await tx.cashRegister.findUnique({ where: { id: input.registerId }, select: { id: true, name: true, active: true } });
      if (!register) throw new ApiError(404, "Caixa não encontrado.");
      if (!register.active) throw new ApiError(409, "Ative o caixa antes de abrir uma operação.");
      const legacyOpenSession = await tx.cashSession.findFirst({
        where: { registerId: register.id, status: "OPEN" },
        select: { id: true },
      });
      if (legacyOpenSession) throw new ApiError(409, "Este caixa possui uma sessão anterior aberta. Feche-a antes de iniciar a nova operação.");

      if (input.employeeId) {
        const employee = await tx.employee.findUnique({ where: { id: input.employeeId }, select: { id: true, active: true } });
        if (!employee || !employee.active) throw new ApiError(400, "Selecione um colaborador ativo.");
      }

      const openShift = await tx.cashRegisterShift.findFirst({ where: { registerId: register.id, status: "OPEN" }, select: { id: true } });
      if (openShift) throw new ApiError(409, "Este caixa já possui uma operação aberta.");

      const shift = await tx.cashRegisterShift.create({
        data: { registerId: register.id, employeeId: input.employeeId, openedById: actor.userId, idempotencyKey, openingFloat },
        include: { register: true, employee: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          entity: "CashRegisterShift",
          entityId: shift.id,
          action: "OPEN",
          after: { registerId: register.id, employeeId: input.employeeId || null, openingFloat: openingFloat.toString() },
        },
      });
      return shift;
    });
  }, 201);
}
