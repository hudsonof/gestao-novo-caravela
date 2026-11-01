import { prisma } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { ApiForm } from "@/components/api-form";
export const dynamic = "force-dynamic";

export default async function Despesas() {
  const [expenses, events, accounts] = await Promise.all([
    prisma.expense.findMany({ include: { event: { select: { name: true } }, payments: { include: { entry: { include: { reversals: true } } } }, createdBy: { select: { name: true } } }, orderBy: { dueDate: "asc" }, take: 300 }),
    prisma.event.findMany({ orderBy: { startsAt: "desc" }, take: 200 }),
    prisma.financialAccount.findMany({ where: { active: true }, include: { session: true }, orderBy: { name: "asc" } }),
  ]);
  const pending = expenses.filter((expense) => expense.status === "OPEN" || expense.status === "PARTIAL");
  const payingAccounts = accounts.filter((account) => account.kind !== "CASH" || account.session?.status === "OPEN");
  return <>
    <h1>Despesas e contas a pagar</h1><p className="muted">Cadastre o compromisso; o saldo financeiro só muda quando um pagamento é confirmado.</p>
    <div className="form-grid">
      <ApiForm endpoint="/api/expenses" title="Cadastrar despesa" fields={[
        { name: "description", label: "Descrição" }, { name: "category", label: "Categoria" }, { name: "supplier", label: "Fornecedor", required: false },
        { name: "amount", label: "Valor total", type: "number", min: "0.01", step: "0.01" },
        { name: "dueDate", label: "Vencimento", type: "date" },
        { name: "eventId", label: "Evento (opcional)", type: "select", required: false, options: events.map((event) => ({ value: event.id, label: event.name })) },
      ]} submitLabel="Cadastrar despesa" />
      <ApiForm endpoint="/api/expense-payments" title="Pagar ou fazer pagamento parcial" fields={[
        { name: "expenseId", label: "Conta", type: "select", options: pending.map((expense) => ({ value: expense.id, label: `${expense.description} · ${formatBRL(expense.amount)}` })) },
        { name: "amount", label: "Valor do pagamento", type: "number", min: "0.01", step: "0.01" },
        { name: "sourceAccountId", label: "Conta de origem", type: "select", options: payingAccounts.map((account) => ({ value: account.id, label: `${account.name} · ${account.kind}` })) },
        { name: "method", label: "Meio de pagamento", type: "select", options: [{ value: "CASH", label: "Dinheiro" }, { value: "PIX", label: "Pix" }, { value: "BANK_TRANSFER", label: "Transferência bancária" }, { value: "DEBIT", label: "Débito" }, { value: "CREDIT", label: "Crédito" }] },
        { name: "description", label: "Observação", required: false },
      ]} submitLabel="Registrar pagamento" />
    </div>
    <section className="section card"><h2>Contas registradas</h2>{expenses.length ? <table className="table"><thead><tr><th>Descrição</th><th>Categoria</th><th>Evento</th><th>Vencimento</th><th>Valor</th><th>Pago</th><th>Status</th><th>Ação</th></tr></thead><tbody>{expenses.map((expense) => {
      const paid = expense.payments.reduce((sum, payment) => sum + (payment.entry.reversals.length ? 0 : Number(payment.amount)), 0);
      return <tr key={expense.id}><td>{expense.description}<div className="muted">{expense.supplier || ""}</div></td><td>{expense.category}</td><td>{expense.event?.name || "Geral"}</td><td>{expense.dueDate.toLocaleDateString("pt-BR", { timeZone: "UTC" })}</td><td>{formatBRL(expense.amount)}</td><td>{formatBRL(paid)}</td><td>{expense.status}</td><td>{expense.status === "OPEN" && expense.payments.length === 0 ? <ApiForm endpoint={`/api/expenses/${expense.id}/cancel`} title="Cancelar despesa" fields={[{ name: "reason", label: "Motivo" }]} submitLabel="Cancelar" /> : "—"}</td></tr>;
    })}</tbody></table> : <p className="empty">Nenhuma conta cadastrada.</p>}</section>
  </>;
}
