import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/authorization";
import { EmployeeManager } from "@/components/employee-manager";

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
  if (requestedPage > totalPages) redirect(currentPage === 1 ? "/equipe" : "/equipe?page=" + currentPage);

  const employees = await prisma.employee.findMany({
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: {
      _count: { select: { sessions: true, compensations: true, registerShifts: true } },
      sessions: { where: { status: "OPEN" }, select: { id: true } },
      registerShifts: { where: { status: "OPEN" }, select: { id: true } },
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  return <>
    <h1>Colaboradores</h1>
    <p className="muted">Cadastre e mantenha os colaboradores que podem ser associados a uma operação de caixa.</p>
    <EmployeeManager
      employees={employees.map(({ _count, sessions, registerShifts, ...employee }) => ({
        id: employee.id,
        name: employee.name,
        position: employee.position,
        active: employee.active,
        hasHistory: _count.sessions + _count.compensations + _count.registerShifts > 0,
        openShifts: sessions.length + registerShifts.length,
      }))}
      currentPage={currentPage}
      totalPages={totalPages}
      totalEmployees={totalEmployees}
    />
  </>;
}
