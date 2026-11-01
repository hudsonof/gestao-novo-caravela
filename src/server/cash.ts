import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { money } from "@/lib/money";
import { postEntryTx } from "@/server/ledger";

export type OpenCashSessionInput = {
  eventId: string;
  registerId: string;
  employeeId?: string;
  openingFloat: string;
  actorId: string;
  idempotencyKey: string;
};

export async function openCashSession(input: OpenCashSessionInput) {
  const openingFloat = money(input.openingFloat);
  if (openingFloat.lessThan(0)) throw new ApiError(400, "O fundo de troco não pode ser negativo.");
  if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 128) throw new ApiError(400, "Chave de idempotência obrigatória (máximo 128 caracteres).");

  return prisma.$transaction(
    async (tx) => {
      const repeated = await tx.cashSession.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: { register: true, event: true, account: true },
      });
      if (repeated) {
        const same = repeated.eventId === input.eventId && repeated.registerId === input.registerId &&
          repeated.employeeId === (input.employeeId || null) && repeated.openingFloat.equals(openingFloat);
        if (!same) throw new ApiError(409, "A chave de idempotência já foi usada para abrir outra sessão.");
        return repeated;
      }

      await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "CashRegister" WHERE "id" = ${input.registerId} FOR UPDATE`;
      const register = await tx.cashRegister.findUnique({ where: { id: input.registerId } });
      if (!register || !register.active) throw new ApiError(404, "Caixa não encontrado ou inativo.");
      await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Event" WHERE "id" = ${input.eventId} FOR UPDATE`;
      const event = await tx.event.findUnique({ where: { id: input.eventId } });
      if (!event || event.status !== "OPEN") throw new ApiError(409, "Abra o evento antes de abrir um caixa.");
      if (input.employeeId) {
        await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Employee" WHERE "id" = ${input.employeeId} FOR UPDATE`;
        const employee = await tx.employee.findUnique({ where: { id: input.employeeId } });
        if (!employee || !employee.active) throw new ApiError(404, "Colaborador não encontrado ou inativo.");
      }
      const open = await tx.cashSession.findFirst({
        where: { registerId: input.registerId, status: "OPEN" },
        select: { id: true },
      });
      if (open) throw new ApiError(409, "Este caixa já possui uma sessão aberta.");

      const fund = await tx.financialAccount.findFirst({
        where: { kind: "FUND", active: true },
        orderBy: { createdAt: "asc" },
      });
      if (!fund && openingFloat.greaterThan(0)) throw new ApiError(409, "Fundo central de troco não está configurado.");

      const accountId = randomUUID();
      const account = await tx.financialAccount.create({
        data: {
          id: accountId,
          name: register.name + " · " + new Date().toISOString() + " · " + accountId.slice(0, 8),
          kind: "CASH",
        },
      });
      const session = await tx.cashSession.create({
        data: {
          eventId: input.eventId,
          registerId: input.registerId,
          accountId: account.id,
          employeeId: input.employeeId,
          openedById: input.actorId,
          idempotencyKey: input.idempotencyKey,
          openingFloat,
        },
      });

      if (openingFloat.greaterThan(0) && fund) {
        await postEntryTx(tx, {
          debitAccountId: fund.id,
          creditAccountId: account.id,
          amount: openingFloat.toFixed(2),
          description: "Distribuição de fundo de troco para " + register.name,
          idempotencyKey: input.idempotencyKey + ":troco",
          actorId: input.actorId,
          eventId: event.id,
          sessionId: session.id,
          kind: "TRANSFER",
          method: "CASH",
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          entity: "CashSession",
          entityId: session.id,
          action: "OPEN",
          after: { registerId: register.id, eventId: event.id, openingFloat: openingFloat.toFixed(2) },
        },
      });

      return tx.cashSession.findUniqueOrThrow({
        where: { id: session.id },
        include: { register: true, event: true, account: true, employee: true },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 },
  );
}

export async function closeCashSession(
  sessionId: string,
  countedAmount: string,
  actorId: string,
  justification?: string,
) {
  const counted = money(countedAmount);
  if (counted.lessThan(0)) throw new ApiError(400, "A contagem não pode ser negativa.");

  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "CashSession" WHERE "id" = ${sessionId} FOR UPDATE`;
      const session = await tx.cashSession.findUnique({
        where: { id: sessionId },
        include: { account: true, register: true, event: true, closing: true },
      });
      if (!session) throw new ApiError(404, "Sessão de caixa não encontrada.");
      if (session.status === "CLOSED" && session.closing) return session.closing;

      const expected = session.account.balance;
      const difference = counted.minus(expected);
      if (!difference.isZero() && !justification?.trim()) {
        throw new ApiError(400, "Informe a justificativa para a divergência de caixa.");
      }

      if (!difference.isZero()) {
        const external = await tx.financialAccount.findFirst({ where: { kind: "EXTERNAL", active: true }, orderBy: { createdAt: "asc" } });
        if (!external) throw new ApiError(409, "Conta de contrapartida externa não está configurada.");
        await postEntryTx(tx, {
          debitAccountId: difference.isNegative() ? session.accountId : external.id,
          creditAccountId: difference.isNegative() ? external.id : session.accountId,
          amount: difference.abs().toFixed(2),
          description: "Ajuste de divergência no fechamento: " + justification!.trim(),
          idempotencyKey: "cash-closing:" + sessionId + ":adjustment",
          actorId,
          eventId: session.eventId,
          sessionId,
          kind: "ADJUSTMENT",
          method: "CASH",
          category: "Divergência de fechamento",
        });
      }

      const closing = await tx.cashClosing.create({
        data: {
          sessionId,
          expectedAmount: expected,
          countedAmount: counted,
          difference,
          justification: justification?.trim() || null,
          closedById: actorId,
        },
      });
      await tx.cashSession.update({
        where: { id: sessionId },
        data: { status: "CLOSED", closedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          entity: "CashClosing",
          entityId: closing.id,
          action: "CLOSE",
          before: { status: "OPEN", expectedAmount: expected.toFixed(2) },
          after: { status: "CLOSED", countedAmount: counted.toFixed(2), difference: difference.toFixed(2) },
        },
      });
      return closing;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 },
  );
}
