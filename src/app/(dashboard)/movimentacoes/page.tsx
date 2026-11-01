import { prisma } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { ApiForm } from "@/components/api-form";
export const dynamic = "force-dynamic";

const methods = [{ value: "CASH", label: "Dinheiro" }, { value: "PIX", label: "Pix" }, { value: "DEBIT", label: "Débito" }, { value: "CREDIT", label: "Crédito" }, { value: "BANK_TRANSFER", label: "Transferência bancária" }];

export default async function Movimentacoes() {
  const [entries, events, sessions, accounts] = await Promise.all([
    prisma.ledgerEntry.findMany({ include: { debitAccount: true, creditAccount: true, createdBy: { select: { name: true } }, event: { select: { name: true } }, reversalOf: true, reversals: true }, orderBy: { createdAt: "desc" }, take: 150 }),
    prisma.event.findMany({ where: { status: "OPEN" }, orderBy: { startsAt: "desc" } }),
    prisma.cashSession.findMany({ where: { status: "OPEN" }, include: { register: true, account: true, event: true }, orderBy: { openedAt: "desc" } }),
    prisma.financialAccount.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  const eventOptions = events.map((event) => ({ value: event.id, label: event.name }));
  const sessionOptions = sessions.map((session) => ({ value: session.id, label: `${session.register.name} · ${session.event.name}` }));
  const accountOptions = accounts.filter((account) => account.kind !== "CASH").map((account) => ({ value: account.id, label: `${account.name} · ${account.kind}` }));
  return <>
    <h1>Movimentações</h1><p className="muted">Vendas, ajustes e transferências com atualização imediata dos saldos.</p>
    <div className="form-grid">
      <ApiForm endpoint="/api/transactions" title="Registrar entrada / venda" hidden={{ kind: "SALE" }} fields={[
        { name: "amount", label: "Valor recebido", type: "number", min: "0.01", step: "0.01" }, { name: "description", label: "Descrição" },
        { name: "method", label: "Meio de pagamento", type: "select", options: methods }, { name: "category", label: "Categoria", required: false },
        { name: "eventId", label: "Evento", type: "select", required: false, options: eventOptions }, { name: "sessionId", label: "Sessão de caixa (obrigatória para dinheiro)", type: "select", required: false, options: sessionOptions },
      ]} submitLabel="Registrar entrada" />
      <ApiForm endpoint="/api/transactions" title="Ajuste de saldo central" hidden={{ kind: "ADJUSTMENT" }} fields={[
        { name: "accountId", label: "Conta", type: "select", options: accountOptions }, { name: "direction", label: "Tipo", type: "select", options: [{ value: "IN", label: "Entrada" }, { value: "OUT", label: "Saída" }] },
        { name: "amount", label: "Valor", type: "number", min: "0.01", step: "0.01" }, { name: "reason", label: "Justificativa" },
      ]} submitLabel="Registrar ajuste" />
      <ApiForm endpoint="/api/transfers" title="Transferência interna" fields={[
        { name: "sourceAccountId", label: "Origem", type: "select", options: accounts.map((account) => ({ value: account.id, label: `${account.name} · ${account.kind}` })) },
        { name: "destinationAccountId", label: "Destino", type: "select", options: accounts.map((account) => ({ value: account.id, label: `${account.name} · ${account.kind}` })) },
        { name: "amount", label: "Valor", type: "number", min: "0.01", step: "0.01" }, { name: "description", label: "Motivo" },
        { name: "method", label: "Meio da transferência", type: "select", defaultValue: "CASH", options: [{ value: "CASH", label: "Dinheiro entre contas físicas" }, { value: "BANK_TRANSFER", label: "Liquidação / transferência bancária" }, { value: "PIX", label: "Pix" }] },
        { name: "sessionId", label: "Sessão (se envolver dinheiro de caixa)", type: "select", required: false, options: sessionOptions }, { name: "eventId", label: "Evento (opcional)", type: "select", required: false, options: eventOptions },
      ]} submitLabel="Transferir" />
    </div>
    <section className="section card"><h2>Histórico recente</h2>{entries.length ? <div className="table-scroll"><table className="table"><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Origem → destino</th><th>Valor</th><th>Evento</th><th>Ação</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id}><td>{entry.createdAt.toLocaleString("pt-BR")}</td><td>{entry.kind}</td><td>{entry.description}{entry.reversalOfId && <div className="muted">Estorno de lançamento anterior</div>}{entry.reversals.length > 0 && <div className="muted">Estornado</div>}</td><td>{entry.debitAccount.name} → {entry.creditAccount.name}</td><td>{formatBRL(entry.amount)}</td><td>{entry.event?.name || "—"}</td><td>{entry.kind !== "DEPOSIT" && entry.kind !== "REVERSAL" && entry.reversals.length === 0 ? <ApiForm endpoint={`/api/transactions/${entry.id}/reverse`} title="Estornar lançamento" fields={[{ name: "reason", label: "Justificativa" }]} submitLabel="Estornar" /> : "—"}</td></tr>)}</tbody></table></div> : <p className="empty">Nenhuma movimentação registrada.</p>}</section>
  </>;
}
