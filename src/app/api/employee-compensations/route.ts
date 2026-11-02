import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";
import { createEmployeeCompensation } from "@/server/finance";

const schema = z.object({
  employeeId: z.string().min(1),
  eventId: z.string().optional().or(z.literal("")),
  type: z.enum(["DAILY", "CACHE"]),
  description: z.string().trim().min(2).max(240),
  amount: z.string(),
  dueDate: z.coerce.date(),
  idempotencyKey: z.string().optional(),
});

export async function GET() {
  return handleApi(async () => {
    await requireManager();
    return prisma.employeeCompensation.findMany({
      include: { employee: true, event: { select: { name: true } }, payments: { include: { entry: { include: { reversals: true } } } } },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 500,
    });
  });
}

export async function POST(request: Request) {
  return handleApi(async () => {
    const actor = await requireManager();
    const data = schema.parse(await request.json());
    const idempotencyKey = data.idempotencyKey?.trim() || request.headers.get("x-idempotency-key") || "";
    return createEmployeeCompensation({ ...data, eventId: data.eventId || undefined, idempotencyKey, actorId: actor.userId });
  }, 201);
}
