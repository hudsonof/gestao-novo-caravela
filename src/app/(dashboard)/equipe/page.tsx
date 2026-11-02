import { prisma } from "@/lib/db";
import { ApiForm } from "@/components/api-form";
import { formatBRL } from "@/lib/money";
import { businessDateKey } from "@/lib/dates";
export const dynamic = "force-dynamic";

export default async function Equipe() {
  const [employees, events, accounts, compensations] = await Promise.all([
    prisma.employee.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }),
    prisma.event.findMany({ where: { status: { not: "CANCELLED" } }, orderBy: { startsAt: "desc" }, take: 200 }),
    prisma.financialAccount.findMany({ where: { active: true }, include: { session: true }, orderBy: { name: "asc" } }),
    prisma.employeeCompensation.findMany({ include: { employee: true, event: { select: { name: true } }, payments: { include: { entry: { include: { reversals: true } } } } }, orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }], take: 500 }),
  ]);
  const activeEmployees = employees.filter((employee) => employee.active);
  const pending = compensations.filter((compensation) => compensation.status === "OPEN" || compensation.status === "PARTIAL");
  const todayKey = businessDateKey(new Date());
  const payingAccounts = accounts.filter((account) => account.kind !== "CASH" || account.session?.status === "OPEN");
  const methodOptions = [{ value: "CASH", label: "Dinheiro" }, { value: "PIX", label: "Pix" }, { value: "BANK_TRANSFER", label: "Transferência bancária" }, { value: "DEBIT", label: "Débito" }, { value: "CREDIT", label: "Crédito" }];

  return <>
    <h1>Colaboradores</h1><p className="muted">Cadastro da equipe, diárias, cachês e pagamentos associados a eventos.</p>
    <div className="form-grid">
      <ApiForm endpoint="/api/employees" title="Novo colaborador" fields={[{ name: "name", label: "Nome" }, { name: "position", label: "Função", required: false }]} submitLabel="Cadastrar colaborador" />
      <ApiForm endpoint="/api/employee-compensations" title="Lançar diária ou cachê" fields={[
        { name: "employeeId", label: "Colaborador", type: "select", options: activeEmployees.map((employee) => ({ value: employee.id, label: employee.name })) },
        { name: "type", label: "Tipo", type: "select", options: [{ value: "DAILY", label: "Diária" }, { value: "CACHE", label: "Cachê" }] },
        { name: "description", label: "Descrição" },
        { name: "eventId", label: "Evento (opcional)", type: "select", required: false, options: events.map((event) => ({ value: event.id, label: event.name })) },
        { name: "amount", label: "Valor combinado", type: "number", min: "0.01", step: "0.01" },
        { name: "dueDate", label: "Data prevista para pagamento", type: "date" },
      ]} submitLabel="Registrar valor devido" />
      <ApiForm endpoint="/api/employee-payments" title="Pagar diária ou cachê" fields={[
        { name: "compensationId", label: "Valor pendente", type: "select", options: pending.map((compensation) => ({ value: compensation.id, label: `${compensation.employee.name} · ${compensation.description} · ${formatBRL(compensation.amount)}` })) },
        { name: "amount", label: "Valor pago", type: "number", min: "0.01", step: "0.01" },
        { name: "sourceAccountId", label: "Conta de origem", type: "select", options: payingAccounts.map((account) => ({ value: account.id, label: `${account.name} · ${account.kind}` })) },
        { name: "method", label: "Meio de pagamento", type: "select", options: methodOptions },
        { name: "description", label: "Observação", required: false },
      ]} submitLabel="Registrar pagamento" />
    </div>
    <section className="section card"><h2>Equipe cadastrada</h2>{employees.length ? <div className="table-scroll"><table className="table"><thead><tr><th>Nome</th><th>Função</th><th>Situação</th><th>Ação</th></tr></thead><tbody>{employees.map((employee) => <tr key={employee.id}><td>{employee.name}</td><td>{employee.position || "—"}</td><td>{employee.active ? "Ativo" : "Inativo"}</td><td><ApiForm endpoint={`/api/employees/${employee.id}/active`} method="PATCH" hidden={{ active: employee.active ? "false" : "true" }} title={employee.active ? "Inativar colaborador" : "Reativar colaborador"} fields={[]} submitLabel={employee.active ? "Inativar" : "Reativar"} /></td></tr>)}</tbody></table></div> : <p className="empty">Nenhum colaborador cadastrado.</p>}</section>
    <section className="section card"><h2>Diárias e cachês</h2>{compensations.length ? <div className="table-scroll"><table className="table"><thead><tr><th>Colaborador</th><th>Tipo / descrição</th><th>Evento</th><th>Vencimento</th><th>Total</th><th>Pago</th><th>Pendente</th><th>Status</th></tr></thead><tbody>{compensations.map((compensation) => {
      const paid = compensation.payments.reduce((sum, payment) => sum + (payment.entry.reversals.length ? 0 : Number(payment.amount)), 0);
      const remaining = Math.max(0, Number(compensation.amount) - paid);
      const overdue = remaining > 0 && compensation.dueDate.toISOString().slice(0, 10) < todayKey;
      const status = overdue ? "VENCIDO" : compensation.status;
      return <tr key={compensation.id}><td>{compensation.employee.name}</td><td>{compensation.type === "DAILY" ? "Diária" : "Cachê"}<div className="muted">{compensation.description}</div></td><td>{compensation.event?.name || "Geral"}</td><td>{compensation.dueDate.toLocaleDateString("pt-BR", { timeZone: "UTC" })}</td><td>{formatBRL(compensation.amount)}</td><td>{formatBRL(paid)}</td><td>{formatBRL(remaining)}</td><td>{status}</td></tr>;
    })}</tbody></table></div> : <p className="empty">Nenhuma diária ou cachê registrado.</p>}</section>
  </>;
}
