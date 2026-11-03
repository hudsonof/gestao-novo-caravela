import { prisma } from "@/lib/db";
import { handleApi, ApiError } from "@/lib/http";
import { requirePosUser } from "@/lib/pos-auth";
import { productTypeForChannel } from "@/server/pos";
import { signedImageUrl } from "@/lib/firebase-storage";

export async function GET(request: Request) {
  return handleApi(async () => {
    const user = await requirePosUser();
    const eventId = new URL(request.url).searchParams.get("eventId");
    if (!eventId) throw new ApiError(400, "Informe o evento.");
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event || event.status !== "OPEN") throw new ApiError(409, "Evento inexistente ou fechado.");
    const session = await prisma.cashSession.findFirst({
      where: { eventId, registerId: user.cashRegisterId, status: "OPEN" },
      select: { id: true, openedAt: true, openingFloat: true, account: { select: { name: true, balance: true } } },
    });
    if (!session) throw new ApiError(409, "Não há sessão de caixa aberta para este usuário e evento.");
    const [products, tables, employees] = await Promise.all([
      prisma.posProduct.findMany({
        where: { active: true, type: productTypeForChannel(user.profile) },
        include: { eventPrices: { where: { eventId }, select: { price: true } } },
        orderBy: { name: "asc" },
      }),
      user.profile === "WAITER" ? prisma.posTable.findMany({ where: { active: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
      user.profile === "WAITER" ? prisma.employee.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
    ]);
    return {
      user: { id: user.userId, name: user.name, role: user.role, profile: user.profile },
      register: user.cashRegister,
      event: { id: event.id, name: event.name },
      session,
      products: await Promise.all(products.map(async ({ eventPrices, ...product }) => ({
        ...product,
        price: eventPrices[0]?.price || product.basePrice,
        imageUrl: product.imagePath ? signedImageUrl(product.imagePath) : null,
      }))),
      tables,
      waiters: employees,
    };
  });
}
