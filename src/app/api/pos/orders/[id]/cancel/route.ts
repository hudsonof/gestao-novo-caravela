import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";

const schema = z.object({ reason: z.string().trim().min(3).max(500) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const actor = await requireManager();
    const { id } = await context.params;
    const { reason } = schema.parse(await request.json());
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "PosOrder" WHERE "id" = ${id} FOR UPDATE`;
      const order = await tx.posOrder.findUnique({ where: { id }, include: { payments: true } });
      if (!order) throw new ApiError(404, "Pedido não encontrado.");
      if (order.status !== "OPEN" || order.payments.length) throw new ApiError(409, "Pedidos com pagamento precisam ser estornados.");
      const updated = await tx.posOrder.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason } });
      await tx.auditLog.create({ data: { actorId: actor.userId, entity: "PosOrder", entityId: id, action: "CANCEL", before: { status: order.status }, after: { status: "CANCELLED", reason } } });
      return updated;
    });
  });
}
