import { z } from "zod";
import { handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";
import { confirmDeposit } from "@/server/finance";

const schema = z.object({ bankAccountId: z.string().min(1), bankReference: z.string().trim().max(120).optional(), idempotencyKey: z.string().optional() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const actor = await requireManager();
    const { id } = await context.params;
    const data = schema.parse(await request.json());
    const idempotencyKey = data.idempotencyKey?.trim() || request.headers.get("x-idempotency-key") || "";
    return confirmDeposit({ ...data, depositId: id, idempotencyKey, actorId: actor.userId });
  });
}
