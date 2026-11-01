import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, handleApi } from "@/lib/http";
import { requireAdmin } from "@/lib/authorization";

const schema = z.object({ active: z.preprocess((value) => value === true || value === "true", z.boolean()) });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const actor = await requireAdmin();
    const { id } = await context.params;
    const { active } = schema.parse(await request.json());
    if (actor.userId === id && !active) throw new ApiError(409, "Não é possível desativar o próprio usuário.");
    return prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id } });
      if (!target) throw new ApiError(404, "Usuário não encontrado.");
      if (target.role === "ADMIN" && target.active && !active) {
        const activeAdmins = await tx.user.count({ where: { role: "ADMIN", active: true } });
        if (activeAdmins <= 1) throw new ApiError(409, "O sistema precisa manter ao menos um administrador ativo.");
      }
      const updated = await tx.user.update({ where: { id }, data: { active }, select: { id: true, name: true, email: true, role: true, active: true } });
      await tx.auditLog.create({ data: { actorId: actor.userId, entity: "User", entityId: id, action: active ? "ACTIVATE" : "DEACTIVATE", before: { active: target.active }, after: { active } } });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  });
}
