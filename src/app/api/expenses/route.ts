import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";
import { createExpense } from "@/server/finance";

const schema = z.object({
  description: z.string().trim().min(2).max(240),
  category: z.string().trim().min(2).max(100),
  supplier: z.string().trim().max(160).optional(),
  amount: z.string(),
  dueDate: z.coerce.date(),
  eventId: z.string().optional().or(z.literal("")),
  idempotencyKey: z.string().optional(),
});

export async function GET(request: Request) {
  return handleApi(async () => {
    await requireManager();
    const status = new URL(request.url).searchParams.get("status");
    return prisma.expense.findMany({
      where: status && ["OPEN", "PARTIAL", "PAID", "CANCELLED"].includes(status) ? { status: status as "OPEN" | "PARTIAL" | "PAID" | "CANCELLED" } : undefined,
      include: { event: { select: { name: true } }, payments: { include: { entry: { include: { debitAccount: true } } }, orderBy: { paidAt: "asc" } } },
      orderBy: { dueDate: "asc" },
      take: 300,
    });
  });
}

export async function POST(request: Request) {
  return handleApi(async () => {
    const actor = await requireManager();
    const data = schema.parse(await request.json());
    const idempotencyKey = data.idempotencyKey?.trim() || request.headers.get("x-idempotency-key") || "";
    return createExpense({ ...data, eventId: data.eventId || undefined, idempotencyKey, actorId: actor.userId });
  }, 201);
}
