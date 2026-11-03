import { prisma } from "@/lib/db";
import { handleApi, ApiError } from "@/lib/http";
import { requirePosDevice } from "@/lib/pos-auth";
import { productTypeForChannel } from "@/server/pos";

export async function GET(request: Request) {
  return handleApi(async () => {
    const device = await requirePosDevice(request);
    const eventId = new URL(request.url).searchParams.get("eventId");
    if (!eventId) throw new ApiError(400, "Informe o evento.");
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event || event.status !== "OPEN") throw new ApiError(409, "Evento inexistente ou fechado.");
    const session = await prisma.cashSession.findFirst({ where: { eventId, registerId: device.cashRegisterId, status: "OPEN" }, select: { id: true, openedAt: true, openingFloat: true, account: { select: { name: true, balance: true } } } });
    if (!session) throw new ApiError(409, "Não há sessão aberta para este terminal e evento.");
    const [products, tables, employees] = await Promise.all([
      prisma.posProduct.findMany({ where: { active: true, type: productTypeForChannel(device.profile) }, include: { eventPrices: { where: { eventId }, select: { price: true } } }, orderBy: { name: "asc" } }),
      device.profile === "WAITER" ? prisma.posTable.findMany({ where: { active: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
      device.profile === "WAITER" ? prisma.employee.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
    ]);
    return {
      device: { id: device.id, name: device.name, profile: device.profile, register: device.cashRegister.name },
      event: { id: event.id, name: event.name },
      session,
      products: products.map(({ eventPrices, ...product }) => ({ ...product, price: eventPrices[0]?.price || product.basePrice })),
      tables,
      waiters: employees,
    };
  });
}
