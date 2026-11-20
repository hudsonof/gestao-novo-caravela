import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { requireManager } from "@/lib/authorization";
import { ApiForm } from "@/components/api-form";
import { CashRegisterManager } from "@/components/cash-register-manager";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;
const sectorNames = { TICKETS: "Bilheteria", TABLES: "Mesas", BAR: "Bar" } as const;
const businessTimeZone = process.env.BUSINESS_TIME_ZONE || "America/Sao_Paulo";

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: businessTimeZone }).format(value);
}

export default async function Caixas({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireManager();
  const params = await searchParams;
  const parsedPage = Number(params.page);
  const requestedPage = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const [totalRegisters, activeRegisters, employees, legacyOpenSessions, openShifts, closedShifts] = await Promise.all([
    prisma.cashRegister.count(),
    prisma.cashRegister.findMany({ where: { active: true }, orderBy: [{ sector: "asc" }, { name: "asc" }], select: { id: true, name: true, sector: true } }),
    prisma.employee.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.cashSession.findMany({
      where: { status: "OPEN" },
      include: { register: true, event: true, employee: true, account: true },
      orderBy: { openedAt: "asc" },
    }),
    prisma.cashRegisterShift.findMany({
      where: { status: "OPEN" },
      include: { register: true, employee: true, withdrawals: { orderBy: { createdAt: "asc" } } },
      orderBy: { openedAt: "desc" },
    }),
    prisma.cashRegisterShift.findMany({
      where: { status: "CLOSED" },
      include: { register: true, employee: true, withdrawals: { orderBy: { createdAt: "asc" } }, closing: true },
      orderBy: { closedAt: "desc" },
      take: 25,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalRegisters / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  if (requestedPage > totalPages) redirect(currentPage === 1 ? "/caixas" : "/caixas?page=" + currentPage);

  const registers = await prisma.cashRegister.findMany({
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: {
      _count: { select: { sessions: true, registerShifts: true } },
      sessions: { where: { status: "OPEN" }, select: { id: true } },
      registerShifts: { where: { status: "OPEN" }, select: { id: true } },
    },
    orderBy: [{ sector: "asc" }, { name: "asc" }],
  });

  const registerOptions = activeRegisters.map((register) => ({
    value: register.id,
    label: register.name + " · " + sectorNames[register.sector],
  }));
  const employeeOptions = employees.map((employee) => ({ value: employee.id, label: employee.name }));

  return <>
    <h1>Controle de caixas</h1>
    <p className="muted">Abra cada caixa com o troco inicial, registre retiradas e informe as vendas no fechamento.</p>

    <section className="section">
      {registerOptions.length ? <ApiForm endpoint="/api/register-shifts" title="Abrir caixa" fields={[
        { name: "registerId", label: "Caixa", type: "select", options: registerOptions },
        { name: "employeeId", label: "Colaborador responsável (opcional)", type: "select", required: false, options: employeeOptions },
        { name: "openingFloat", label: "Troco inicial", type: "number", min: "0", step: "0.01", defaultValue: "0.00" },
      ]} submitLabel="Abrir caixa" /> : <div className="card empty">Cadastre e ative um caixa para iniciar uma operação.</div>}
    </section>


    {legacyOpenSessions.length > 0 && <section className="section">
      <h2>Sessões anteriores ainda abertas</h2>
      <div className="notice">Feche essas sessões antes de abrir o novo fluxo para o mesmo caixa. O histórico financeiro anterior será preservado.</div>
      <div className="session-grid">{legacyOpenSessions.map((session) => <div className="card" key={session.id}>
        <strong>{session.register.name}</strong>
        <p className="muted">{session.event.name} · responsável: {session.employee?.name || "não informado"}</p>
        <p>Saldo registrado: <strong>{formatBRL(session.account.balance)}</strong></p>
        <ApiForm endpoint={"/api/cash-sessions/" + session.id + "/close"} title="Encerrar sessão anterior" fields={[
          { name: "countedAmount", label: "Dinheiro contado", type: "number", min: "0", step: "0.01", defaultValue: session.account.balance.toFixed(2) },
          { name: "justification", label: "Justificativa se houver diferença", required: false },
        ]} submitLabel="Encerrar sessão" />
      </div>)}</div>
    </section>}
    <section className="section">
      <h2>Caixas abertos</h2>
      {openShifts.length ? <div className="session-grid">{openShifts.map((shift) => {
        const withdrawalsTotal = shift.withdrawals.reduce((sum, item) => sum + Number(item.amount), 0);
        const floatAfterWithdrawals = Number(shift.openingFloat) - withdrawalsTotal;
        return <div className="card" key={shift.id}>
          <div className="head">
            <div><strong>{shift.register.name}</strong><div className="muted">{sectorNames[shift.register.sector]} · aberto em {formatDate(shift.openedAt)}</div></div>
            <span className="tag">ABERTO</span>
          </div>
          <p className="muted">Responsável: {shift.employee?.name || "não informado"}</p>
          <div className="summary-row"><span>Troco inicial</span><strong>{formatBRL(shift.openingFloat)}</strong></div>
          <div className="summary-row"><span>Retiradas</span><strong>{formatBRL(withdrawalsTotal)}</strong></div>
          <div className="summary-row"><span>Troco menos retiradas <span className="muted">(sem vendas)</span></span><strong>{formatBRL(floatAfterWithdrawals)}</strong></div>
          {shift.withdrawals.length > 0 && <details className="section">
            <summary>Ver retiradas ({shift.withdrawals.length})</summary>
            <ul className="proof-list">{shift.withdrawals.map((item) => <li key={item.id}>{formatDate(item.createdAt)} · {formatBRL(item.amount)} · {item.observation}</li>)}</ul>
          </details>}
          <div className="form-grid section">
            <ApiForm endpoint={"/api/register-shifts/" + shift.id + "/withdrawals"} title="Retirada do caixa" fields={[
              { name: "amount", label: "Valor da retirada", type: "number", min: "0.01", step: "0.01" },
              { name: "observation", label: "Observação" },
            ]} submitLabel="Registrar retirada" />
            <ApiForm endpoint={"/api/register-shifts/" + shift.id + "/close"} title="Fechamento e batimento" fields={[
              { name: "cashSales", label: "Vendas em dinheiro", type: "number", min: "0", step: "0.01", defaultValue: "0.00" },
              { name: "debitSales", label: "Vendas no débito", type: "number", min: "0", step: "0.01", defaultValue: "0.00" },
              { name: "creditSales", label: "Vendas no crédito", type: "number", min: "0", step: "0.01", defaultValue: "0.00" },
              { name: "pixSales", label: "Vendas no Pix", type: "number", min: "0", step: "0.01", defaultValue: "0.00" },
              { name: "countedCash", label: "Dinheiro contado no caixa", type: "number", min: "0", step: "0.01", defaultValue: "0.00" },
              { name: "justification", label: "Justificativa da diferença (se houver)", required: false },
            ]} submitLabel="Fechar caixa" />
          </div>
          <p className="muted">Dinheiro esperado = troco inicial + vendas em dinheiro − retiradas. Diferenças exigem justificativa.</p>
        </div>;
      })}</div> : <div className="card empty">Nenhum caixa aberto.</div>}
    </section>

    <section className="section card">
      <h2>Fechamentos recentes</h2>
      {closedShifts.length ? <div className="table-scroll"><table className="table">
        <thead><tr><th>Caixa / data</th><th>Responsável</th><th>Vendas (dinheiro)</th><th>Cartões</th><th>Pix</th><th>Esperado</th><th>Contado</th><th>Diferença</th><th>Retiradas</th></tr></thead>
        <tbody>{closedShifts.map((shift) => {
          const closing = shift.closing;
          const cashSales = Number(closing?.cashSales || 0);
          const cardSales = Number(closing?.debitSales || 0) + Number(closing?.creditSales || 0);
          const pixSales = Number(closing?.pixSales || 0);
          const withdrawalsTotal = shift.withdrawals.reduce((sum, item) => sum + Number(item.amount), 0);
          return <tr key={shift.id}>
            <td><strong>{shift.register.name}</strong><div className="muted">{formatDate(shift.closedAt || shift.openedAt)}</div></td>
            <td>{shift.employee?.name || "—"}</td>
            <td>{formatBRL(cashSales)}</td>
            <td>{formatBRL(cardSales)}</td>
            <td>{formatBRL(pixSales)}</td>
            <td>{closing ? formatBRL(closing.expectedCash) : "—"}</td>
            <td>{closing ? formatBRL(closing.countedCash) : "—"}</td>
            <td>{closing ? <><strong>{formatBRL(closing.difference)}</strong>{closing.justification && <div className="muted">{closing.justification}</div>}</> : "—"}</td>
            <td><details><summary>{formatBRL(withdrawalsTotal)}</summary><ul className="proof-list">{shift.withdrawals.map((item) => <li key={item.id}>{formatDate(item.createdAt)} · {formatBRL(item.amount)} · {item.observation}</li>)}</ul></details></td>
          </tr>;
        })}</tbody>
      </table></div> : <p className="empty">Os fechamentos aparecerão aqui após o primeiro caixa ser encerrado.</p>}
    </section>

    <CashRegisterManager
      registers={registers.map((register) => ({
        id: register.id,
        name: register.name,
        sector: register.sector,
        active: register.active,
        totalActivity: register._count.sessions + register._count.registerShifts,
        openSessions: register.sessions.length + register.registerShifts.length,
      }))}
      currentPage={currentPage}
      totalPages={totalPages}
      totalRegisters={totalRegisters}
    />
  </>;
}
