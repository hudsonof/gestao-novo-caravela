import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";

const integrationEnabled = process.env.RUN_FINANCE_INTEGRATION_TESTS === "1";
const databaseUrl = process.env.DATABASE_URL;
const databaseName = databaseUrl ? new URL(databaseUrl).pathname.replace(/^\//, "").split("?")[0] : "";
if (integrationEnabled && !/(^|[_-])(finance[_-])?test($|[_-])/i.test(databaseName)) {
  throw new Error("Testes financeiros exigem um banco isolado cujo nome contenha 'test' (ex.: finance_test).");
}

const integrationDescribe = integrationEnabled ? describe : describe.skip;
let prisma = undefined as unknown as PrismaClient;
let finance = {} as typeof import("../src/server/finance");
let cash = {} as typeof import("../src/server/cash");

async function createActor() {
  return prisma.user.create({
    data: { name: "Usuário de teste", email: `finance-test-${randomUUID()}@example.invalid`, role: "ADMIN", passwordHash: "test-only" },
  });
}

async function createAccount(kind: "FUND" | "VAULT" | "CASH" | "BANK" | "TRANSIT" | "EXTERNAL" | "RECEIVABLE", balance = "0.00") {
  return prisma.financialAccount.create({ data: { name: `finance-test-${kind}-${randomUUID()}`, kind, balance } });
}

async function createOpenSession(actorId: string, accountId: string) {
  const suffix = randomUUID();
  const event = await prisma.event.create({ data: { name: `Evento teste ${suffix}`, startsAt: new Date(), status: "OPEN" } });
  const register = await prisma.cashRegister.create({ data: { name: `Caixa teste ${suffix}`, sector: "BAR" } });
  const session = await prisma.cashSession.create({
    data: {
      eventId: event.id,
      registerId: register.id,
      accountId,
      openedById: actorId,
      idempotencyKey: `session-${suffix}`,
      openingFloat: "0.00",
      status: "OPEN",
    },
  });
  return { event, register, session };
}

integrationDescribe("fluxos financeiros no PostgreSQL", () => {
  beforeAll(async () => {
    const db = await import("../src/lib/db");
    prisma = db.prisma;
    await prisma.$connect();
    finance = await import("../src/server/finance");
    cash = await import("../src/server/cash");
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE
      "DepositAttachment", "EmployeePayment", "EmployeeCompensation", "ExpensePayment", "Deposit",
      "CashClosing", "LedgerEntry", "CashSession", "Expense", "CashRegister", "Event",
      "FinancialAccount", "FinanceCategory", "AuditLog", "LoginAttempt", "Employee", "User"
      RESTART IDENTITY CASCADE`);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("mantém transferências internas neutras e repetições idempotentes", async () => {
    const actor = await createActor();
    const fund = await createAccount("FUND", "100.00");
    const cashAccount = await createAccount("CASH");
    const { event, session } = await createOpenSession(actor.id, cashAccount.id);
    const input = {
      sourceAccountId: fund.id,
      destinationAccountId: cashAccount.id,
      amount: "25.00",
      description: "Troco inicial do caixa",
      idempotencyKey: "fund-to-register-once",
      eventId: event.id,
      sessionId: session.id,
      actorId: actor.id,
      method: "CASH" as const,
    };

    const first = await finance.transferAccounts(input);
    const repeated = await finance.transferAccounts(input);
    const [updatedFund, updatedCash, entryCount] = await Promise.all([
      prisma.financialAccount.findUniqueOrThrow({ where: { id: fund.id } }),
      prisma.financialAccount.findUniqueOrThrow({ where: { id: cashAccount.id } }),
      prisma.ledgerEntry.count({ where: { idempotencyKey: input.idempotencyKey } }),
    ]);

    expect(repeated.id).toBe(first.id);
    expect(updatedFund.balance.toFixed(2)).toBe("75.00");
    expect(updatedCash.balance.toFixed(2)).toBe("25.00");
    expect(updatedFund.balance.plus(updatedCash.balance).toFixed(2)).toBe("100.00");
    expect(entryCount).toBe(1);
    await expect(finance.transferAccounts({ ...input, amount: "26.00" })).rejects.toThrow("chave de idempotência");
  });

  it("serializa saídas concorrentes e impede saldo negativo", async () => {
    const actor = await createActor();
    const fund = await createAccount("FUND", "100.00");
    const firstVault = await createAccount("VAULT");
    const secondVault = await createAccount("VAULT");
    const common = { sourceAccountId: fund.id, amount: "80.00", actorId: actor.id, method: "CASH" as const };
    const results = await Promise.allSettled([
      finance.transferAccounts({ ...common, destinationAccountId: firstVault.id, description: "Concorrência A", idempotencyKey: "concurrent-a" }),
      finance.transferAccounts({ ...common, destinationAccountId: secondVault.id, description: "Concorrência B", idempotencyKey: "concurrent-b" }),
    ]);
    const balance = await prisma.financialAccount.findUniqueOrThrow({ where: { id: fund.id } });

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(balance.balance.greaterThanOrEqualTo(0)).toBe(true);
    expect(balance.balance.toFixed(2)).toBe("20.00");
  });

  it("faz rollback integral quando a origem não tem saldo suficiente", async () => {
    const actor = await createActor();
    const source = await createAccount("FUND", "10.00");
    const destination = await createAccount("VAULT");

    await expect(finance.transferAccounts({
      sourceAccountId: source.id,
      destinationAccountId: destination.id,
      amount: "11.00",
      description: "Transferência sem saldo",
      idempotencyKey: "transfer-without-balance",
      actorId: actor.id,
      method: "CASH",
    })).rejects.toThrow("Saldo insuficiente");

    expect((await prisma.financialAccount.findUniqueOrThrow({ where: { id: source.id } })).balance.toFixed(2)).toBe("10.00");
    expect((await prisma.financialAccount.findUniqueOrThrow({ where: { id: destination.id } })).balance.toFixed(2)).toBe("0.00");
    expect(await prisma.ledgerEntry.count({ where: { idempotencyKey: "transfer-without-balance" } })).toBe(0);
  });

  it("registra cartão em recebíveis, sem aumentar o caixa físico, e preserva estorno", async () => {
    const actor = await createActor();
    const external = await createAccount("EXTERNAL");
    const receivable = await createAccount("RECEIVABLE");
    const physicalCash = await createAccount("CASH", "20.00");
    const saleInput = {
      amount: "45.00", method: "CREDIT", description: "Venda de cartão", idempotencyKey: "credit-sale",
      externalSource: "STONE", externalReference: "stone-test-1", actorId: actor.id,
    } as const;
    const sale = await finance.registerSale(saleInput);
    const importedAgain = await finance.registerSale({ ...saleInput, idempotencyKey: "credit-sale-replayed-with-new-key" });
    const cashAfterSale = await prisma.financialAccount.findUniqueOrThrow({ where: { id: physicalCash.id } });
    const receivableAfterSale = await prisma.financialAccount.findUniqueOrThrow({ where: { id: receivable.id } });
    const reversal = await finance.reverseEntry({ entryId: sale.id, reason: "Teste de estorno", idempotencyKey: "credit-sale-reversal", actorId: actor.id });
    const originalAfterReversal = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: sale.id }, include: { reversals: true } });
    const receivableAfterReversal = await prisma.financialAccount.findUniqueOrThrow({ where: { id: receivable.id } });

    expect(cashAfterSale.balance.toFixed(2)).toBe("20.00");
    expect(receivableAfterSale.balance.toFixed(2)).toBe("45.00");
    expect(importedAgain.id).toBe(sale.id);
    expect(originalAfterReversal.id).toBe(sale.id);
    expect(originalAfterReversal.reversals.map((item) => item.id)).toContain(reversal.id);
    expect(receivableAfterReversal.balance.toFixed(2)).toBe("0.00");
    expect(await prisma.financialAccount.findUniqueOrThrow({ where: { id: external.id } })).toBeTruthy();
  });

  it("controla pagamentos parciais e faz rollback de tentativa acima do saldo", async () => {
    const actor = await createActor();
    const bank = await createAccount("BANK", "200.00");
    const external = await createAccount("EXTERNAL");
    const categoryName = `Serviço ${randomUUID()}`;
    await prisma.financeCategory.create({ data: { name: categoryName, type: "EXPENSE" } });
    const expense = await finance.createExpense({
      description: "Conta de teste", category: categoryName, amount: "100.00", dueDate: new Date(),
      idempotencyKey: "expense-test", actorId: actor.id,
    });
    const first = await finance.payExpense({ expenseId: expense.id, amount: "35.00", sourceAccountId: bank.id, method: "BANK_TRANSFER", idempotencyKey: "expense-payment-a", actorId: actor.id });

    expect(first.status).toBe("PARTIAL");
    expect(first.remaining).toBe("65.00");
    await expect(finance.payExpense({ expenseId: expense.id, amount: "66.00", sourceAccountId: bank.id, method: "BANK_TRANSFER", idempotencyKey: "expense-payment-too-much", actorId: actor.id })).rejects.toThrow("excede o saldo");
    expect((await prisma.financialAccount.findUniqueOrThrow({ where: { id: bank.id } })).balance.toFixed(2)).toBe("165.00");

    const final = await finance.payExpense({ expenseId: expense.id, amount: "65.00", sourceAccountId: bank.id, method: "BANK_TRANSFER", idempotencyKey: "expense-payment-b", actorId: actor.id });
    expect(final.status).toBe("PAID");
    expect(final.remaining).toBe("0.00");
    expect(await prisma.ledgerEntry.count({ where: { debitAccountId: bank.id, creditAccountId: external.id, kind: "EXPENSE" } })).toBe(2);
  });

  it("registra divergência de fechamento de menos R$ 50 e bloqueia nova venda", async () => {
    const actor = await createActor();
    const external = await createAccount("EXTERNAL");
    const cashAccount = await createAccount("CASH", "100.00");
    const { event, session } = await createOpenSession(actor.id, cashAccount.id);
    const closing = await cash.closeCashSession(session.id, "50.00", actor.id, "Diferença conferida no teste");
    const balanceAfterClose = await prisma.financialAccount.findUniqueOrThrow({ where: { id: cashAccount.id } });

    expect(closing.expectedAmount.toFixed(2)).toBe("100.00");
    expect(closing.countedAmount.toFixed(2)).toBe("50.00");
    expect(closing.difference.toFixed(2)).toBe("-50.00");
    expect(balanceAfterClose.balance.toFixed(2)).toBe("50.00");
    await expect(finance.registerSale({
      amount: "10.00", method: "CASH", description: "Venda depois de fechado", idempotencyKey: "sale-on-closed-session",
      sessionId: session.id, eventId: event.id, actorId: actor.id,
    })).rejects.toThrow("já foi encerrada");
    expect(await prisma.financialAccount.findUniqueOrThrow({ where: { id: external.id } })).toBeTruthy();
  });

  it("mantém o depósito em trânsito até a confirmação bancária", async () => {
    const actor = await createActor();
    const vault = await createAccount("VAULT", "100.00");
    const transit = await createAccount("TRANSIT");
    const bank = await createAccount("BANK");
    const deposit = await finance.prepareDeposit({ amount: "40.00", transportResponsible: "Pessoa teste", idempotencyKey: "deposit-withdrawal", actorId: actor.id });
    const transitBeforeConfirmation = await prisma.financialAccount.findUniqueOrThrow({ where: { id: transit.id } });
    const bankBeforeConfirmation = await prisma.financialAccount.findUniqueOrThrow({ where: { id: bank.id } });

    expect(deposit.status).toBe("IN_TRANSIT");
    expect(transitBeforeConfirmation.balance.toFixed(2)).toBe("40.00");
    expect(bankBeforeConfirmation.balance.toFixed(2)).toBe("0.00");
    const confirmed = await finance.confirmDeposit({ depositId: deposit.id, bankAccountId: bank.id, bankReference: "comprovante-teste", idempotencyKey: "deposit-confirmation", actorId: actor.id });
    const finalAccounts = await prisma.financialAccount.findMany({ where: { id: { in: [vault.id, transit.id, bank.id] } } });
    const balances = new Map(finalAccounts.map((account) => [account.id, account.balance.toFixed(2)]));

    expect(confirmed.status).toBe("CONFIRMED");
    expect(balances.get(vault.id)).toBe("60.00");
    expect(balances.get(transit.id)).toBe("0.00");
    expect(balances.get(bank.id)).toBe("40.00");
  });
});
