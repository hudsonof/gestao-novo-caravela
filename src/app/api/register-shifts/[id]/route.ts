import { prisma } from "@/lib/db";
import { ApiError, handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const actor = await requireManager();
    const { id } = await context.params;

    return prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "CashRegisterShift" WHERE "id" = ${id} FOR UPDATE`;
      if (!rows.length) throw new ApiError(404, "Operação não encontrada.");

      const shift = await tx.cashRegisterShift.findUnique({
        where: { id },
        include: {
          register: { select: { id: true, name: true, sector: true } },
          employee: { select: { id: true, name: true } },
          withdrawals: { orderBy: { createdAt: "asc" } },
          closing: true,
        },
      });
      if (!shift) throw new ApiError(404, "Fechamento não encontrado.");


      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          entity: "CashRegisterShift",
          entityId: id,
          action: "DELETE",
          before: {
            register: shift.register,
            employee: shift.employee,
            status: shift.status,
            openingFloat: shift.openingFloat.toString(),
            openedAt: shift.openedAt.toISOString(),
            closedAt: shift.closedAt?.toISOString() ?? null,
            withdrawals: shift.withdrawals.map((withdrawal) => ({
              id: withdrawal.id,
              amount: withdrawal.amount.toString(),
              observation: withdrawal.observation,
              createdAt: withdrawal.createdAt.toISOString(),
            })),
            closing: shift.closing ? {
              id: shift.closing.id,
              cashSales: shift.closing.cashSales.toString(),
              machineSales: shift.closing.machineSales.toString(),
              debitSales: shift.closing.debitSales.toString(),
              creditSales: shift.closing.creditSales.toString(),
              pixSales: shift.closing.pixSales.toString(),
              countedCash: shift.closing.countedCash.toString(),
              expectedCash: shift.closing.expectedCash.toString(),
              difference: shift.closing.difference.toString(),
              justification: shift.closing.justification,
              closedById: shift.closing.closedById,
              closedAt: shift.closing.closedAt.toISOString(),
            } : null,
          },
        },
      });

      if (shift.closing) {
        await tx.cashRegisterClosing.delete({ where: { id: shift.closing.id } });
      }
      await tx.cashRegisterWithdrawal.deleteMany({ where: { shiftId: id } });
      await tx.cashRegisterShift.delete({ where: { id } });
      return { id, deleted: true };
    });
  });
}
