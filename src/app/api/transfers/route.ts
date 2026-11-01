import { z } from "zod";
import { handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";
import { transferAccounts } from "@/server/finance";

const schema = z.object({
  sourceAccountId: z.string().min(1),
  destinationAccountId: z.string().min(1),
  amount: z.string(),
  description: z.string().trim().min(3).max(240),
  eventId: z.string().optional().or(z.literal("")),
  sessionId: z.string().optional().or(z.literal("")),
  method: z.enum(["CASH", "PIX", "DEBIT", "CREDIT", "BANK_TRANSFER"]).optional(),
  idempotencyKey: z.string().optional(),
});

export async function POST(request: Request) {
  return handleApi(async () => {
    const actor = await requireManager();
    const data = schema.parse(await request.json());
    const idempotencyKey = data.idempotencyKey?.trim() || request.headers.get("x-idempotency-key") || "";
    return transferAccounts({ ...data, eventId: data.eventId || undefined, sessionId: data.sessionId || undefined, idempotencyKey, actorId: actor.userId });
  }, 201);
}
