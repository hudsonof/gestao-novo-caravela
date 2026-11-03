import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";
import { postEntryTx } from "@/server/ledger";

const schema = z.object({ reason: z.string().trim().min(3).max(500) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const actor = await requireManager();
    const { id } = await context.params;
    const { reason } = schema.parse(await request.json());
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "PosOrder" WHERE "id" = ${id} FOR UPDATE`;
      const order = await tx.posOrder.findUnique({ where: { id }, include: { payments: { include: { ledgerEntry: true } } } });
      if (!order) throw new ApiError(404, "Pedido não encontrado.");
      if (order.status === "CANCELLED") return order;
      if (!order.payments.length) throw new ApiError(409, "Pedido sem pagamento deve ser cancelado, não estornado.");
      const reversals = [];
      for (const payment of order.payments) {
        const original = payment.ledgerEntry;
        const prior = await tx.ledgerEntry.findFirst({ where: { reversalOfId: original.id } });
        if (prior) continue;
        if (original.sessionId) {
          await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "CashSession" WHERE "id" = ${original.sessionId} FOR UPDATE`;
          const session = await tx.cashSession.findUnique({ where: { id: original.sessionId }, select: { status: true } });
          const accounts = await tx.financialAccount.findMany({ where: { id: { in: [original.debitAccountId, original.creditAccountId] } }, select: { kind: true } });
          if (session?.status === "CLOSED" && accounts.some((account) => account.kind === "CASH")) throw new ApiError(409, "Pagamento em dinheiro de caixa fechado não pode ser estornado por esta sessão.");
        }
        reversals.push(await postEntryTx(tx, {
          debitAccountId: original.creditAccountId,
          creditAccountId: original.debitAccountId,
          amount: original.amount.toFixed(2),
          description: `Estorno PDV: ${reason}`,
          idempotencyKey: `pos-refund:${id}:${payment.id}`,
          actorId: actor.userId,
          eventId: original.eventId || undefined,
          sessionId: original.sessionId || undefined,
          kind: "REVERSAL",
          method: original.method || undefined,
          category: original.category || undefined,
          reversalOfId: original.id,
        }));
      }
      const updated = await tx.posOrder.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason } });
      await tx.auditLog.create({ data: { actorId: actor.userId, entity: "PosOrder", entityId: id, action: "REFUND", before: { status: order.status, total: order.total.toFixed(2) }, after: { status: "CANCELLED", reason, reversedEntries: reversals.map((entry) => entry.id) } } });
      return updated;
    }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
  });
}
