import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, handleApi } from "@/lib/http";
import { requirePosUser } from "@/lib/pos-auth";
import { lockPosSession } from "@/server/pos";

const schema = z.object({
  eventId: z.string().min(1),
  commandCode: z.string().trim().min(1).max(80),
  tableId: z.string().optional().or(z.literal("")),
  waiterEmployeeId: z.string().optional().or(z.literal("")),
  operatorEmployeeId: z.string().optional().or(z.literal("")),
});

export async function GET(request: Request) {
  return handleApi(async () => {
    const user = await requirePosUser();
    const query = new URL(request.url).searchParams;
    return prisma.posOrder.findMany({
      where: {
        session: { is: { registerId: user.cashRegisterId } },
        channel: user.profile,
        status: "OPEN",
        ...(query.get("eventId") ? { eventId: query.get("eventId")! } : {}),
      },
      include: { items: true, payments: true, table: true, waiter: { select: { id: true, name: true } } },
      orderBy: { openedAt: "desc" },
      take: 100,
    });
  });
}

export async function POST(request: Request) {
  return handleApi(async () => {
    const user = await requirePosUser();
    const input = schema.parse(await request.json());
    const key = request.headers.get("idempotency-key") || "";
    if (!key || key.length > 100) throw new ApiError(400, "Informe uma chave de idempotência (máximo 100 caracteres).");
    if (user.profile === "WAITER" && (!input.tableId || !input.waiterEmployeeId)) throw new ApiError(400, "Vendas de garçons exigem mesa e garçom.");

    return prisma.$transaction(async (tx) => {
      const idem = `${user.userId}:${key}`;
      const prior = await tx.posOrder.findUnique({ where: { idempotencyKey: idem }, include: { items: true, payments: true, session: { select: { registerId: true } } } });
      if (prior) {
        if (prior.operatorUserId !== user.userId || prior.eventId !== input.eventId || prior.commandCode !== input.commandCode || prior.channel !== user.profile || prior.session.registerId !== user.cashRegisterId) {
          throw new ApiError(409, "Chave de idempotência reutilizada com outros dados.");
        }
        return prior;
      }
      const session = await lockPosSession(tx, user, input.eventId);
      const duplicate = await tx.posOrder.findFirst({ where: { eventId: input.eventId, channel: user.profile, commandCode: input.commandCode, status: "OPEN" } });
      if (duplicate) throw new ApiError(409, "Já existe uma comanda aberta com este identificador.");
      let tableNameSnapshot: string | null = null;
      if (input.tableId) {
        const table = await tx.posTable.findUnique({ where: { id: input.tableId } });
        if (!table || !table.active) throw new ApiError(400, "Mesa não encontrada ou inativa.");
        tableNameSnapshot = table.name;
      }
      if (input.waiterEmployeeId) {
        const waiter = await tx.employee.findFirst({ where: { id: input.waiterEmployeeId, active: true } });
        if (!waiter) throw new ApiError(400, "Garçom não encontrado ou inativo.");
      }
      if (input.operatorEmployeeId) {
        const operator = await tx.employee.findFirst({ where: { id: input.operatorEmployeeId, active: true } });
        if (!operator) throw new ApiError(400, "Operador não encontrado ou inativo.");
      }
      return tx.posOrder.create({
        data: {
          eventId: input.eventId,
          sessionId: session.id,
          operatorUserId: user.userId,
          channel: user.profile,
          commandCode: input.commandCode,
          tableId: input.tableId || null,
          tableNameSnapshot,
          waiterEmployeeId: input.waiterEmployeeId || null,
          operatorEmployeeId: input.operatorEmployeeId || null,
          idempotencyKey: idem,
        },
        include: { items: true, payments: true },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 });
  }, 201);
}
