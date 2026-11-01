import { z } from "zod";
import { handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";
import { cancelExpense } from "@/server/finance";

const schema = z.object({ reason: z.string().trim().min(3).max(500) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const actor = await requireManager();
    const { id } = await context.params;
    const data = schema.parse(await request.json());
    return cancelExpense({ expenseId: id, reason: data.reason, actorId: actor.userId });
  });
}
