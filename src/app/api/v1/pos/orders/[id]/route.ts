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

