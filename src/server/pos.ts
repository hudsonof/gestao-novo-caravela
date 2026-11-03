import { Prisma, type PosDevice, type PosOrder } from "@prisma/client";
import { ApiError } from "@/lib/http";
import { positiveMoney } from "@/lib/money";
import { postEntryTx } from "@/server/ledger";

export function productTypeForChannel(channel: PosDevice["profile"]) {
  return channel === "TICKETS" ? "ENTRY" : channel === "TABLES" ? "TABLE" : "BAR";
}

export async function lockDeviceSession(tx: Prisma.TransactionClient, device: PosDevice, eventId: string) {
  const session = await tx.cashSession.findFirst({ where: { registerId: device.cashRegisterId, eventId, status: "OPEN" }, include: { account: true, event: true } });
  if (!session) throw new ApiError(409, "Não há sessão aberta para este terminal e evento.");
  await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "CashSession" WHERE "id" = ${session.id} FOR UPDATE`;
  const locked = await tx.cashSession.findUnique({ where: { id: session.id }, include: { account: true, event: true } });
  if (!locked || locked.status !== "OPEN" || locked.event.status !== "OPEN") throw new ApiError(409, "A sessão ou o evento não está aberto.");
  return locked;
}

export async function lockOpenOrder(tx: Prisma.TransactionClient, orderId: string, deviceId: string) {
  await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "PosOrder" WHERE "id" = ${orderId} FOR UPDATE`;
  const order = await tx.posOrder.findUnique({ where: { id: orderId }, include: { items: true, payments: true } });
  if (!order || order.deviceId !== deviceId) throw new ApiError(404, "Comanda não encontrada.");
  if (order.status !== "OPEN") throw new ApiError(409, "A comanda não está aberta.");
  return order;
}

export async function recalculateOrderTotal(tx: Prisma.TransactionClient, orderId: string) {
  const items = await tx.posOrderItem.findMany({ where: { orderId }, select: { lineTotal: true } });
  const total = items.reduce((sum, item) => sum.add(item.lineTotal), new Prisma.Decimal(0));
  return tx.posOrder.update({ where: { id: orderId }, data: { total } });
}

export async function postPosPayment(input: {
  tx: Prisma.TransactionClient;
  device: PosDevice;
  order: PosOrder;
  amountText: string;
  method: "CASH" | "PIX" | "BANK_TRANSFER" | "DEBIT" | "CREDIT";
  idempotencyKey: string;
  sessionId: string;
  accountId: string;
  eventId: string;
  commandCode: string;
}) {
  if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 100) throw new ApiError(400, "Informe uma chave de idempotência válida.");
  const amount = positiveMoney(input.amountText);
  const prior = await input.tx.posPayment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (prior) {
    if (prior.orderId !== input.order.id || prior.method !== input.method || !prior.amount.equals(amount)) throw new ApiError(409, "Chave de idempotência reutilizada com outros dados.");
    return prior;
  }

  const debit = await input.tx.financialAccount.findFirst({ where: { kind: "EXTERNAL", active: true }, orderBy: { createdAt: "asc" } });
  const creditKind = input.method === "CASH" ? "CASH" : input.method === "PIX" || input.method === "BANK_TRANSFER" ? "BANK" : "RECEIVABLE";
  const credit = creditKind === "CASH"
    ? await input.tx.financialAccount.findUnique({ where: { id: input.accountId } })
    : await input.tx.financialAccount.findFirst({ where: { kind: creditKind, active: true }, orderBy: { createdAt: "asc" } });
  if (!debit || !credit || !credit.active) throw new ApiError(409, "Configure as contas financeiras exigidas pelo meio de pagamento.");
  const entry = await postEntryTx(input.tx, {
    debitAccountId: debit.id,
    creditAccountId: credit.id,
    amount: amount.toFixed(2),
    description: `PDV ${input.order.channel} · comanda ${input.commandCode}`,
    idempotencyKey: `pos-payment:${input.idempotencyKey}`,
    actorId: input.device.createdById,
    eventId: input.eventId,
    sessionId: input.sessionId,
    kind: "SALE",
    method: input.method,
    category: "PDV",
    externalSource: "POS",
    externalReference: input.idempotencyKey,
  });
  const payment = await input.tx.posPayment.create({ data: { orderId: input.order.id, method: input.method, amount, idempotencyKey: input.idempotencyKey, ledgerEntryId: entry.id } });
  const totalPaid = await input.tx.posPayment.aggregate({ where: { orderId: input.order.id }, _sum: { amount: true } });
  const paid = totalPaid._sum.amount || new Prisma.Decimal(0);
  if (paid.greaterThanOrEqualTo(input.order.total)) {
    await input.tx.posOrder.update({ where: { id: input.order.id }, data: { status: "PAID", paidAt: new Date() } });
  }
  return payment;
}
