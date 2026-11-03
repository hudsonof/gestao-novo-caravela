import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";
import { positiveMoney } from "@/lib/money";

const schema = z.object({ name: z.string().trim().min(2).max(120).optional(), description: z.string().trim().max(240).nullable().optional(), type: z.enum(["ENTRY", "TABLE", "BAR"]).optional(), basePrice: z.string().optional(), active: z.preprocess((value) => value === true || value === "true" ? true : value === false || value === "false" ? false : value, z.boolean()).optional() }).refine((v) => Object.keys(v).length > 0, "Informe ao menos um campo.");

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const actor = await requireManager();
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    const target = await prisma.posProduct.findUnique({ where: { id } });
    if (!target) throw new ApiError(404, "Produto não encontrado.");
    const price = input.basePrice ? positiveMoney(input.basePrice) : undefined;
    const updated = await prisma.$transaction(async (tx) => {
      const product = await tx.posProduct.update({ where: { id }, data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(price ? { basePrice: price } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      } });
      await tx.auditLog.create({ data: { actorId: actor.userId, entity: "PosProduct", entityId: id, action: input.active === undefined ? "UPDATE" : input.active ? "ACTIVATE" : "DEACTIVATE", before: { name: target.name, type: target.type, basePrice: target.basePrice.toFixed(2), active: target.active }, after: { name: product.name, type: product.type, basePrice: product.basePrice.toFixed(2), active: product.active } } });
      return product;
    });
    return updated;
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const actor = await requireManager();
    const { id } = await context.params;
    return prisma.$transaction(async (tx) => {
      const product = await tx.posProduct.findUnique({ where: { id }, include: { _count: { select: { eventPrices: true, orderItems: true } } } });
      if (!product) throw new ApiError(404, "Produto não encontrado.");
      if (product._count.eventPrices || product._count.orderItems) throw new ApiError(409, "Produto possui histórico ou preços por evento; inative-o.");
      await tx.auditLog.create({ data: { actorId: actor.userId, entity: "PosProduct", entityId: id, action: "DELETE", before: { name: product.name, type: product.type } } });
      await tx.posProduct.delete({ where: { id } });
      return { id };
    });
  });
}
