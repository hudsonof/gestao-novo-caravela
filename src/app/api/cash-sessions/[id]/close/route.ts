import { z } from "zod";
import { handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";
import { closeCashSession } from "@/server/cash";

const schema = z.object({ countedAmount: z.string(), justification: z.string().max(500).optional() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const actor = await requireManager();
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    return closeCashSession(id, input.countedAmount, actor.userId, input.justification);
  });
}
