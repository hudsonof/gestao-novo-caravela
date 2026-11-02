import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";

const eventPatchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.preprocess((value) => value === "" ? null : value, z.coerce.date().nullable()).optional(),
  responsibleName: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
}).refine((data) => Object.keys(data).length > 0, "Informe ao menos um campo para atualizar.");

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const actor = await requireManager();
    const { id } = await context.params;
    const input = eventPatchSchema.parse(await request.json());
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Event" WHERE "id" = ${id} FOR UPDATE`;
      const current = await tx.event.findUnique({ where: { id }, include: { _count: { select: { sessions: true, entries: true, expenses: true, compensations: true } } } });
      if (!current) throw new ApiError(404, "Evento não encontrado.");
      if (current.status !== "PLANNED") throw new ApiError(409, "Só é possível editar eventos planejados.");
      if (current._count.sessions + current._count.entries + current._count.expenses + current._count.compensations > 0) {
        throw new ApiError(409, "Este evento já possui histórico operacional ou financeiro e não pode ser alterado.");
      }
      const startsAt = input.startsAt ?? current.startsAt;
      const endsAt = input.endsAt === undefined ? current.endsAt : input.endsAt;
      if (endsAt && endsAt.getTime() < startsAt.getTime()) throw new ApiError(400, "A data final deve ser posterior à inicial.");
      const updated = await tx.event.update({ where: { id }, data: input });
      await tx.auditLog.create({ data: {
        actorId: actor.userId,
        entity: "Event",
        entityId: id,
        action: "UPDATE",
        before: { name: current.name, startsAt: current.startsAt.toISOString(), endsAt: current.endsAt?.toISOString() ?? null, responsibleName: current.responsibleName, notes: current.notes },
        after: { name: updated.name, startsAt: updated.startsAt.toISOString(), endsAt: updated.endsAt?.toISOString() ?? null, responsibleName: updated.responsibleName, notes: updated.notes },
      } });
      return updated;
    });
  });
}
