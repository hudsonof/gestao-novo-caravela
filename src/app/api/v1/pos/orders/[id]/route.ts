import { prisma } from "@/lib/db";
import { handleApi, ApiError } from "@/lib/http";
import { requirePosUser } from "@/lib/pos-auth";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requirePosUser();
    const { id } = await context.params;
    const order = await prisma.posOrder.findUnique({
      where: { id },
      include: {
        items: true,
        payments: true,
        table: true,
        waiter: { select: { id: true, name: true } },
        event: { select: { id: true, name: true } },
        session: { select: { registerId: true } },
      },
    });
    if (!order || order.session.registerId !== user.cashRegisterId || order.channel !== user.profile) {
      throw new ApiError(404, "Comanda não encontrada.");
    }
    return order;
  });
}
