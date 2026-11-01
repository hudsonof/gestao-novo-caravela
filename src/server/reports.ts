import { EntryKind, PaymentMethod, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { businessDateKey } from "@/lib/dates";

const zero = () => new Prisma.Decimal(0);
const add = (map: Map<string, Prisma.Decimal>, key: string, amount: Prisma.Decimal) =>
  map.set(key, (map.get(key) ?? zero()).plus(amount));

export async function getCashFlowReport(from: Date, to: Date, eventId?: string) {
  const [entries, accounts, expenses, deposits, closings] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: { createdAt: { gte: from, lte: to }, ...(eventId ? { eventId } : {}) },
      include: { reversalOf: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.financialAccount.findMany({ where: { active: true }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
    prisma.expense.findMany({
      where: { status: { in: ["OPEN", "PARTIAL"] }, ...(eventId ? { eventId } : {}) },
      include: { payments: { include: { entry: { include: { reversals: true } } } } },
      orderBy: { dueDate: "asc" },
    }),
    prisma.deposit.findMany({ where: { status: "IN_TRANSIT" }, orderBy: { createdAt: "asc" } }),
    prisma.cashClosing.findMany({ where: { createdAt: { gte: from, lte: to }, ...(eventId ? { session: { eventId } } : {}) }, include: { session: { include: { register: true, event: true } } } }),
  ]);

  let sales = zero();
  let expensePayments = zero();
  let adjustmentIn = zero();
  let adjustmentOut = zero();
  const byMethod = new Map<string, Prisma.Decimal>();
  const byCategory = new Map<string, Prisma.Decimal>();
  const daily = new Map<string, { inflows: Prisma.Decimal; outflows: Prisma.Decimal }>();
  const accountKinds = new Map(accounts.map((account) => [account.id, account.kind]));
  const applyDaily = (date: Date, side: "inflows" | "outflows", amount: Prisma.Decimal) => {
    const key = businessDateKey(date);
    const current = daily.get(key) ?? { inflows: zero(), outflows: zero() };
    current[side] = current[side].plus(amount);
    daily.set(key, current);
  };

  for (const entry of entries) {
    let sign = 1;
    let kind: EntryKind = entry.kind;
    let category = entry.category || "Sem categoria";
    let method: PaymentMethod | null = entry.method;
    let debitKind: string | undefined;
    let creditKind: string | undefined;
    if (entry.kind === "REVERSAL" && entry.reversalOf) {
      sign = -1;
      kind = entry.reversalOf.kind;
      category = entry.reversalOf.category || category;
      method = entry.reversalOf.method;
    }
    if (kind === "SALE") {
      const amount = entry.amount.mul(sign);
      sales = sales.plus(amount);
      add(byMethod, method || "OUTROS", amount);
      applyDaily(entry.createdAt, amount.isNegative() ? "outflows" : "inflows", amount.abs());
    } else if (kind === "EXPENSE") {
      const amount = entry.amount.mul(sign);
      expensePayments = expensePayments.plus(amount);
      add(byCategory, category, amount);
      applyDaily(entry.createdAt, amount.isNegative() ? "inflows" : "outflows", amount.abs());
    } else if (kind === "ADJUSTMENT") {
      if (entry.kind === "REVERSAL" && entry.reversalOf) {
        debitKind = accountKinds.get(entry.reversalOf.debitAccountId);
        creditKind = accountKinds.get(entry.reversalOf.creditAccountId);
      } else {
        debitKind = accountKinds.get(entry.debitAccountId);
        creditKind = accountKinds.get(entry.creditAccountId);
      }
      const incoming = debitKind === "EXTERNAL";
      const effect = entry.amount.mul(sign);
      if (incoming) adjustmentIn = adjustmentIn.plus(effect);
      else adjustmentOut = adjustmentOut.plus(effect);
      applyDaily(entry.createdAt, (incoming ? effect : effect.negated()).isNegative() ? "outflows" : "inflows", effect.abs());
    }
  }

  const pendingPayables = expenses.map((expense) => {
    const paid = expense.payments.reduce(
      (sum, payment) => sum.plus(payment.entry.reversals.length ? 0 : payment.amount),
      zero(),
    );
    return {
      id: expense.id,
      description: expense.description,
      category: expense.category,
      dueDate: expense.dueDate,
      amount: expense.amount.toFixed(2),
      remaining: expense.amount.minus(paid).toFixed(2),
      status: expense.status,
      eventId: expense.eventId,
    };
  });
  const accountBalances = accounts.filter((account) => account.kind !== "EXTERNAL").map((account) => ({
    id: account.id,
    name: account.name,
    kind: account.kind,
    balance: account.balance.toFixed(2),
  }));
  const pendingDepositTotal = deposits.reduce((sum, deposit) => sum.plus(deposit.amount), zero());
  const varianceTotal = closings.reduce((sum, closing) => sum.plus(closing.difference.abs()), zero());
  const net = sales.minus(expensePayments).plus(adjustmentIn).minus(adjustmentOut);

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    totals: {
      sales: sales.toFixed(2),
      expenses: expensePayments.toFixed(2),
      adjustmentIn: adjustmentIn.toFixed(2),
      adjustmentOut: adjustmentOut.toFixed(2),
      netCashFlow: net.toFixed(2),
      pendingPayables: pendingPayables.reduce((sum, expense) => sum.plus(expense.remaining), zero()).toFixed(2),
      depositsInTransit: pendingDepositTotal.toFixed(2),
      closingVariances: varianceTotal.toFixed(2),
    },
    salesByMethod: Array.from(byMethod, ([method, amount]) => ({ method, amount: amount.toFixed(2) })),
    expensesByCategory: Array.from(byCategory, ([category, amount]) => ({ category, amount: amount.toFixed(2) })),
    daily: Array.from(daily, ([date, amount]) => ({
      date,
      inflows: amount.inflows.toFixed(2),
      outflows: amount.outflows.toFixed(2),
      net: amount.inflows.minus(amount.outflows).toFixed(2),
    })).sort((a, b) => a.date.localeCompare(b.date)),
    accounts: accountBalances,
    pendingPayables,
    pendingDeposits: deposits.map((deposit) => ({ id: deposit.id, amount: deposit.amount.toFixed(2), createdAt: deposit.createdAt.toISOString() })),
    closingDifferences: closings.map((closing) => ({
      id: closing.id,
      event: closing.session.event.name,
      register: closing.session.register.name,
      expected: closing.expectedAmount.toFixed(2),
      counted: closing.countedAmount.toFixed(2),
      difference: closing.difference.toFixed(2),
    })),
  };
}
