import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { ApiError, handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";

const PAGE_SIZE = 10;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    await requireManager();
    const { id } = await context.params;
    const register = await prisma.cashRegister.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!register) throw new ApiError(404, "Caixa não encontrado.");

    const requestedPage = Number(new URL(request.url).searchParams.get("page") || "1");
    const safePage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const [totalOperations, legacySessionCount] = await Promise.all([
      prisma.cashRegisterShift.count({ where: { registerId: id } }),
      prisma.cashSession.count({ where: { registerId: id } }),
    ]);
    const totalPages = Math.max(1, Math.ceil(totalOperations / PAGE_SIZE));
    const page = Math.min(safePage, totalPages);
    const operations = await prisma.cashRegisterShift.findMany({
      where: { registerId: id },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        employee: { select: { name: true } },
        withdrawals: { select: { amount: true } },
        closing: true,
      },
      orderBy: [{ openedAt: "desc" }, { id: "desc" }],
    });

    return {
      register,
      operations: operations.map((operation) => {
        const closing = operation.closing;
        const withdrawalsTotal = operation.withdrawals.reduce(
          (sum, withdrawal) => sum.plus(withdrawal.amount),
          new Prisma.Decimal(0),
        );
        return {
          id: operation.id,
          status: operation.status,
          openedAt: operation.openedAt.toISOString(),
          closedAt: operation.closedAt?.toISOString() ?? null,
          employeeName: operation.employee?.name ?? null,
          openingFloat: formatBRL(operation.openingFloat),
          withdrawalsTotal: formatBRL(withdrawalsTotal),
          withdrawalsCount: operation.withdrawals.length,
          cashSales: closing ? formatBRL(closing.cashSales) : null,
          machineSales: closing ? formatBRL(closing.machineSales) : null,
          expectedCash: closing ? formatBRL(closing.expectedCash) : null,
          countedCash: closing ? formatBRL(closing.countedCash) : null,
          difference: closing?.difference.toString() ?? null,
          differenceLabel: closing ? formatBRL(closing.difference) : null,
        };
      }),
      page,
      pageSize: PAGE_SIZE,
      totalPages,
      totalOperations,
      legacySessionCount,
    };
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const actor = await requireManager();
    const { id } = await context.params;

    return prisma.$transaction(async (tx) => {
      const registerRows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "CashRegister" WHERE "id" = ${id} FOR UPDATE`;
      if (!registerRows.length) throw new ApiError(404, "Caixa não encontrado.");

      const operationRows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "CashRegisterShift" WHERE "registerId" = ${id} ORDER BY "id" FOR UPDATE`;
      const ids = operationRows.map((row) => row.id);
      if (!ids.length) return { registerId: id, deletedCount: 0 };

      const operations = await tx.cashRegisterShift.findMany({
        where: { id: { in: ids } },
        include: {
          register: { select: { id: true, name: true, sector: true } },
          employee: { select: { id: true, name: true } },
          withdrawals: { orderBy: { createdAt: "asc" } },
          closing: true,
        },
      });

      for (const operation of operations) {
        await tx.auditLog.create({
          data: {
            actorId: actor.userId,
            entity: "CashRegisterShift",
            entityId: operation.id,
            action: "DELETE",
            before: {
              register: operation.register,
              employee: operation.employee,
              status: operation.status,
              openingFloat: operation.openingFloat.toString(),
              openedAt: operation.openedAt.toISOString(),
              closedAt: operation.closedAt?.toISOString() ?? null,
              withdrawals: operation.withdrawals.map((withdrawal) => ({
                id: withdrawal.id,
                amount: withdrawal.amount.toString(),
                observation: withdrawal.observation,
                createdAt: withdrawal.createdAt.toISOString(),
              })),
              closing: operation.closing ? {
                id: operation.closing.id,
                cashSales: operation.closing.cashSales.toString(),
                machineSales: operation.closing.machineSales.toString(),
                debitSales: operation.closing.debitSales.toString(),
                creditSales: operation.closing.creditSales.toString(),
                pixSales: operation.closing.pixSales.toString(),
                countedCash: operation.closing.countedCash.toString(),
                expectedCash: operation.closing.expectedCash.toString(),
                difference: operation.closing.difference.toString(),
                justification: operation.closing.justification,
                closedById: operation.closing.closedById,
                closedAt: operation.closing.closedAt.toISOString(),
              } : null,
            },
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          entity: "CashRegister",
          entityId: id,
          action: "CLEAR_OPERATIONS",
          before: { deletedCount: operations.length, operationIds: ids },
        },
      });
      await tx.cashRegisterClosing.deleteMany({ where: { shiftId: { in: ids } } });
      await tx.cashRegisterWithdrawal.deleteMany({ where: { shiftId: { in: ids } } });
      await tx.cashRegisterShift.deleteMany({ where: { id: { in: ids } } });
      return { registerId: id, deletedCount: operations.length };
    });
  });
}
