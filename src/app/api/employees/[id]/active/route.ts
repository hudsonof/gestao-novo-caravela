import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";

const schema = z.object({ active: z.preprocess((value) => value === true || value === "true", z.boolean()) });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const actor = await requireManager();
    const { id } = await context.params;
    const { active } = schema.parse(await request.json());
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Employee" WHERE "id" = ${id} FOR UPDATE`;
      const employee = await tx.employee.findUnique({ where: { id } });
      if (!employee) throw new ApiError(404, "Colaborador não encontrado.");
      if (!active) {
        const openSessions = await tx.cashSession.count({ where: { employeeId: id, status: "OPEN" } });
        if (openSessions) throw new ApiError(409, "Feche as sessões atribuídas antes de inativar o colaborador.");
      }
      const updated = await tx.employee.update({ where: { id }, data: { active } });
      await tx.auditLog.create({ data: { actorId: actor.userId, entity: "Employee", entityId: id, action: active ? "ACTIVATE" : "DEACTIVATE", before: { active: employee.active }, after: { active } } });
      return updated;
    });
  });
}
