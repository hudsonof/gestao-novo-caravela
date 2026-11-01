import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";
import { openCashSession } from "@/server/cash";

const schema = z.object({
  eventId: z.string().min(1),
  registerId: z.string().min(1),
  employeeId: z.string().optional().or(z.literal("")),
  openingFloat: z.string(),
  idempotencyKey: z.string().optional(),
});

export async function GET(request: Request) {
  return handleApi(async () => {
    await requireManager();
    const status = new URL(request.url).searchParams.get("status");
    return prisma.cashSession.findMany({
      where: status === "OPEN" || status === "CLOSED" ? { status } : undefined,
      include: { register: true, account: true, event: true, employee: true, closing: true },
      orderBy: { openedAt: "desc" },
      take: 200,
    });
  });
}

export async function POST(request: Request) {
  return handleApi(async () => {
    const actor = await requireManager();
    const data = schema.parse(await request.json());
    const idempotencyKey = data.idempotencyKey?.trim() || request.headers.get("x-idempotency-key") || "";
    return openCashSession({ ...data, employeeId: data.employeeId || undefined, idempotencyKey, actorId: actor.userId });
  }, 201);
}
