import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";

const schema = z.object({ name: z.string().trim().min(1).max(80).optional(), active: z.boolean().optional() }).refine((v) => Object.keys(v).length > 0, "Informe um campo.");

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const actor = await requireManager();
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    return prisma.$transaction(async (tx) => {
      const table = await tx.posTable.findUnique({ where: { id } });
      if (!table) throw new ApiError(404, "Mesa não encontrada.");
      const updated = await tx.posTable.update({ where: { id }, data: input });
      await tx.auditLog.create({ data: { actorId: actor.userId, entity: "PosTable", entityId: id, action: input.active === undefined ? "UPDATE" : input.active ? "ACTIVATE" : "DEACTIVATE", before: { name: table.name, active: table.active }, after: { name: updated.name, active: updated.active } } });
      return updated;
    });
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const actor = await requireManager();
    const { id } = await context.params;
    return prisma.$transaction(async (tx) => {
      const table = await tx.posTable.findUnique({ where: { id }, include: { _count: { select: { orders: true } } } });
      if (!table) throw new ApiError(404, "Mesa não encontrada.");
      if (table._count.orders) throw new ApiError(409, "Mesa possui pedidos associados; inative-a.");
      await tx.auditLog.create({ data: { actorId: actor.userId, entity: "PosTable", entityId: id, action: "DELETE", before: { name: table.name } } });
      await tx.posTable.delete({ where: { id } });
      return { id };
    });
  });
}
