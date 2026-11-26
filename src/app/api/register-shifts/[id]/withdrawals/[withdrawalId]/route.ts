import { prisma } from "@/lib/db";
import { ApiError, handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string; withdrawalId: string }> }) {
  return handleApi(async () => {
    const actor = await requireManager();
    const { id, withdrawalId } = await context.params;

    return prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "CashRegisterShift" WHERE "id" = ${id} FOR UPDATE`;
      if (!rows.length) throw new ApiError(404, "Operação de caixa não encontrada.");

      const shift = await tx.cashRegisterShift.findUnique({ where: { id }, select: { status: true } });
      if (!shift) throw new ApiError(404, "Operação de caixa não encontrada.");
      if (shift.status !== "OPEN") throw new ApiError(409, "Não é possível excluir retiradas de um caixa fechado.");

      const withdrawal = await tx.cashRegisterWithdrawal.findFirst({ where: { id: withdrawalId, shiftId: id } });
      if (!withdrawal) throw new ApiError(404, "Retirada não encontrada neste caixa.");

      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          entity: "CashRegisterShift",
          entityId: id,
          action: "WITHDRAWAL_DELETE",
          before: {
            withdrawalId: withdrawal.id,
            amount: withdrawal.amount.toString(),
            observation: withdrawal.observation,
            createdAt: withdrawal.createdAt.toISOString(),
          },
        },
      });
      await tx.cashRegisterWithdrawal.delete({ where: { id: withdrawalId } });
      return { id: withdrawalId, deleted: true };
    });
  });
}
