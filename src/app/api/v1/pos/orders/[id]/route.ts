import { prisma } from "@/lib/db";
import { handleApi, ApiError } from "@/lib/http";
import { requirePosDevice } from "@/lib/pos-auth";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const device = await requirePosDevice(request);
    const { id } = await context.params;
    const order = await prisma.posOrder.findUnique({ where: { id }, include: { items: true, payments: true, table: true, waiter: { select: { id: true, name: true } }, event: { select: { id: true, name: true } } } });
    if (!order || order.deviceId !== device.id) throw new ApiError(404, "Comanda não encontrada.");
    return order;
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const device = await requirePosDevice(request);
    const { id } = await context.params;
    const payload = await request.json();
    const reason = typeof payload?.reason === "string" ? payload.reason.trim() : "";
    if (reason.length < 3 || reason.length > 500) throw new ApiError(400, "Informe o motivo do cancelamento.");
    const order = await prisma.posOrder.findUnique({ where: { id }, include: { payments: true } });
    if (!order || order.deviceId !== device.id) throw new ApiError(404, "Comanda não encontrada.");
    if (order.status !== "OPEN" || order.payments.length) throw new ApiError(409, "Só é possível cancelar comandas abertas sem pagamentos.");
    await prisma.$transaction(async (tx) => {
      await tx.posOrder.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason } });
      await tx.auditLog.create({ data: { actorId: device.createdById, entity: "PosOrder", entityId: id, action: "CANCEL", before: { status: order.status }, after: { status: "CANCELLED", reason } } });
    });
    return { id, status: "CANCELLED" };
  });
}
