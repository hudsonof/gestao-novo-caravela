import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";
import { prepareDeposit } from "@/server/finance";

const schema = z.object({ amount: z.string(), description: z.string().trim().max(240).optional(), idempotencyKey: z.string().optional() });

export async function GET() {
  return handleApi(async () => {
    await requireManager();
    return prisma.deposit.findMany({ include: { withdrawal: true, confirmation: true, createdBy: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 300 });
  });
}

export async function POST(request: Request) {
  return handleApi(async () => {
    const actor = await requireManager();
    const data = schema.parse(await request.json());
    const idempotencyKey = data.idempotencyKey?.trim() || request.headers.get("x-idempotency-key") || "";
    return prepareDeposit({ ...data, idempotencyKey, actorId: actor.userId });
  }, 201);
}
