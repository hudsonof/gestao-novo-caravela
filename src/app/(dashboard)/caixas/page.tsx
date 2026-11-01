import { prisma } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { ApiForm } from "@/components/api-form";
export const dynamic = "force-dynamic";

const sectorNames = { TICKETS: "Bilheteria", TABLES: "Mesas", BAR: "Bar" };

export default async function Caixas() {
  const [registers, events, employees, sessions, closedSessions, vaults] = await Promise.all([
    prisma.cashRegister.findMany({ where: { active: true }, orderBy: [{ sector: "asc" }, { name: "asc" }] }),
    prisma.event.findMany({ where: { status: "OPEN" }, orderBy: { startsAt: "desc" } }),
    prisma.employee.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.cashSession.findMany({ where: { status: "OPEN" }, include: { register: true, account: true, event: true, employee: true }, orderBy: { openedAt: "desc" } }),
    prisma.cashSession.findMany({ where: { status: "CLOSED", account: { balance: { gt: 0 } } }, include: { register: true, account: true, event: true }, orderBy: { closedAt: "desc" }, take: 100 }),
    prisma.financialAccount.findMany({ where: { kind: "VAULT", active: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const eventOptions = events.map((event) => ({ value: event.id, label: event.name }));
  const registerOptions = registers.map((register) => ({ value: register.id, label: `${register.name} · ${sectorNames[register.sector]}` }));
  return <>
    <h1>Caixas e sessões</h1><p className="muted">Bilheteria, mesas e bar · cada sessão pertence a um evento e a um colaborador.</p>
    <div className="form-grid">
      <ApiForm endpoint="/api/registers" title="Cadastrar caixa" fields={[{ name: "name", label: "Nome do caixa" }, { name: "sector", label: "Setor", type: "select", options: [{ value: "TICKETS", label: "Bilheteria" }, { value: "TABLES", label: "Mesas" }, { value: "BAR", label: "Bar" }] }]} submitLabel="Cadastrar caixa" />
      <ApiForm endpoint="/api/cash-sessions" title="Abrir sessão de caixa" fields={[
        { name: "eventId", label: "Evento aberto", type: "select", options: eventOptions },
        { name: "registerId", label: "Caixa", type: "select", options: registerOptions },
        { name: "employeeId", label: "Colaborador responsável", type: "select", required: false, options: employees.map((employee) => ({ value: employee.id, label: employee.name })) },
        { name: "openingFloat", label: "Troco inicial", type: "number", min: "0", step: "0.01", defaultValue: "0.00" },
      ]} submitLabel="Abrir caixa" />
    </div>
    <section className="section"><h2>Sessões abertas</h2>{sessions.length ? <div className="session-grid">{sessions.map((session) => <div className="card" key={session.id}>
      <div className="head"><div><strong>{session.register.name}</strong><div className="muted">{sectorNames[session.register.sector]} · {session.event.name}</div></div><span className="tag">ABERTO</span></div>
      <p className="muted">Responsável: {session.employee?.name || "não informado"}</p><div className="value">{formatBRL(session.account.balance)}</div>
      <ApiForm endpoint={`/api/cash-sessions/${session.id}/close`} title="Fechamento e conferência" fields={[{ name: "countedAmount", label: "Valor contado", type: "number", min: "0", step: "0.01", defaultValue: session.account.balance.toFixed(2) }, { name: "justification", label: "Justificativa se houver divergência", required: false }]} submitLabel="Fechar caixa" />
      {vaults[0] && <ApiForm endpoint="/api/transfers" title="Sangria para o cofre" hidden={{ sourceAccountId: session.accountId, destinationAccountId: vaults[0].id, sessionId: session.id, eventId: session.eventId }} fields={[{ name: "amount", label: "Valor", type: "number", min: "0.01", step: "0.01" }, { name: "description", label: "Motivo" }]} submitLabel="Registrar sangria" />}
    </div>)}</div> : <div className="card empty">Nenhuma sessão de caixa aberta.</div>}</section>
    <section className="section"><h2>Saldos de caixas fechados</h2>{closedSessions.length ? <div className="session-grid">{closedSessions.map((session) => <div className="card" key={session.id}><strong>{session.register.name}</strong><p className="muted">{session.event.name} · sessão encerrada</p><div className="value">{formatBRL(session.account.balance)}</div>{vaults[0] && <ApiForm endpoint="/api/transfers" title="Recolher saldo para o cofre" hidden={{ sourceAccountId: session.accountId, destinationAccountId: vaults[0].id, sessionId: session.id, eventId: session.eventId }} fields={[{ name: "amount", label: "Valor recolhido", type: "number", min: "0.01", step: "0.01", defaultValue: session.account.balance.toFixed(2) }, { name: "description", label: "Identificação do recolhimento", defaultValue: "Saldo de caixa encerrado" }]} submitLabel="Transferir para o cofre" />}</div>)}</div> : <div className="card empty">Todos os caixas encerrados estão sem saldo pendente.</div>}</section>
  </>;
}
