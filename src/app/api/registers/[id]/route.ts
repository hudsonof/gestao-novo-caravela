import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  sector: z.enum(["TICKETS", "TABLES", "BAR"]).optional(),
  active: z.preprocess((value) => value === "true" ? true : value === "false" ? false : value, z.boolean()).optional(),
}).refine((value) => Object.keys(value).length > 0, "Informe ao menos um campo para atualizar.");

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const actor = await requireManager();
    const { id } = await context.params;
    const input = updateSchema.parse(await request.json());
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "CashRegister" WHERE "id" = ${id} FOR UPDATE`;
      const current = await tx.cashRegister.findUnique({ where: { id }, include: { _count: { select: { sessions: true } } } });
      if (!current) throw new ApiError(404, "Caixa não encontrado.");
      if (input.active === false) {
        const openSessions = await tx.cashSession.count({ where: { registerId: id, status: "OPEN" } });
        if (openSessions) throw new ApiError(409, "Feche as sessões abertas antes de inativar este caixa.");
      }
      const changedIdentity = (input.name && input.name !== current.name) || (input.sector && input.sector !== current.sector);
      if (changedIdentity && current._count.sessions > 0) {
        throw new ApiError(409, "Caixas com histórico não podem mudar de nome ou setor. Inative este e cadastre outro para preservar os relatórios.");
      }
      if (input.name && input.name !== current.name) {
        const duplicate = await tx.cashRegister.findUnique({ where: { name: input.name }, select: { id: true } });
        if (duplicate) throw new ApiError(409, "Já existe um caixa com esse nome.");
      }
      const updated = await tx.cashRegister.update({ where: { id }, data: input });
      await tx.auditLog.create({ data: {
        actorId: actor.userId,
        entity: "CashRegister",
        entityId: id,
        action: input.active !== undefined ? (input.active ? "ACTIVATE" : "DEACTIVATE") : "UPDATE",
        before: { name: current.name, sector: current.sector, active: current.active },
        after: { name: updated.name, sector: updated.sector, active: updated.active },
      } });
      return updated;
    });
  });
}
