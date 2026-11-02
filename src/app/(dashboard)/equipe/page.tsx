import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { businessDateKey } from "@/lib/dates";
import { requireManager } from "@/lib/authorization";
import { EmployeeManager } from "@/components/employee-manager";
import { ApiForm } from "@/components/api-form";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

export default async function Equipe({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireManager();
  const params = await searchParams;
  const parsedPage = Number(params.page);
  const requestedPage = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const totalEmployees = await prisma.employee.count();
  const totalPages = Math.max(1, Math.ceil(totalEmployees / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  if (requestedPage > totalPages) redirect(currentPage === 1 ? "/equipe" : `/equipe?page=${currentPage}`);

  const [employees, activeEmployees, events, accounts, compensations] = await Promise.all([
    prisma.employee.findMany({
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        _count: { select: { sessions: true, compensations: true } },
        sessions: { where: { status: "OPEN" }, select: { id: true } },
      },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    prisma.employee.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.event.findMany({ where: { status: { not: "CANCELLED" } }, orderBy: { startsAt: "desc" }, take: 200 }),
    prisma.financialAccount.findMany({ where: { active: true }, include: { session: true }, orderBy: { name: "asc" } }),
    prisma.employeeCompensation.findMany({ include: { employee: true, event: { select: { name: true } }, payments: { include: { entry: { include: { reversals: true } } } } }, orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }], take: 500 }),
  ]);

  const pending = compensations.filter((compensation) => compensation.status === "OPEN" || compensation.status === "PARTIAL");
  const todayKey = businessDateKey(new Date());
  const payingAccounts = accounts.filter((account) => account.kind !== "CASH" || account.session?.status === "OPEN");
  const employeeOptions = activeEmployees.map((employee) => ({ value: employee.id, label: employee.name }));
  const eventOptions = events.map((event) => ({ value: event.id, label: event.name }));
  const pendingOptions = pending.map((compensation) => ({
    value: compensation.id,
    label: `${compensation.employee.name} · ${compensation.description} · ${formatBRL(compensation.amount)}`,
  }));
  const accountOptions = payingAccounts.map((account) => ({ value: account.id, label: `${account.name} · ${account.kind}` }));

  return <>
    <h1>Colaboradores</h1>
    <p className="muted">Cadastro da equipe, diárias, cachês e pagamentos associados a eventos.</p>
    <EmployeeManager
      employees={employees.map(({ _count, sessions, ...employee }) => ({
        id: employee.id,
        name: employee.name,
        position: employee.position,
        active: employee.active,
        hasHistory: _count.sessions > 0 || _count.compensations > 0,
        openSessions: sessions.length,
      }))}
      activeEmployeeOptions={employeeOptions}
      eventOptions={eventOptions}
      pendingCompensationOptions={pendingOptions}
      payingAccountOptions={accountOptions}
      currentPage={currentPage}
      totalPages={totalPages}
      totalEmployees={totalEmployees}
    />
    <section className="section card"><h2>Diárias e cachês</h2>{compensations.length ? <div className="table-scroll"><table className="table"><thead><tr><th>Colaborador</th><th>Tipo / descrição</th><th>Evento</th><th>Vencimento</th><th>Total</th><th>Pago</th><th>Pendente</th><th>Status</th></tr></thead><tbody>{compensations.map((compensation) => {
      const paid = compensation.payments.reduce((sum, payment) => sum + (payment.entry.reversals.length ? 0 : Number(payment.amount)), 0);
      const remaining = Math.max(0, Number(compensation.amount) - paid);
      const overdue = remaining > 0 && compensation.dueDate.toISOString().slice(0, 10) < todayKey;
      const status = overdue ? "VENCIDO" : compensation.status;
      return <tr key={compensation.id}><td>{compensation.employee.name}</td><td>{compensation.type === "DAILY" ? "Diária" : "Cachê"}<div className="muted">{compensation.description}</div></td><td>{compensation.event?.name || "Geral"}</td><td>{compensation.dueDate.toLocaleDateString("pt-BR", { timeZone: "UTC" })}</td><td>{formatBRL(compensation.amount)}</td><td>{formatBRL(paid)}</td><td>{formatBRL(remaining)}</td><td>{status}</td></tr>;
    })}</tbody></table></div> : <p className="empty">Nenhuma diária ou cachê registrado.</p>}</section>
  </>;
}
