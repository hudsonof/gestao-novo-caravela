import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, handleApi } from "@/lib/http";
import { requirePosDevice } from "@/lib/pos-auth";
import { lockOpenOrder, productTypeForChannel, recalculateOrderTotal } from "@/server/pos";

const schema = z.object({ productId: z.string().min(1), quantity: z.number().int().min(1).max(500) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const device = await requirePosDevice(request);
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    const requestKey = request.headers.get("idempotency-key") || "";
    if (!requestKey || requestKey.length > 100) throw new ApiError(400, "Informe uma chave de idempotência válida.");

    return prisma.$transaction(async (tx) => {
      const idem = `${device.id}:${requestKey}`;
      const prior = await tx.posOrderItem.findUnique({ where: { idempotencyKey: idem } });
      if (prior) {
        if (prior.orderId !== id || prior.productId !== input.productId || prior.quantity !== input.quantity) throw new ApiError(409, "Chave de idempotência reutilizada com outros dados.");
        return prior;
      }
      const order = await lockOpenOrder(tx, id, device.id);
      if (order.payments.length) throw new ApiError(409, "Não adicione itens após o primeiro pagamento.");
      const session = await tx.cashSession.findUnique({ where: { id: order.sessionId }, include: { event: true } });
      if (!session || session.status !== "OPEN" || session.event.status !== "OPEN") throw new ApiError(409, "A sessão de caixa ou o evento foi encerrado.");
      const product = await tx.posProduct.findUnique({ where: { id: input.productId }, include: { eventPrices: { where: { eventId: order.eventId } } } });
      if (!product || !product.active || product.type !== productTypeForChannel(device.profile)) throw new ApiError(400, "Produto indisponível para este perfil do PDV.");
      const unitPrice = product.eventPrices[0]?.price || product.basePrice;
      const lineTotal = unitPrice.mul(input.quantity);
      const item = await tx.posOrderItem.create({ data: { orderId: id, productId: product.id, productName: product.name, quantity: input.quantity, unitPrice, lineTotal, idempotencyKey: idem } });
      await recalculateOrderTotal(tx, id);
      return item;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 });
  }, 201);
}
