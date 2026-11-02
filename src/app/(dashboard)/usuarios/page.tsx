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

  const totalUsers = await prisma.user.count();
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
      _count: {
        select: {
          openedSessions: true,
          ledgerEntries: true,
          closings: true,
          expensesCreated: true,
          expensePaymentsCreated: true,
          depositsCreated: true,
          depositAttachments: true,
          compensationsCreated: true,
          employeePaymentsCreated: true,
          auditLogs: true,
        },
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  return <>
    <h1>Acessos ao sistema</h1>
    <p className="muted">Somente administradores e gerentes têm credenciais; colaboradores de caixa não precisam acessar o sistema.</p>
    <UserManager
      users={users.map(({ _count, ...user }) => ({
        ...user,
        hasHistory: Object.values(_count).some((count) => count > 0),
      }))}
      currentUserId={actor.userId}
      currentPage={currentPage}
      totalPages={totalPages}
      totalUsers={totalUsers}
    />
  </>;
}
