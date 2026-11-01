import { EntryKind, PaymentMethod, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { positiveMoney } from "@/lib/money";

export type TransferInput = {
  debitAccountId: string;
  creditAccountId: string;
  amount: string;
  description: string;
  idempotencyKey: string;
  actorId: string;
  eventId?: string;
  kind?: EntryKind;
  method?: PaymentMethod;
};

// A movement is atomic and idempotent. It does NOT automatically count as revenue.
// Account ordering ensures concurrent opposite-direction transfers cannot deadlock.
export async function postTransfer(input: TransferInput) {
  if (input.debitAccountId === input.creditAccountId) throw new Error("Contas devem ser diferentes");
  if (!input.idempotencyKey || !input.actorId || !input.description.trim()) throw new Error("Dados obrigatórios ausentes");
  const amount = positiveMoney(input.amount);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.ledgerEntry.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return existing;
    // PostgreSQL serializes updates by row lock, preventing lost balances.
    const ids = [input.debitAccountId, input.creditAccountId].sort();
    await tx.$queryRaw`SELECT id FROM "FinancialAccount" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
    const accounts = await tx.financialAccount.findMany({ where: { id: { in: ids } } });
    if (accounts.length !== 2) throw new Error("Conta não encontrada");
    const debit = accounts.find((a) => a.id === input.debitAccountId)!;
    // EXTERNAL accounts represent off-ledger counterparties and may go negative.
    if (debit.kind !== "EXTERNAL" && debit.balance.lessThan(amount)) throw new Error("Saldo insuficiente");
    await tx.financialAccount.update({ where: { id: debit.id }, data: { balance: { decrement: amount } } });
    await tx.financialAccount.update({ where: { id: input.creditAccountId }, data: { balance: { increment: amount } } });
    const entry = await tx.ledgerEntry.create({ data: {
      debitAccountId: input.debitAccountId, creditAccountId: input.creditAccountId,
      amount, description: input.description, idempotencyKey: input.idempotencyKey,
      createdById: input.actorId, kind: input.kind ?? "TRANSFER", method: input.method,
      eventId: input.eventId,
    }});
    await tx.auditLog.create({ data: { actorId: input.actorId, entity: "LedgerEntry", entityId: entry.id, action: "CREATE", after: { idempotencyKey: entry.idempotencyKey } } });
    return entry;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 });
}
