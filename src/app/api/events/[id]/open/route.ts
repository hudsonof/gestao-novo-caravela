import { prisma } from "@/lib/db";
import { handleApi, ApiError } from "@/lib/http";
import { requireManager } from "@/lib/authorization";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const actor = await requireManager();
    const { id } = await context.params;
    const event = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Event" WHERE "id" = ${id} FOR UPDATE`;
      const current = await tx.event.findUnique({ where: { id } });
      if (!current) throw new ApiError(404, "Evento não encontrado.");
      if (current.status !== "PLANNED") throw new ApiError(409, "Somente eventos planejados podem ser abertos.");
      const updated = await tx.event.update({ where: { id }, data: { status: "OPEN" } });
      await tx.auditLog.create({ data: { actorId: actor.userId, entity: "Event", entityId: id, action: "OPEN", before: { status: current.status }, after: { status: updated.status } } });
      return updated;
    });
    return event;
  });
}
