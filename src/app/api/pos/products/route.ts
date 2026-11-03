import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";
import { positiveMoney } from "@/lib/money";

const schema = z.object({ name: z.string().trim().min(2).max(120), type: z.enum(["ENTRY", "TABLE", "BAR"]), description: z.string().trim().max(240).optional(), basePrice: z.string() });

export async function GET() {
  return handleApi(async () => {
    await requireManager();
    return prisma.posProduct.findMany({ include: { eventPrices: { include: { event: { select: { name: true } } } } }, orderBy: [{ type: "asc" }, { name: "asc" }] });
  });
}

export async function POST(request: Request) {
  return handleApi(async () => {
    const actor = await requireManager();
    const input = schema.parse(await request.json());
    const price = positiveMoney(input.basePrice);
    return prisma.$transaction(async (tx) => {
      const product = await tx.posProduct.create({ data: { name: input.name, type: input.type, description: input.description || null, basePrice: price } });
      await tx.auditLog.create({ data: { actorId: actor.userId, entity: "PosProduct", entityId: product.id, action: "CREATE", after: { name: product.name, type: product.type, basePrice: price.toFixed(2) } } });
      return product;
    });
  }, 201);
}
