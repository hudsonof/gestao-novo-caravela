import { EntryKind, PaymentMethod, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { money, positiveMoney } from "@/lib/money";
import { postEntryTx } from "@/server/ledger";

type ActorInput = { actorId: string };

async function findAccount(tx: Prisma.TransactionClient, kind: "FUND" | "VAULT" | "BANK" | "TRANSIT" | "EXTERNAL" | "RECEIVABLE") {
  const account = await tx.financialAccount.findFirst({
    where: { kind, active: true },
    orderBy: { createdAt: "asc" },
  });
  if (!account) throw new ApiError(409, "A conta financeira " + kind + " não está configurada.");
  return account;
}

async function lockOpenSession(tx: Prisma.TransactionClient, sessionId: string) {
  await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "CashSession" WHERE "id" = ${sessionId} FOR UPDATE`;
  const session = await tx.cashSession.findUnique({
    where: { id: sessionId },
    include: { account: true, event: true },
  });
  if (!session) throw new ApiError(404, "Sessão de caixa não encontrada.");
  if (session.status !== "OPEN") throw new ApiError(409, "A sessão de caixa já foi encerrada.");
  if (session.event.status !== "OPEN") throw new ApiError(409, "O evento não está aberto para movimentações.");
  return session;
}

export async function registerSale(input: {
  amount: string;
  method: PaymentMethod;
  description: string;
  category?: string;
  eventId?: string;
  sessionId?: string;
  idempotencyKey: string;
} & ActorInput) {
  const amount = positiveMoney(input.amount);
  return prisma.$transaction(
    async (tx) => {
      const prior = await tx.ledgerEntry.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (prior) {
        const same = prior.kind === "SALE" && prior.amount.equals(amount) && prior.method === input.method &&
          prior.description === input.description.trim() && prior.category === (input.category?.trim() || null) &&
          prior.sessionId === (input.sessionId || null) && (!input.eventId || prior.eventId === input.eventId);
        if (!same) throw new ApiError(409, "A chave de idempotência já foi usada em outra operação.");
        return prior;
      }
      let session: Awaited<ReturnType<typeof lockOpenSession>> | undefined;
      if (input.sessionId) session = await lockOpenSession(tx, input.sessionId);
      if (input.method === "CASH" && !session) throw new ApiError(400, "Venda em dinheiro exige uma sessão de caixa aberta.");
      if (session && input.eventId && session.eventId !== input.eventId) {
        throw new ApiError(400, "O evento informado não corresponde à sessão do caixa.");
      }
      const eventId = input.eventId || session?.eventId;
      if (eventId) {
        await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Event" WHERE "id" = ${eventId} FOR UPDATE`;
        const event = await tx.event.findUnique({ where: { id: eventId } });
        if (!event || event.status !== "OPEN") throw new ApiError(409, "O evento não está aberto para receber lançamentos.");
      }

      const external = await findAccount(tx, "EXTERNAL");
      const destination =
        input.method === "CASH"
          ? session!.account
          : await findAccount(tx, input.method === "PIX" || input.method === "BANK_TRANSFER" ? "BANK" : "RECEIVABLE");

      return postEntryTx(tx, {
        debitAccountId: external.id,
        creditAccountId: destination.id,
        amount: amount.toFixed(2),
        description: input.description,
        idempotencyKey: input.idempotencyKey,
        actorId: input.actorId,
        eventId,
        sessionId: session?.id,
        kind: "SALE",
        method: input.method,
        category: input.category,
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 },
  );
}

export async function transferAccounts(input: {
  sourceAccountId: string;
  destinationAccountId: string;
  amount: string;
  description: string;
  idempotencyKey: string;
  eventId?: string;
  sessionId?: string;
  method?: PaymentMethod;
} & ActorInput) {
  const amount = positiveMoney(input.amount);
  return prisma.$transaction(
    async (tx) => {
      const prior = await tx.ledgerEntry.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (prior) {
        const same = prior.kind === "TRANSFER" && prior.debitAccountId === input.sourceAccountId &&
          prior.creditAccountId === input.destinationAccountId && prior.amount.equals(amount) &&
          prior.description === input.description.trim() && prior.method === (input.method || "CASH") &&
          prior.sessionId === (input.sessionId || null) && (!input.eventId || prior.eventId === input.eventId);
        if (!same) throw new ApiError(409, "A chave de idempotência já foi usada em outra operação.");
        return prior;
      }
      let session: Awaited<ReturnType<typeof lockOpenSession>> | undefined;
      if (input.sessionId) {
        await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "CashSession" WHERE "id" = ${input.sessionId} FOR UPDATE`;
        const foundSession = await tx.cashSession.findUnique({ include: { account: true, event: true }, where: { id: input.sessionId } });
        if (!foundSession) throw new ApiError(404, "Sessão de caixa não encontrada.");
        session = foundSession;
        if (session.status === "OPEN" && session.event.status !== "OPEN") throw new ApiError(409, "O evento não está aberto para movimentações.");
        if (session.accountId !== input.sourceAccountId) {
          if (session.accountId !== input.destinationAccountId) throw new ApiError(400, "A sessão informada não pertence à origem nem ao destino da transferência.");
        }
      }
      const accounts = await tx.financialAccount.findMany({
        where: { id: { in: [input.sourceAccountId, input.destinationAccountId] }, active: true },
      });
      if (accounts.length !== 2 || accounts.some((account) => account.kind === "EXTERNAL")) {
        throw new ApiError(400, "Transferência entre contas internas inválida.");
      }
      const source = accounts.find((account) => account.id === input.sourceAccountId)!;
      const destination = accounts.find((account) => account.id === input.destinationAccountId)!;
      const hasCash = source.kind === "CASH" || destination.kind === "CASH";
      const physicalKinds = ["FUND", "VAULT", "CASH", "TRANSIT"];
      const method = input.method || "CASH";
      if (method === "CASH" && (!physicalKinds.includes(source.kind) || !physicalKinds.includes(destination.kind))) {
        throw new ApiError(400, "Transferências em dinheiro precisam envolver contas físicas.");
      }
      if (method !== "CASH" && (source.kind === "CASH" || destination.kind === "CASH" || source.kind === "FUND" || destination.kind === "FUND" || source.kind === "VAULT" || destination.kind === "VAULT")) {
        throw new ApiError(400, "Transferências eletrônicas não podem movimentar dinheiro físico.");
      }
      if (hasCash && !session) {
        throw new ApiError(400, "Transferências envolvendo caixa físico exigem a sessão aberta correspondente.");
      }
      if (hasCash && source.id !== session?.accountId && destination.id !== session?.accountId) {
        throw new ApiError(400, "A sessão informada não corresponde ao caixa físico da transferência.");
      }
      if (session && input.eventId && session.eventId !== input.eventId) throw new ApiError(400, "O evento informado não corresponde à sessão.");
      if (session?.status === "CLOSED" && (source.id !== session.accountId || destination.kind !== "VAULT")) {
        throw new ApiError(409, "Após o fechamento, o saldo do caixa só pode ser transferido para o cofre central.");
      }
      if (!hasCash && session) {
        throw new ApiError(400, "Informe uma sessão apenas para transferências ligadas a caixa físico.");
      }
      if (input.eventId) {
        await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Event" WHERE "id" = ${input.eventId} FOR UPDATE`;
        const event = await tx.event.findUnique({ where: { id: input.eventId } });
        if (!event || event.status !== "OPEN") throw new ApiError(409, "O evento não está aberto para transferências.");
      }
      return postEntryTx(tx, {
        debitAccountId: input.sourceAccountId,
        creditAccountId: input.destinationAccountId,
        amount: amount.toFixed(2),
        description: input.description,
        idempotencyKey: input.idempotencyKey,
        actorId: input.actorId,
        eventId: input.eventId || session?.eventId,
        sessionId: session?.id,
        kind: "TRANSFER",
        method,
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 },
  );
}

export async function registerAdjustment(input: {
  accountId: string;
  direction: "IN" | "OUT";
  amount: string;
  reason: string;
  idempotencyKey: string;
  sessionId?: string;
} & ActorInput) {
  const amount = positiveMoney(input.amount);
  if (!input.reason.trim()) throw new ApiError(400, "A justificativa do ajuste é obrigatória.");

  return prisma.$transaction(
    async (tx) => {
      const account = await tx.financialAccount.findUnique({ where: { id: input.accountId, active: true } });
      if (!account || account.kind === "EXTERNAL") throw new ApiError(400, "Conta de ajuste inválida.");
      const external = await findAccount(tx, "EXTERNAL");
      const incoming = input.direction === "IN";
      const prior = await tx.ledgerEntry.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (prior) {
        const same = prior.kind === "ADJUSTMENT" && prior.amount.equals(amount) &&
          prior.description === input.reason.trim() && prior.sessionId === (input.sessionId || null) &&
          prior.debitAccountId === (incoming ? external.id : account.id) &&
          prior.creditAccountId === (incoming ? account.id : external.id);
        if (!same) throw new ApiError(409, "A chave de idempotência já foi usada em outra operação.");
        return prior;
      }
      let session: Awaited<ReturnType<typeof lockOpenSession>> | undefined;
      if (input.sessionId) {
        session = await lockOpenSession(tx, input.sessionId);
        if (session.accountId !== input.accountId) throw new ApiError(400, "A sessão não corresponde à conta informada.");
      }
      if (account.kind === "CASH" && !session) throw new ApiError(400, "Ajuste em dinheiro exige a sessão aberta correspondente.");

      return postEntryTx(tx, {
        debitAccountId: incoming ? external.id : account.id,
        creditAccountId: incoming ? account.id : external.id,
        amount: amount.toFixed(2),
        description: input.reason,
        idempotencyKey: input.idempotencyKey,
        actorId: input.actorId,
        eventId: session?.eventId,
        sessionId: session?.id,
        kind: "ADJUSTMENT",
        method: "CASH",
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 },
  );
}

export async function createExpense(input: {
  description: string;
  category: string;
  supplier?: string;
  amount: string;
  dueDate: Date;
  eventId?: string;
  idempotencyKey: string;
} & ActorInput) {
  const amount = positiveMoney(input.amount);
  if (!input.description.trim() || !input.category.trim() || !input.idempotencyKey.trim() || input.idempotencyKey.length > 128) {
    throw new ApiError(400, "Descrição, categoria e chave de idempotência são obrigatórias.");
  }
  return prisma.$transaction(async (tx) => {
    const existing = await tx.expense.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) {
      const same = existing.description === input.description.trim() && existing.category === input.category.trim() &&
        existing.supplier === (input.supplier?.trim() || null) && existing.amount.equals(amount) &&
        existing.eventId === (input.eventId || null) && existing.dueDate.getTime() === input.dueDate.getTime();
      if (!same) throw new ApiError(409, "A chave de idempotência já foi usada em outra despesa.");
      return existing;
    }
    if (input.eventId) {
      const event = await tx.event.findUnique({ where: { id: input.eventId } });
      if (!event || event.status === "CANCELLED") throw new ApiError(404, "Evento não encontrado ou cancelado.");
    }
    const expense = await tx.expense.create({
      data: {
        description: input.description.trim(),
        category: input.category.trim(),
        supplier: input.supplier?.trim() || null,
        amount,
        dueDate: input.dueDate,
        eventId: input.eventId,
        idempotencyKey: input.idempotencyKey,
        createdById: input.actorId,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        entity: "Expense",
        entityId: expense.id,
        action: "CREATE",
        after: { amount: amount.toFixed(2), dueDate: input.dueDate.toISOString() },
      },
    });
    return expense;
  });
}

export async function cancelExpense(input: { expenseId: string; reason: string } & ActorInput) {
  if (!input.reason.trim()) throw new ApiError(400, "Informe o motivo do cancelamento da despesa.");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Expense" WHERE "id" = ${input.expenseId} FOR UPDATE`;
    const expense = await tx.expense.findUnique({ where: { id: input.expenseId }, include: { payments: true } });
    if (!expense) throw new ApiError(404, "Despesa não encontrada.");
    if (expense.status === "CANCELLED") return expense;
    if (expense.payments.length > 0) throw new ApiError(409, "Uma despesa com pagamentos deve ser corrigida por estorno antes de qualquer cancelamento.");
    const updated = await tx.expense.update({ where: { id: expense.id }, data: { status: "CANCELLED" } });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        entity: "Expense",
        entityId: expense.id,
        action: "CANCEL",
        before: { status: expense.status },
        after: { status: updated.status, reason: input.reason.trim() },
      },
    });
    return updated;
  });
}

export async function payExpense(input: {
  expenseId: string;
  amount: string;
  sourceAccountId: string;
  method: PaymentMethod;
  description?: string;
  idempotencyKey: string;
} & ActorInput) {
  const amount = positiveMoney(input.amount);
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Expense" WHERE "id" = ${input.expenseId} FOR UPDATE`;
      const expense = await tx.expense.findUnique({
        where: { id: input.expenseId },
        include: { payments: { include: { entry: { include: { reversals: true } } } } },
      });
      if (!expense) throw new ApiError(404, "Despesa não encontrada.");
      const repeatedPayment = expense.payments.find((payment) => payment.entry.idempotencyKey === input.idempotencyKey);
      if (repeatedPayment) {
        if (
          !repeatedPayment.amount.equals(amount) ||
          repeatedPayment.entry.debitAccountId !== input.sourceAccountId ||
          repeatedPayment.entry.method !== input.method ||
          repeatedPayment.entry.description !== (input.description?.trim() || "Pagamento: " + expense.description)
        ) throw new ApiError(409, "A chave de idempotência já foi usada em outro pagamento.");
        const alreadyPaid = expense.payments.reduce(
          (sum, payment) => sum.plus(payment.entry.reversals.length ? 0 : payment.amount),
          new Prisma.Decimal(0),
        );
        return { payment: repeatedPayment, status: expense.status, remaining: expense.amount.minus(alreadyPaid).toFixed(2) };
      }
      if (expense.status === "CANCELLED") throw new ApiError(409, "Não é possível pagar uma despesa cancelada.");

      const paid = expense.payments.reduce(
        (sum, payment) => sum.plus(payment.entry.reversals.length ? 0 : payment.amount),
        new Prisma.Decimal(0),
      );
      const remaining = expense.amount.minus(paid);
      if (amount.greaterThan(remaining)) throw new ApiError(409, "O pagamento excede o saldo da despesa.");

      const source = await tx.financialAccount.findUnique({
        where: { id: input.sourceAccountId },
        include: { session: true },
      });
      if (!source || !source.active) throw new ApiError(404, "Conta de pagamento não encontrada.");
      let sessionId: string | undefined;
      if (source.kind === "CASH") {
        if (!source.session || source.session.status !== "OPEN") throw new ApiError(409, "A sessão do caixa já foi encerrada.");
        const session = await lockOpenSession(tx, source.session.id);
        sessionId = session.id;
      }
      if (input.method === "CASH" && !["CASH", "VAULT", "FUND"].includes(source.kind)) {
        throw new ApiError(400, "Pagamento em dinheiro precisa sair de uma conta física.");
      }
      if (input.method !== "CASH" && source.kind === "CASH") {
        throw new ApiError(400, "Pagamentos eletrônicos não podem sair do saldo físico do caixa.");
      }
      if (input.method !== "CASH" && source.kind !== "BANK" && source.kind !== "RECEIVABLE") {
        throw new ApiError(400, "Pagamentos eletrônicos precisam sair de uma conta bancária ou de recebíveis.");
      }

      const external = await findAccount(tx, "EXTERNAL");
      const entry = await postEntryTx(tx, {
        debitAccountId: source.id,
        creditAccountId: external.id,
        amount: amount.toFixed(2),
        description: input.description?.trim() || "Pagamento: " + expense.description,
        idempotencyKey: input.idempotencyKey,
        actorId: input.actorId,
        eventId: expense.eventId || undefined,
        sessionId,
        kind: "EXPENSE",
        method: input.method,
        category: expense.category,
      });

      const payment = await tx.expensePayment.create({
        data: {
          expenseId: expense.id,
          entryId: entry.id,
          amount,
          createdById: input.actorId,
        },
      });
      const newPaid = paid.plus(amount);
      const status = newPaid.greaterThanOrEqualTo(expense.amount) ? "PAID" : "PARTIAL";
      await tx.expense.update({ where: { id: expense.id }, data: { status } });
      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          entity: "ExpensePayment",
          entityId: payment.id,
          action: "PAY",
          after: { expenseId: expense.id, amount: amount.toFixed(2), status },
        },
      });
      return { payment, status, remaining: expense.amount.minus(newPaid).toFixed(2) };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 },
  );
}

export async function prepareDeposit(input: {
  amount: string;
  description?: string;
  idempotencyKey: string;
} & ActorInput) {
  const amount = positiveMoney(input.amount);
  return prisma.$transaction(
    async (tx) => {
      const previousEntry = await tx.ledgerEntry.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (previousEntry) {
        const existing = await tx.deposit.findUnique({ where: { withdrawalId: previousEntry.id } });
        if (existing) {
          if (!existing.amount.equals(amount) || previousEntry.description !== (input.description?.trim() || "Retirada do cofre para depósito")) {
            throw new ApiError(409, "A chave de idempotência já foi usada em outro depósito.");
          }
          return existing;
        }
      }
      const vault = await findAccount(tx, "VAULT");
      const transit = await findAccount(tx, "TRANSIT");
      const entry = await postEntryTx(tx, {
        debitAccountId: vault.id,
        creditAccountId: transit.id,
        amount: amount.toFixed(2),
        description: input.description?.trim() || "Retirada do cofre para depósito",
        idempotencyKey: input.idempotencyKey,
        actorId: input.actorId,
        kind: "DEPOSIT",
        method: "CASH",
      });
      const deposit = await tx.deposit.create({
        data: {
          amount,
          status: "IN_TRANSIT",
          withdrawalId: entry.id,
          createdById: input.actorId,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          entity: "Deposit",
          entityId: deposit.id,
          action: "PREPARE",
          after: { amount: amount.toFixed(2), status: deposit.status },
        },
      });
      return deposit;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 },
  );
}

export async function confirmDeposit(input: {
  depositId: string;
  bankAccountId: string;
  bankReference?: string;
  idempotencyKey: string;
} & ActorInput) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Deposit" WHERE "id" = ${input.depositId} FOR UPDATE`;
      const deposit = await tx.deposit.findUnique({ where: { id: input.depositId } });
      if (!deposit) throw new ApiError(404, "Depósito não encontrado.");
      if (deposit.status === "CONFIRMED") return deposit;
      if (deposit.status !== "IN_TRANSIT") throw new ApiError(409, "Somente depósitos em trânsito podem ser confirmados.");

      const bank = await tx.financialAccount.findUnique({ where: { id: input.bankAccountId, active: true } });
      if (!bank || bank.kind !== "BANK") throw new ApiError(400, "Selecione uma conta bancária ativa.");
      const transit = await findAccount(tx, "TRANSIT");
      const entry = await postEntryTx(tx, {
        debitAccountId: transit.id,
        creditAccountId: bank.id,
        amount: deposit.amount.toFixed(2),
        description: "Confirmação de depósito " + (input.bankReference?.trim() || deposit.id),
        idempotencyKey: input.idempotencyKey,
        actorId: input.actorId,
        kind: "DEPOSIT",
        method: "BANK_TRANSFER",
      });
      const updated = await tx.deposit.update({
        where: { id: deposit.id },
        data: {
          status: "CONFIRMED",
          confirmationId: entry.id,
          bankReference: input.bankReference?.trim() || null,
          confirmedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          entity: "Deposit",
          entityId: deposit.id,
          action: "CONFIRM",
          before: { status: deposit.status },
          after: { status: updated.status, bankReference: updated.bankReference },
        },
      });
      return updated;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 },
  );
}

export async function cancelDeposit(input: { depositId: string; reason: string; idempotencyKey: string } & ActorInput) {
  if (!input.reason.trim()) throw new ApiError(400, "Informe o motivo do cancelamento do depósito.");
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Deposit" WHERE "id" = ${input.depositId} FOR UPDATE`;
      const deposit = await tx.deposit.findUnique({ where: { id: input.depositId }, include: { withdrawal: true } });
      if (!deposit) throw new ApiError(404, "Depósito não encontrado.");
      if (deposit.status === "CANCELLED") return deposit;
      if (deposit.status !== "IN_TRANSIT") throw new ApiError(409, "Somente depósitos em trânsito podem ser cancelados.");
      const transit = await findAccount(tx, "TRANSIT");
      const vault = await findAccount(tx, "VAULT");
      const entry = await postEntryTx(tx, {
        debitAccountId: transit.id,
        creditAccountId: vault.id,
        amount: deposit.amount.toFixed(2),
        description: "Cancelamento de depósito: " + input.reason.trim(),
        idempotencyKey: input.idempotencyKey,
        actorId: input.actorId,
        kind: "REVERSAL",
        method: "CASH",
        reversalOfId: deposit.withdrawalId,
      });
      const updated = await tx.deposit.update({ where: { id: deposit.id }, data: { status: "CANCELLED" } });
      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          entity: "Deposit",
          entityId: deposit.id,
          action: "CANCEL",
          before: { status: deposit.status },
          after: { status: updated.status, reversalEntryId: entry.id, reason: input.reason.trim() },
        },
      });
      return updated;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 },
  );
}

export async function reverseEntry(input: {
  entryId: string;
  reason: string;
  idempotencyKey: string;
} & ActorInput) {
  if (!input.reason.trim()) throw new ApiError(400, "A justificativa do estorno é obrigatória.");
  return prisma.$transaction(
    async (tx) => {
      const original = await tx.ledgerEntry.findUnique({ where: { id: input.entryId } });
      if (!original) throw new ApiError(404, "Lançamento não encontrado.");
      const reversed = await tx.ledgerEntry.findFirst({ where: { reversalOfId: original.id } });
      if (reversed) return reversed;
      if (original.kind === "DEPOSIT") {
        throw new ApiError(409, "Movimentações de depósito precisam ser corrigidas pelo fluxo do próprio depósito.");
      }
      if (original.kind === "REVERSAL") throw new ApiError(409, "Um estorno não pode ser estornado; registre um novo ajuste justificado.");
      if (original.sessionId) {
        await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "CashSession" WHERE "id" = ${original.sessionId} FOR UPDATE`;
        const session = await tx.cashSession.findUnique({ where: { id: original.sessionId }, select: { status: true } });
        const accounts = await tx.financialAccount.findMany({
          where: { id: { in: [original.debitAccountId, original.creditAccountId] } },
          select: { kind: true },
        });
        if (session?.status === "CLOSED" && accounts.some((account) => account.kind === "CASH")) {
          throw new ApiError(409, "Lançamentos de dinheiro de uma sessão fechada não podem ser estornados por ela; faça um ajuste no caixa atual.");
        }
      }
      const reversal = await postEntryTx(tx, {
        debitAccountId: original.creditAccountId,
        creditAccountId: original.debitAccountId,
        amount: original.amount.toFixed(2),
        description: "Estorno: " + input.reason.trim(),
        idempotencyKey: input.idempotencyKey,
        actorId: input.actorId,
        eventId: original.eventId || undefined,
        sessionId: original.sessionId || undefined,
        kind: "REVERSAL",
        method: original.method || undefined,
        category: original.category || undefined,
        reversalOfId: original.id,
      });
      const payment = await tx.expensePayment.findUnique({ where: { entryId: original.id } });
      if (payment) {
        const expense = await tx.expense.findUnique({
          where: { id: payment.expenseId },
          include: { payments: { include: { entry: { include: { reversals: true } } } } },
        });
        if (expense) {
          const paid = expense.payments.reduce(
            (sum, item) => sum.plus(item.entry.reversals.length ? 0 : item.amount),
            new Prisma.Decimal(0),
          );
          await tx.expense.update({
            where: { id: expense.id },
            data: { status: paid.isZero() ? "OPEN" : paid.greaterThanOrEqualTo(expense.amount) ? "PAID" : "PARTIAL" },
          });
        }
      }
      return reversal;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 },
  );
}

export function asMoney(value: Prisma.Decimal | number | string) {
  return money(value).toFixed(2);
}

export type FinancialEntryType = EntryKind;
