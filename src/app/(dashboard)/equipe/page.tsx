import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/authorization";
import { EmployeeManager } from "@/components/employee-manager";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

export default async function Equipe({ searchParams }: { searchParams: Promise<{ page?: string; q?: string; status?: string }> }) {
  await requireManager();
  const params = await searchParams;
  const parsedPage = Number(params.page);
  const requestedPage = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const search = (params.q || "").trim().slice(0, 100);
  const status = params.status === "active" || params.status === "inactive" ? params.status : "";
  const where: Prisma.EmployeeWhereInput = {
    ...(status ? { active: status === "active" } : {}),
    ...(search ? { OR: [
      { name: { contains: search, mode: "insensitive" } },
      { position: { contains: search, mode: "insensitive" } },
    ] } : {}),
  };

  const [totalEmployees, totalActive, totalInactive, openAssignments] = await Promise.all([
    prisma.employee.count({ where }),
    prisma.employee.count({ where: { active: true } }),
    prisma.employee.count({ where: { active: false } }),
    prisma.employee.count({
      where: {
        OR: [
          { sessions: { some: { status: "OPEN" } } },
          { registerShifts: { some: { status: "OPEN" } } },
        ],
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalEmployees / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  if (requestedPage > totalPages) {
    const query = new URLSearchParams();
    if (search) query.set("q", search);
    if (status) query.set("status", status);
    if (currentPage > 1) query.set("page", String(currentPage));
    const queryString = query.toString();
    redirect(queryString ? "/equipe?" + queryString : "/equipe");
  }

  const employees = await prisma.employee.findMany({
    where,
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: {
      _count: { select: { sessions: true, compensations: true, registerShifts: true, waiterOrders: true, operatorOrders: true } },
      sessions: { where: { status: "OPEN" }, select: { id: true } },
      registerShifts: { where: { status: "OPEN" }, select: { id: true } },
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  return <>
    <header className="employee-page-header">
      <div>
        <p className="eyebrow">Equipe e operação</p>
        <h1>Colaboradores</h1>
        <p className="muted">Encontre rapidamente quem pode ser associado às operações de caixa.</p>
      </div>
    </header>
    <EmployeeManager
      employees={employees.map(({ _count, sessions, registerShifts, ...employee }) => ({
        id: employee.id,
        name: employee.name,
        position: employee.position,
        active: employee.active,
        hasHistory: _count.sessions + _count.compensations + _count.registerShifts + _count.waiterOrders + _count.operatorOrders > 0,
        openShifts: sessions.length + registerShifts.length,
      }))}
      currentPage={currentPage}
      totalPages={totalPages}
      totalEmployees={totalEmployees}
      totalActive={totalActive}
      totalInactive={totalInactive}
      openAssignments={openAssignments}
      search={search}
      status={status}
    />
  </>;
}
