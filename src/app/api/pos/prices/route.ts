import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";
import { positiveMoney } from "@/lib/money";

const schema = z.object({ productId: z.string().min(1), eventId: z.string().min(1), price: z.string() });

export async function POST(request: Request) {
  return handleApi(async () => {
    const actor = await requireManager();
    const input = schema.parse(await request.json());
    const price = positiveMoney(input.price);
    return prisma.$transaction(async (tx) => {
      const product = await tx.posProduct.findUnique({ where: { id: input.productId } });
      const event = await tx.event.findUnique({ where: { id: input.eventId } });
      if (!product || !product.active) throw new ApiError(404, "Produto ativo não encontrado.");
      if (!event || event.status === "CANCELLED") throw new ApiError(404, "Evento não encontrado.");
      const previous = await tx.posProductPrice.findUnique({ where: { productId_eventId: { productId: input.productId, eventId: input.eventId } } });
      const record = await tx.posProductPrice.upsert({
        where: { productId_eventId: { productId: input.productId, eventId: input.eventId } },
        create: { productId: input.productId, eventId: input.eventId, price },
        update: { price },
      });
      await tx.auditLog.create({ data: { actorId: actor.userId, entity: "PosProductPrice", entityId: record.id, action: previous ? "UPDATE" : "CREATE", before: previous ? { price: previous.price.toFixed(2) } : undefined, after: { productId: input.productId, eventId: input.eventId, price: price.toFixed(2) } } });
      return record;
    });
  }, 201);
}
