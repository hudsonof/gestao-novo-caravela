import { Prisma } from "@prisma/client";
import { positiveMoney } from "@/lib/money";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, handleApi } from "@/lib/http";
import { requirePosUser } from "@/lib/pos-auth";
import { lockPosSession, lockOpenOrder, postPosPayment } from "@/server/pos";

const schema = z.object({ amount: z.string(), method: z.enum(["CASH", "PIX", "BANK_TRANSFER", "DEBIT", "CREDIT"]) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requirePosUser();
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    const key = request.headers.get("idempotency-key") || "";
    if (!key || key.length > 70) throw new ApiError(400, "Informe uma chave de idempotência válida.");

    return prisma.$transaction(async (tx) => {
      const paymentKey = `${user.userId}:${key}`;
      const amount = positiveMoney(input.amount);
      const existing = await tx.posPayment.findUnique({ where: { idempotencyKey: paymentKey }, include: { order: { select: { channel: true, session: { select: { registerId: true } } } } } });
      if (existing) {
        if (existing.orderId !== id || existing.method !== input.method || !existing.amount.equals(amount)) throw new ApiError(409, "Chave de idempotência reutilizada com outros dados.");
        if (existing.order.channel !== user.profile || existing.order.session.registerId !== user.cashRegisterId) throw new ApiError(404, "Comanda não encontrada.");
        return existing;
      }
      const order = await lockOpenOrder(tx, id, user);
      if (!order.items.length || order.total.lessThanOrEqualTo(0)) throw new ApiError(409, "A comanda não possui itens.");
      const session = await lockPosSession(tx, user, order.eventId);
      const paid = await tx.posPayment.aggregate({ where: { orderId: id }, _sum: { amount: true } });
      const paidAmount = paid._sum.amount || new Prisma.Decimal(0);
      const remaining = order.total.minus(paidAmount);
      if (amount.greaterThan(remaining)) throw new ApiError(400, "O pagamento não pode exceder o saldo da comanda.");
      return postPosPayment({
        tx,
        actorId: user.userId,
        order,
        amountText: input.amount,
        method: input.method,
        idempotencyKey: paymentKey,
        sessionId: session.id,
        accountId: session.accountId,
        eventId: order.eventId,
        commandCode: order.commandCode,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 });
  }, 201);
}
