import { z } from "zod";
import { handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";
import { cancelDeposit } from "@/server/finance";

const schema = z.object({ reason: z.string().trim().min(3).max(500), idempotencyKey: z.string().optional() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const actor = await requireManager();
    const { id } = await context.params;
    const data = schema.parse(await request.json());
    const idempotencyKey = data.idempotencyKey?.trim() || request.headers.get("x-idempotency-key") || "";
    return cancelDeposit({ depositId: id, reason: data.reason, idempotencyKey, actorId: actor.userId });
  });
}
