import { prisma } from "@/lib/db";
import { handleApi, ApiError } from "@/lib/http";
import { requireManager } from "@/lib/authorization";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const actor = await requireManager();
    const { id } = await context.params;
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Event" WHERE "id" = ${id} FOR UPDATE`;
      const event = await tx.event.findUnique({ where: { id } });
      if (!event) throw new ApiError(404, "Evento não encontrado.");
      if (event.status !== "OPEN" && event.status !== "CLOSING") throw new ApiError(409, "Evento não está aberto para encerramento.");
      const openSessions = await tx.cashSession.count({ where: { eventId: id, status: "OPEN" } });
      if (openSessions) throw new ApiError(409, "Encerre todas as sessões de caixa antes de encerrar o evento.");
      const unsettledSessions = await tx.cashSession.findMany({ where: { eventId: id, status: "CLOSED", account: { balance: { gt: 0 } } }, include: { register: true } });
      if (unsettledSessions.length) throw new ApiError(409, "Transfira o saldo de cada caixa fechado para o cofre antes de encerrar o evento.");
      const updated = await tx.event.update({ where: { id }, data: { status: "CLOSED" } });
      await tx.auditLog.create({ data: { actorId: actor.userId, entity: "Event", entityId: id, action: "CLOSE", before: { status: event.status }, after: { status: updated.status } } });
      return updated;
    });
  });
}
