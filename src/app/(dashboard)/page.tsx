import Link from "next/link";
import { prisma } from "@/lib/db";
import { getOverview } from "@/lib/queries";
import { getCashFlowReport } from "@/server/reports";
import { formatBRL } from "@/lib/money";
import { businessDateKey, businessDayEnd, businessDayStart } from "@/lib/dates";
export const dynamic = "force-dynamic";

function safeDate(value: string | undefined, fallback: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : fallback;
}

export default async function Home({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; eventId?: string }> }) {
  const query = await searchParams;
  const today = businessDateKey(new Date());
  const monthStart = `${today.slice(0, 7)}-01`;
  const fromText = safeDate(query.from, monthStart);
  const toText = safeDate(query.to, today);
  let from = businessDayStart(fromText);
  let to = businessDayEnd(toText);
  if (to < from || to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) {
    from = businessDayStart(monthStart);
    to = businessDayEnd(today);
  }
  const [data, events, report] = await Promise.all([
    getOverview(query.eventId),
    prisma.event.findMany({ orderBy: { startsAt: "desc" }, take: 200 }),
    getCashFlowReport(from, to, query.eventId),
  ]);
  const balance = (kind: string) => data.accounts.filter((account) => account.kind === kind).reduce((sum, account) => sum + Number(account.balance), 0);
  const pending = report.pendingPayables.slice(0, 8);
  return <>
    <div className="head"><div><h1>Painel financeiro</h1><div className="muted">Novo Caravela · visão consolidada por evento e período</div></div><Link href="/eventos" className="button">Gerenciar eventos</Link></div>
    <form className="card filter-bar" method="get"><label>De<input type="date" name="from" defaultValue={fromText} /></label><label>Até<input type="date" name="to" defaultValue={toText} /></label><label>Evento<select name="eventId" defaultValue={query.eventId || ""}><option value="">Todos</option>{events.map((event) => <option value={event.id} key={event.id}>{event.name}</option>)}</select></label><button className="button">Aplicar filtros</button></form>
    <div className="grid section">
      {[["Entradas no período", report.totals.sales], ["Despesas pagas", report.totals.expenses], ["Fluxo líquido", report.totals.netCashFlow], ["Contas pendentes", report.totals.pendingPayables]].map(([title, amount]) => <div className="card" key={String(title)}><div className="muted">{title}</div><div className="value">{formatBRL(String(amount))}</div></div>)}
    </div>
    <div className="grid section">
      {[["Dinheiro nos caixas", balance("CASH")], ["Fundo central", balance("FUND")], ["Cofre central", balance("VAULT")], ["Em trânsito", balance("TRANSIT")]].map(([title, value]) => <div className="card" key={String(title)}><div className="muted">{title} · saldo geral</div><div className="value">{formatBRL(Number(value))}</div></div>)}
    </div>
    <section className="section card"><div className="head"><h2>Caixas abertos</h2><Link href="/caixas" className="button">Abrir ou fechar caixa</Link></div>{data.sessions.length ? <div className="table-scroll"><table className="table"><thead><tr><th>Caixa</th><th>Setor</th><th>Evento</th><th>Colaborador</th><th>Saldo físico</th></tr></thead><tbody>{data.sessions.map((session) => <tr key={session.id}><td>{session.register.name}</td><td>{session.register.sector}</td><td>{session.event.name}</td><td>{session.employee?.name || "—"}</td><td>{formatBRL(session.account.balance)}</td></tr>)}</tbody></table></div> : <p className="empty">Nenhum caixa aberto para este filtro.</p>}</section>
    <section className="section card"><div className="head"><h2>Próximos vencimentos</h2><Link href="/despesas">Ver contas e pagamentos</Link></div>{pending.length ? <div className="table-scroll"><table className="table"><thead><tr><th>Descrição</th><th>Tipo</th><th>Vencimento</th><th>Valor pendente</th><th>Status</th></tr></thead><tbody>{pending.map((item) => <tr key={`${item.kind}-${item.id}`}><td>{item.description}</td><td>{item.kind}</td><td>{item.dueDate.toLocaleDateString("pt-BR", { timeZone: "UTC" })}</td><td>{formatBRL(item.remaining)}</td><td>{item.status === "OVERDUE" ? <span className="tag tag-danger">Vencida</span> : item.status}</td></tr>)}</tbody></table></div> : <p className="empty">Nenhuma conta pendente no filtro selecionado.</p>}</section>
  </>;
}
