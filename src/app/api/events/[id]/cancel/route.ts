import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";

const schema = z.object({ reason: z.string().trim().min(3).max(500) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const actor = await requireManager();
    const { id } = await context.params;
    const { reason } = schema.parse(await request.json());
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Event" WHERE "id" = ${id} FOR UPDATE`;
      const event = await tx.event.findUnique({ where: { id }, include: { _count: { select: { sessions: true, entries: true, expenses: true, compensations: true } } } });
      if (!event) throw new ApiError(404, "Evento não encontrado.");
      if (event.status === "CANCELLED") return event;
      if (event.status !== "PLANNED") throw new ApiError(409, "Somente eventos planejados podem ser cancelados.");
      if (event._count.sessions + event._count.entries + event._count.expenses + event._count.compensations > 0) {
        throw new ApiError(409, "Este evento já possui histórico operacional ou financeiro e não pode ser cancelado.");
      }
      const updated = await tx.event.update({ where: { id }, data: { status: "CANCELLED" } });
      await tx.auditLog.create({ data: { actorId: actor.userId, entity: "Event", entityId: id, action: "CANCEL", before: { status: event.status }, after: { status: updated.status, reason } } });
      return updated;
    });
  });
}
