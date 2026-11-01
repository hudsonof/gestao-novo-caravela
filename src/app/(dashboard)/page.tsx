import Link from "next/link";
import { getOverview } from "@/lib/queries";
import { formatBRL } from "@/lib/money";
export const dynamic = "force-dynamic";

export default async function Home() {
  const data = await getOverview();
  const balance = (kind: string) => data.accounts.filter((account) => account.kind === kind).reduce((sum, account) => sum + Number(account.balance), 0);
  return <>
    <div className="head"><div><h1>Painel financeiro</h1><div className="muted">Novo Caravela · visão consolidada</div></div><Link href="/eventos" className="button">Gerenciar eventos</Link></div>
    <div className="grid">
      {[["Dinheiro nos caixas", balance("CASH")], ["Fundo central", balance("FUND")], ["Cofre central", balance("VAULT")], ["Em trânsito", balance("TRANSIT")]].map(([title, value]) => <div className="card" key={String(title)}><div className="muted">{title}</div><div className="value">{formatBRL(Number(value))}</div></div>)}
    </div>
    <section className="section card"><div className="head"><h2>Caixas abertos</h2><Link href="/caixas" className="button">Abrir ou fechar caixa</Link></div>{data.sessions.length ? <table className="table"><thead><tr><th>Caixa</th><th>Setor</th><th>Evento</th><th>Colaborador</th><th>Saldo físico</th></tr></thead><tbody>{data.sessions.map((session) => <tr key={session.id}><td>{session.register.name}</td><td>{session.register.sector}</td><td>{session.event.name}</td><td>{session.employee?.name || "—"}</td><td>{formatBRL(session.account.balance)}</td></tr>)}</tbody></table> : <p className="empty">Nenhum caixa aberto.</p>}</section>
    <section className="section card"><div className="head"><h2>Próximos vencimentos</h2><Link href="/despesas">Ver contas a pagar</Link></div>{data.expenses.length ? <table className="table"><thead><tr><th>Descrição</th><th>Vencimento</th><th>Valor original</th><th>Status</th></tr></thead><tbody>{data.expenses.map((expense) => <tr key={expense.id}><td>{expense.description}</td><td>{expense.dueDate.toLocaleDateString("pt-BR", { timeZone: "UTC" })}</td><td>{formatBRL(expense.amount)}</td><td>{expense.status}</td></tr>)}</tbody></table> : <p className="empty">Nenhuma conta pendente.</p>}</section>
  </>;
}
