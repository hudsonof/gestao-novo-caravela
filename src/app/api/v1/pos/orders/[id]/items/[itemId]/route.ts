import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, handleApi } from "@/lib/http";
import { requirePosUser } from "@/lib/pos-auth";
import { lockOpenOrder, recalculateOrderTotal } from "@/server/pos";

const schema = z.object({ quantity: z.number().int().min(1).max(500) });

export async function PATCH(request: Request, context: { params: Promise<{ id: string; itemId: string }> }) {
  return handleApi(async () => {
    const user = await requirePosUser();
    const { id, itemId } = await context.params;
    const { quantity } = schema.parse(await request.json());
    return prisma.$transaction(async (tx) => {
      const order = await lockOpenOrder(tx, id, user);
      if (order.payments.length) throw new ApiError(409, "Não altere itens após o primeiro pagamento.");
      const item = await tx.posOrderItem.findUnique({ where: { id: itemId } });
      if (!item || item.orderId !== id) throw new ApiError(404, "Item não encontrado.");
      const updated = await tx.posOrderItem.update({ where: { id: itemId }, data: { quantity, lineTotal: item.unitPrice.mul(quantity) } });
      await recalculateOrderTotal(tx, id);
      return updated;
    }, { isolationLevel: "Serializable" });
  });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string; itemId: string }> }) {
  return handleApi(async () => {
    const user = await requirePosUser();
    const { id, itemId } = await context.params;
    return prisma.$transaction(async (tx) => {
      const order = await lockOpenOrder(tx, id, user);
      if (order.payments.length) throw new ApiError(409, "Não remova itens após o primeiro pagamento.");
      const item = await tx.posOrderItem.findUnique({ where: { id: itemId } });
      if (!item || item.orderId !== id) throw new ApiError(404, "Item não encontrado.");
      await tx.posOrderItem.delete({ where: { id: itemId } });
      await recalculateOrderTotal(tx, id);
      return { id: itemId };
    }, { isolationLevel: "Serializable" });
  });
}
