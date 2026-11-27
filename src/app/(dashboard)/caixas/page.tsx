import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { requireManager } from "@/lib/authorization";
import { ApiForm } from "@/components/api-form";
import { CashRegisterManager } from "@/components/cash-register-manager";
import { CashShiftActions } from "@/components/cash-shift-actions";
import { CashRegisterOpening } from "@/components/cash-register-opening";
import { CashClosingHistory } from "@/components/cash-closing-history";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;
const sectorNames = { TICKETS: "Bilheteria", TABLES: "Mesas", BAR: "Bar" } as const;
const businessTimeZone = process.env.BUSINESS_TIME_ZONE || "America/Sao_Paulo";

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: businessTimeZone }).format(value);
}

export default async function Caixas({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const actor = await requireManager();
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
      take: 100,
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
  const openWithdrawalsTotal = openShifts.reduce((sum, shift) => sum + shift.withdrawals.reduce((subtotal, item) => subtotal + Number(item.amount), 0), 0);
  const recentDivergences = closedShifts.filter((shift) => shift.closing && Number(shift.closing.difference) !== 0).length;

  return <>
    <header className="cash-page-header">
      <div>
        <p className="eyebrow">Operação financeira</p>
        <h1>Controle de caixas</h1>
        <p className="muted">Acompanhe as operações abertas e feche o turno com a conferência em mãos.</p>
      </div>
      <div className="cash-page-actions">
        {registerOptions.length ? <CashRegisterOpening registers={registerOptions} employees={employeeOptions} /> : <a className="button" href="#cadastro-caixas">Cadastrar primeiro caixa</a>}
        <a className="button button-secondary" href="#cadastro-caixas">Gerenciar caixas</a>
      </div>
    </header>

    <section className="cash-kpi-grid" aria-label="Resumo dos caixas">
      <article className="cash-kpi"><span>Caixas abertos</span><strong>{openShifts.length}</strong><small>Operações em andamento</small></article>
      <article className="cash-kpi"><span>Retiradas em caixas abertos</span><strong>{formatBRL(openWithdrawalsTotal)}</strong><small>Não inclui vendas ainda não informadas</small></article>
      <article className="cash-kpi"><span>Fechamentos com diferença</span><strong>{recentDivergences}</strong><small>Entre os 100 fechamentos recentes</small></article>
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
    <section className="section cash-open-section">
      <div className="cash-section-heading"><div><h2>Caixas abertos</h2><p className="muted">As ações aparecem no próprio caixa para reduzir etapas durante o turno.</p></div><span className="tag tag-open">{openShifts.length} abertos</span></div>
      {openShifts.length ? <div className="session-grid">{openShifts.map((shift) => {
        const withdrawalsTotal = shift.withdrawals.reduce((sum, item) => sum + Number(item.amount), 0);
        const floatAfterWithdrawals = Number(shift.openingFloat) - withdrawalsTotal;
        return <div className="card cash-shift-card" key={shift.id}>
          <div className="head">
            <div><strong>{shift.register.name}</strong><div className="muted">{sectorNames[shift.register.sector]} · aberto em {formatDate(shift.openedAt)}</div></div>
            <span className="tag tag-open">ABERTO</span>
          </div>
          <p className="muted">Responsável: {shift.employee?.name || "não informado"}</p>
          <div className="summary-row"><span>Troco inicial</span><strong>{formatBRL(shift.openingFloat)}</strong></div>
          <div className="summary-row"><span>Retiradas</span><strong>{formatBRL(withdrawalsTotal)}</strong></div>
          <div className="summary-row cash-provisional-row"><span>Saldo provisório <small>(troco − retiradas; sem vendas)</small></span><strong className={floatAfterWithdrawals < 0 ? "money-negative" : ""}>{formatBRL(floatAfterWithdrawals)}</strong></div>
          <CashShiftActions
            shiftId={shift.id}
            openingFloat={Number(shift.openingFloat)}
            withdrawalsTotal={withdrawalsTotal}
            withdrawals={shift.withdrawals.map((item) => ({
              id: item.id,
              dateLabel: formatDate(item.createdAt),
              amountLabel: formatBRL(item.amount),
              observation: item.observation,
            }))}
          />
          <p className="muted cash-shift-footnote">O saldo provisório não inclui vendas. A conferência completa aparece antes do fechamento.</p>
        </div>;
      })}</div> : <div className="card empty cash-empty"><strong>Nenhum caixa aberto</strong><p>Abra um caixa para começar a operação do turno.</p>{registerOptions.length ? <CashRegisterOpening registers={registerOptions} employees={employeeOptions} /> : <a className="button button-secondary" href="#cadastro-caixas">Cadastrar um caixa</a>}</div>}
    </section>

    <CashClosingHistory canDelete={actor.role === "ADMIN"} records={closedShifts.map((shift) => {
      const closing = shift.closing;
      const machineSales = Number(closing?.machineSales ?? (Number(closing?.debitSales || 0) + Number(closing?.creditSales || 0) + Number(closing?.pixSales || 0)));
      const withdrawalsTotal = shift.withdrawals.reduce((sum, item) => sum + Number(item.amount), 0);
      const closedAt = shift.closedAt || shift.openedAt;
      return {
        id: shift.id,
        registerName: shift.register.name,
        sector: shift.register.sector,
        sectorLabel: sectorNames[shift.register.sector],
        employeeName: shift.employee?.name || "—",
        closedAt: closedAt.toISOString(),
        dateLabel: formatDate(closedAt),
        cashSales: formatBRL(closing?.cashSales || 0),
        machineSales: formatBRL(machineSales),
        expectedCash: closing ? formatBRL(closing.expectedCash) : null,
        countedCash: closing ? formatBRL(closing.countedCash) : null,
        difference: closing ? Number(closing.difference) : null,
        differenceLabel: closing ? formatBRL(closing.difference) : null,
        justification: closing?.justification || null,
        withdrawalsTotal: formatBRL(withdrawalsTotal),
        withdrawals: shift.withdrawals.map((item) => formatDate(item.createdAt) + " · " + formatBRL(item.amount) + " · " + item.observation),
      };
    })} />

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
