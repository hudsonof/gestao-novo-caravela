import { z } from "zod";
import { handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";
import { payExpense } from "@/server/finance";

const schema = z.object({
  expenseId: z.string().min(1),
  amount: z.string(),
  sourceAccountId: z.string().min(1),
  method: z.enum(["CASH", "PIX", "DEBIT", "CREDIT", "BANK_TRANSFER"]),
  description: z.string().trim().max(240).optional(),
  idempotencyKey: z.string().optional(),
});

export async function POST(request: Request) {
  return handleApi(async () => {
    const actor = await requireManager();
    const data = schema.parse(await request.json());
    const idempotencyKey = data.idempotencyKey?.trim() || request.headers.get("x-idempotency-key") || "";
    return payExpense({ ...data, idempotencyKey, actorId: actor.userId });
  }, 201);
}
