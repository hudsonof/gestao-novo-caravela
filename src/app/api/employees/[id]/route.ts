import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  position: z.string().trim().max(100).optional(),
}).refine((input) => Object.keys(input).length > 0, "Informe ao menos um campo para atualizar.");

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const actor = await requireManager();
    const { id } = await context.params;
    const input = updateSchema.parse(await request.json());

    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Employee" WHERE "id" = ${id} FOR UPDATE`;
      const employee = await tx.employee.findUnique({ where: { id } });
      if (!employee) throw new ApiError(404, "Colaborador não encontrado.");

      const updated = await tx.employee.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.position !== undefined ? { position: input.position || null } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          entity: "Employee",
          entityId: id,
          action: "UPDATE",
          before: { name: employee.name, position: employee.position },
          after: { name: updated.name, position: updated.position },
        },
      });
      return updated;
    });
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const actor = await requireManager();
    const { id } = await context.params;

    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Employee" WHERE "id" = ${id} FOR UPDATE`;
      const employee = await tx.employee.findUnique({
        where: { id },
        include: { _count: { select: { sessions: true, compensations: true } } },
      });
      if (!employee) throw new ApiError(404, "Colaborador não encontrado.");
      if (employee._count.sessions > 0 || employee._count.compensations > 0) {
        throw new ApiError(409, "Este colaborador possui sessões ou diárias vinculadas. Inative-o para preservar o histórico.");
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          entity: "Employee",
          entityId: id,
          action: "DELETE",
          before: { name: employee.name, position: employee.position },
        },
      });
      await tx.employee.delete({ where: { id } });
      return { id };
    });
  });
}
