import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";
import { registerAdjustment, registerSale } from "@/server/finance";

const base = { amount: z.string(), description: z.string().trim().min(2).max(240), idempotencyKey: z.string().optional() };
const saleSchema = z.object({
  kind: z.literal("SALE"),
  ...base,
  method: z.enum(["CASH", "PIX", "DEBIT", "CREDIT", "BANK_TRANSFER"]),
  category: z.string().trim().max(100).optional(),
  eventId: z.string().optional().or(z.literal("")),
  sessionId: z.string().optional().or(z.literal("")),
});
const adjustmentSchema = z.object({
  kind: z.literal("ADJUSTMENT"),
  accountId: z.string().min(1),
  direction: z.enum(["IN", "OUT"]),
  amount: z.string(),
  reason: z.string().trim().min(3).max(500),
  sessionId: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

export async function GET(request: Request) {
  return handleApi(async () => {
    await requireManager();
    const query = new URL(request.url).searchParams;
    const eventId = query.get("eventId") || undefined;
    const sessionId = query.get("sessionId") || undefined;
    return prisma.ledgerEntry.findMany({
      where: { ...(eventId ? { eventId } : {}), ...(sessionId ? { sessionId } : {}) },
      include: { debitAccount: true, creditAccount: true, createdBy: { select: { name: true } }, event: { select: { name: true } }, reversalOf: true, reversals: true },
      orderBy: { createdAt: "desc" },
      take: 300,
    });
  });
}

export async function POST(request: Request) {
  return handleApi(async () => {
    const actor = await requireManager();
    const raw = await request.json();
    if (raw && typeof raw === "object" && raw.kind === "SALE") {
      const data = saleSchema.parse(raw);
      const idempotencyKey = data.idempotencyKey?.trim() || request.headers.get("x-idempotency-key") || "";
      return registerSale({ ...data, eventId: data.eventId || undefined, sessionId: data.sessionId || undefined, idempotencyKey, actorId: actor.userId });
    }
    const data = adjustmentSchema.parse(raw);
    const idempotencyKey = data.idempotencyKey?.trim() || request.headers.get("x-idempotency-key") || "";
    return registerAdjustment({ ...data, idempotencyKey, actorId: actor.userId });
  }, 201);
}
