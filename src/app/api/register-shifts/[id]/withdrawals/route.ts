import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";

const schema = z.object({
  amount: z.coerce.string().regex(/^\d+(?:\.\d{1,2})?$/, "Informe um valor válido."),
  observation: z.string().trim().min(2).max(500),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const actor = await requireManager();
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    const idempotencyKey = z.string().uuid().parse(request.headers.get("x-idempotency-key"));
    const amount = new Prisma.Decimal(input.amount);
    if (!amount.greaterThan(0)) throw new ApiError(400, "A retirada precisa ser maior que zero.");

    return prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "CashRegisterShift" WHERE "id" = ${id} FOR UPDATE`;
      if (!rows.length) throw new ApiError(404, "Operação de caixa não encontrada.");
      const repeated = await tx.cashRegisterWithdrawal.findUnique({ where: { idempotencyKey } });
      if (repeated) return repeated;

      const shift = await tx.cashRegisterShift.findUnique({ where: { id }, select: { id: true, status: true } });
      if (!shift) throw new ApiError(404, "Operação de caixa não encontrada.");
      if (shift.status !== "OPEN") throw new ApiError(409, "Não é possível retirar valores de um caixa fechado.");

      const withdrawal = await tx.cashRegisterWithdrawal.create({
        data: { shiftId: id, amount, observation: input.observation, createdById: actor.userId, idempotencyKey },
      });
      await tx.auditLog.create({
        data: { actorId: actor.userId, entity: "CashRegisterShift", entityId: id, action: "WITHDRAWAL", after: { amount: amount.toString(), observation: input.observation } },
      });
      return withdrawal;
    });
  }, 201);
}
