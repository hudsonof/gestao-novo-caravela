import { prisma } from "@/lib/db";
import { handleApi } from "@/lib/http";
import { requirePosUser } from "@/lib/pos-auth";

export async function GET() {
  return handleApi(async () => {
    const user = await requirePosUser();
    return prisma.event.findMany({
      where: {
        status: "OPEN",
        sessions: { some: { registerId: user.cashRegisterId, status: "OPEN" } },
      },
      select: { id: true, name: true, startsAt: true, endsAt: true },
      orderBy: { startsAt: "asc" },
    });
  });
}
