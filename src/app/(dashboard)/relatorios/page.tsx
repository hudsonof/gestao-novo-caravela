import { prisma } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { getCashFlowReport } from "@/server/reports";
import { businessDateKey, businessDayEnd, businessDayStart } from "@/lib/dates";
export const dynamic = "force-dynamic";

function safeDate(value: string | undefined, fallback: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : fallback;
}

export default async function Relatorios({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; eventId?: string }> }) {
  const query = await searchParams;
  const now = new Date();
  const today = businessDateKey(now);
  const startOfMonth = `${today.slice(0, 7)}-01`;
  const fromText = safeDate(query.from, startOfMonth);
  const toText = safeDate(query.to, today);
  let from = businessDayStart(fromText);
  let to = businessDayEnd(toText);
  if (to < from || to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) {
    from = businessDayStart(startOfMonth);
    to = businessDayEnd(today);
  }
  const [report, events] = await Promise.all([
    getCashFlowReport(from <= to ? from : businessDayStart(startOfMonth), from <= to ? to : businessDayEnd(today), query.eventId),
    prisma.event.findMany({ orderBy: { startsAt: "desc" }, take: 200 }),
  ]);
  return <>
    <h1>Resumos e relatórios</h1><p className="muted">Receitas, pagamentos, saldo por conta, compromissos e divergências.</p>
    <form className="card filter-bar" method="get"><label>De<input type="date" name="from" defaultValue={fromText} /></label><label>Até<input type="date" name="to" defaultValue={toText} /></label><label>Evento<select name="eventId" defaultValue={query.eventId || ""}><option value="">Todos</option>{events.map((event) => <option value={event.id} key={event.id}>{event.name}</option>)}</select></label><button className="button">Filtrar</button></form>
    <div className="grid section">{[
      ["Entradas / vendas", report.totals.sales], ["Despesas pagas", report.totals.expenses], ["Fluxo líquido", report.totals.netCashFlow], ["Contas a pagar", report.totals.pendingPayables],
      ["Depósitos em trânsito", report.totals.depositsInTransit], ["Diferenças de fechamento", report.totals.closingVariances],
    ].map(([title, amount]) => <div className="card" key={title}><div className="muted">{title}</div><div className="value">{formatBRL(amount)}</div></div>)}</div>
    <section className="section card"><h2>Saldos por conta</h2><table className="table"><thead><tr><th>Conta</th><th>Tipo</th><th>Saldo</th></tr></thead><tbody>{report.accounts.map((account) => <tr key={account.id}><td>{account.name}</td><td>{account.kind}</td><td>{formatBRL(account.balance)}</td></tr>)}</tbody></table></section>
    <div className="report-grid section">
      <section className="card"><h2>Vendas por meio de pagamento</h2>{report.salesByMethod.length ? report.salesByMethod.map((item) => <div className="summary-row" key={item.method}><span>{item.method}</span><strong>{formatBRL(item.amount)}</strong></div>) : <p className="empty">Sem vendas no período.</p>}</section>
      <section className="card"><h2>Despesas por categoria</h2>{report.expensesByCategory.length ? report.expensesByCategory.map((item) => <div className="summary-row" key={item.category}><span>{item.category}</span><strong>{formatBRL(item.amount)}</strong></div>) : <p className="empty">Sem pagamentos no período.</p>}</section>
    </div>
    <section className="section card"><h2>Fluxo diário</h2>{report.daily.length ? <table className="table"><thead><tr><th>Data</th><th>Entradas</th><th>Saídas</th><th>Líquido</th></tr></thead><tbody>{report.daily.map((row) => <tr key={row.date}><td>{row.date.split("-").reverse().join("/")}</td><td>{formatBRL(row.inflows)}</td><td>{formatBRL(row.outflows)}</td><td>{formatBRL(row.net)}</td></tr>)}</tbody></table> : <p className="empty">Sem movimentações no período.</p>}</section>
    <section className="section card"><h2>Contas pendentes</h2>{report.pendingPayables.length ? <table className="table"><thead><tr><th>Descrição</th><th>Categoria</th><th>Vencimento</th><th>Saldo restante</th></tr></thead><tbody>{report.pendingPayables.map((expense) => <tr key={expense.id}><td>{expense.description}</td><td>{expense.category}</td><td>{expense.dueDate.toLocaleDateString("pt-BR", { timeZone: "UTC" })}</td><td>{formatBRL(expense.remaining)}</td></tr>)}</tbody></table> : <p className="empty">Sem contas pendentes.</p>}</section>
    <section className="section card"><h2>Divergências de fechamento</h2>{report.closingDifferences.length ? <table className="table"><thead><tr><th>Evento</th><th>Caixa</th><th>Esperado</th><th>Contado</th><th>Diferença</th></tr></thead><tbody>{report.closingDifferences.map((closing) => <tr key={closing.id}><td>{closing.event}</td><td>{closing.register}</td><td>{formatBRL(closing.expected)}</td><td>{formatBRL(closing.counted)}</td><td>{formatBRL(closing.difference)}</td></tr>)}</tbody></table> : <p className="empty">Sem fechamentos nesse período.</p>}</section>
  </>;
}
