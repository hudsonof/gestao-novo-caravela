import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, handleApi } from "@/lib/http";
import { requirePosDevice } from "@/lib/pos-auth";

const schema = z.object({ reason: z.string().trim().min(3).max(500) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const device = await requirePosDevice(request);
    const { id } = await context.params;
    const { reason } = schema.parse(await request.json());
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "PosOrder" WHERE "id" = ${id} FOR UPDATE`;
      const order = await tx.posOrder.findUnique({ where: { id }, include: { payments: true } });
      if (!order || order.deviceId !== device.id) throw new ApiError(404, "Comanda não encontrada.");
      if (order.status === "CANCELLED" && order.cancelReason === reason) return order;
      if (order.status !== "OPEN" || order.payments.length) throw new ApiError(409, "Só é possível cancelar comandas abertas sem pagamentos.");
      const updated = await tx.posOrder.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason } });
      await tx.auditLog.create({ data: { actorId: device.createdById, entity: "PosOrder", entityId: id, action: "CANCEL", before: { status: order.status }, after: { status: "CANCELLED", reason, deviceId: device.id } } });
      return updated;
    });
  });
}
