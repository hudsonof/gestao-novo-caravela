import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { money } from "@/lib/money";

export async function closeCashSession(sessionId: string, countedAmount: string, actorId: string, justification?: string) {
  const counted = money(countedAmount);
  if (counted.lessThan(0)) throw new Error("Contagem inválida");
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{id: string}>>`SELECT id FROM "CashSession" WHERE id = ${sessionId} FOR UPDATE`;
    if (!rows.length) throw new Error("Caixa não encontrado");
    const session = await tx.cashSession.findUniqueOrThrow({ where: { id: sessionId }, include: { account: true } });
    if (session.status !== "OPEN") throw new Error("Caixa já fechado");
    const difference = counted.minus(session.account.balance);
    if (!difference.isZero() && !justification?.trim()) throw new Error("Justificativa obrigatória para divergência");
    const closing = await tx.cashClosing.create({ data: {
      sessionId, expectedAmount: session.account.balance, countedAmount: counted,
      difference, closedById: actorId, justification,
    }});
    await tx.cashSession.update({ where: { id: sessionId }, data: { status: "CLOSED", closedAt: new Date() } });
    await tx.auditLog.create({ data: { actorId, entity: "CashClosing", entityId: closing.id, action: "CLOSE" } });
    // Divergence is recorded, never silently applied to the balance.
    return closing;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
