import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/authorization";
import { UserManager } from "@/components/user-manager";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

export default async function Usuarios({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const actor = await requireAdmin();
  const params = await searchParams;
  const parsedPage = Number(params.page);
  const requestedPage = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const [totalUsers, cashRegisters] = await Promise.all([
    prisma.user.count(),
    prisma.cashRegister.findMany({ where: { active: true }, select: { id: true, name: true, sector: true }, orderBy: [{ sector: "asc" }, { name: "asc" }] }),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalUsers / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  if (requestedPage > totalPages) redirect(currentPage === 1 ? "/usuarios" : `/usuarios?page=${currentPage}`);

  const users = await prisma.user.findMany({
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      posCashRegisterId: true,
      posCashRegister: { select: { name: true } },
      _count: {
        select: {
          openedSessions: true,
          ledgerEntries: true,
          closings: true,
          expensesCreated: true,
          expensePaymentsCreated: true,
          depositsCreated: true,
          compensationsCreated: true,
          employeePaymentsCreated: true,
          auditLogs: true,
          posOrders: true,
        },
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  return <>
    <h1>Acessos ao sistema</h1>
    <p className="muted">Cadastre contas de administração, gerência e operação do PDV usando o mesmo login para o sistema e os aplicativos.</p>
    <UserManager
      users={users.map(({ _count, ...user }) => ({
        ...user,
        hasHistory: Object.values(_count).some((count) => count > 0),
      }))}
      registers={cashRegisters.map((register) => ({ value: register.id, label: `${register.name} · ${register.sector === "TICKETS" ? "Bilheteria" : register.sector === "TABLES" ? "Mesas" : "Bar"}` }))} 
      currentUserId={actor.userId}
      currentPage={currentPage}
      totalPages={totalPages}
      totalUsers={totalUsers}
    />
  </>;
}
