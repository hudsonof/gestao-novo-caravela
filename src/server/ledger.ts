import { EntryKind, PaymentMethod, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { positiveMoney } from "@/lib/money";

export type PostEntryInput = {
  debitAccountId: string;
  creditAccountId: string;
  amount: string;
  description: string;
  idempotencyKey: string;
  actorId: string;
  eventId?: string;
  sessionId?: string;
  kind: EntryKind;
  method?: PaymentMethod;
  category?: string;
  reversalOfId?: string;
};

export async function postEntryTx(tx: Prisma.TransactionClient, input: PostEntryInput) {
  if (input.debitAccountId === input.creditAccountId) throw new ApiError(400, "As contas de origem e destino devem ser diferentes.");
  if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 128 || !input.actorId || !input.description.trim()) {
    throw new ApiError(400, "Informe chave de idempotência (até 128 caracteres), responsável e descrição.");
  }
  const amount = positiveMoney(input.amount);
  const existing = await tx.ledgerEntry.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    const samePayload =
      existing.debitAccountId === input.debitAccountId &&
      existing.creditAccountId === input.creditAccountId &&
      existing.amount.equals(amount) &&
      existing.description === input.description.trim() &&
      existing.kind === input.kind &&
      existing.method === (input.method ?? null) &&
      existing.eventId === (input.eventId ?? null) &&
      existing.sessionId === (input.sessionId ?? null) &&
      existing.category === (input.category?.trim() || null);
    if (!samePayload) throw new ApiError(409, "A chave de idempotência já foi usada em outra operação.");
    return existing;
  }

  const ids = [input.debitAccountId, input.creditAccountId].sort();
  await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "FinancialAccount" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`;
  const accounts = await tx.financialAccount.findMany({ where: { id: { in: ids }, active: true } });
  if (accounts.length !== 2) throw new ApiError(404, "Conta financeira não encontrada ou inativa.");

  const debit = accounts.find((account) => account.id === input.debitAccountId);
  if (!debit) throw new ApiError(404, "Conta de origem não encontrada.");
  if (debit.kind !== "EXTERNAL" && debit.balance.lessThan(amount)) {
    throw new ApiError(409, "Saldo insuficiente na conta de origem.");
  }

  await tx.financialAccount.update({
    where: { id: input.debitAccountId },
    data: { balance: { decrement: amount } },
  });
  await tx.financialAccount.update({
    where: { id: input.creditAccountId },
    data: { balance: { increment: amount } },
  });

  const entry = await tx.ledgerEntry.create({
    data: {
      debitAccountId: input.debitAccountId,
      creditAccountId: input.creditAccountId,
      amount,
      description: input.description.trim(),
      idempotencyKey: input.idempotencyKey,
      createdById: input.actorId,
      kind: input.kind,
      method: input.method,
      category: input.category?.trim() || undefined,
      eventId: input.eventId,
      sessionId: input.sessionId,
      reversalOfId: input.reversalOfId,
    },
  });

  await tx.auditLog.create({
    data: {
      actorId: input.actorId,
      entity: "LedgerEntry",
      entityId: entry.id,
      action: "CREATE",
      after: {
        kind: entry.kind,
        amount: amount.toFixed(2),
        debitAccountId: entry.debitAccountId,
        creditAccountId: entry.creditAccountId,
        idempotencyKey: entry.idempotencyKey,
      },
    },
  });
  return entry;
}

export type TransferInput = {
  debitAccountId: string;
  creditAccountId: string;
  amount: string;
  description: string;
  idempotencyKey: string;
  actorId: string;
  eventId?: string;
  sessionId?: string;
  method?: PaymentMethod;
};

export async function postTransfer(input: TransferInput) {
  return prisma.$transaction(
    async (tx) => {
      const accounts = await tx.financialAccount.findMany({
        where: { id: { in: [input.debitAccountId, input.creditAccountId] }, active: true },
      });
      if (accounts.some((account) => account.kind === "EXTERNAL")) {
        throw new ApiError(400, "Transferências internas não podem usar a conta externa.");
      }
      return postEntryTx(tx, { ...input, kind: "TRANSFER" });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 },
  );
}
