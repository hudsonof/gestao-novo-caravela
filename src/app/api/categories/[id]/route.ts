import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";

const schema = z.object({ name: z.string().trim().min(2).max(80).optional(), active: z.preprocess((value) => value === "true" ? true : value === "false" ? false : value, z.boolean()).optional() })
  .refine((value) => Object.keys(value).length > 0, "Informe um campo para atualizar.");

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const actor = await requireManager();
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "FinanceCategory" WHERE "id" = ${id} FOR UPDATE`;
      const current = await tx.financeCategory.findUnique({ where: { id } });
      if (!current) throw new ApiError(404, "Categoria não encontrada.");
      if (input.name && input.name !== current.name) {
        const duplicate = await tx.financeCategory.findUnique({ where: { name_type: { name: input.name, type: current.type } } });
        if (duplicate) throw new ApiError(409, "Já existe uma categoria com esse nome e tipo.");
      }
      const updated = await tx.financeCategory.update({ where: { id }, data: input });
      await tx.auditLog.create({ data: { actorId: actor.userId, entity: "FinanceCategory", entityId: id, action: input.active === undefined ? "UPDATE" : input.active ? "ACTIVATE" : "DEACTIVATE", before: { name: current.name, type: current.type, active: current.active }, after: { name: updated.name, type: updated.type, active: updated.active } } });
      return updated;
    });
  });
}
