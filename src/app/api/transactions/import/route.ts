import { z } from "zod";
import { handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";
import { registerSale } from "@/server/finance";

const schema = z.object({
  source: z.enum(["MANUAL_IMPORT", "STONE"]),
  externalReference: z.string().trim().min(1).max(110),
  amount: z.string(),
  description: z.string().trim().min(2).max(240),
  method: z.enum(["CASH", "PIX", "DEBIT", "CREDIT", "BANK_TRANSFER"]),
  category: z.string().trim().max(100).optional(),
  eventId: z.string().optional().or(z.literal("")),
  sessionId: z.string().optional().or(z.literal("")),
});

export async function POST(request: Request) {
  return handleApi(async () => {
    const actor = await requireManager();
    const data = schema.parse(await request.json());
    const idempotencyKey = request.headers.get("x-idempotency-key")?.trim() || `${data.source}:${data.externalReference}`;
    return registerSale({
      ...data,
      eventId: data.eventId || undefined,
      sessionId: data.sessionId || undefined,
      externalSource: data.source,
      externalReference: data.externalReference,
      idempotencyKey,
      actorId: actor.userId,
    });
  }, 201);
}
