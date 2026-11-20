import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";

const schema = z.object({
  cashSales: z.coerce.string().regex(/^\d+(?:\.\d{1,2})?$/, "Informe um valor válido."),
  debitSales: z.coerce.string().regex(/^\d+(?:\.\d{1,2})?$/, "Informe um valor válido."),
  creditSales: z.coerce.string().regex(/^\d+(?:\.\d{1,2})?$/, "Informe um valor válido."),
  pixSales: z.coerce.string().regex(/^\d+(?:\.\d{1,2})?$/, "Informe um valor válido."),
  countedCash: z.coerce.string().regex(/^\d+(?:\.\d{1,2})?$/, "Informe um valor válido."),
  justification: z.string().trim().max(500).optional(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const actor = await requireManager();
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    const idempotencyKey = z.string().uuid().parse(request.headers.get("x-idempotency-key"));
    const cashSales = new Prisma.Decimal(input.cashSales);
    const debitSales = new Prisma.Decimal(input.debitSales);
    const creditSales = new Prisma.Decimal(input.creditSales);
    const pixSales = new Prisma.Decimal(input.pixSales);
    const countedCash = new Prisma.Decimal(input.countedCash);

    return prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "CashRegisterShift" WHERE "id" = ${id} FOR UPDATE`;
      if (!rows.length) throw new ApiError(404, "Operação de caixa não encontrada.");
      const repeated = await tx.cashRegisterClosing.findUnique({ where: { idempotencyKey } });
      if (repeated) return repeated;

      const shift = await tx.cashRegisterShift.findUnique({
        where: { id },
        include: { withdrawals: { select: { amount: true } }, register: true },
      });
      if (!shift) throw new ApiError(404, "Operação de caixa não encontrada.");
      if (shift.status !== "OPEN") throw new ApiError(409, "Este caixa já foi fechado.");

      const withdrawals = shift.withdrawals.reduce((sum, withdrawal) => sum.plus(withdrawal.amount), new Prisma.Decimal(0));
      const expectedCash = new Prisma.Decimal(shift.openingFloat).plus(cashSales).minus(withdrawals);
      const difference = countedCash.minus(expectedCash);
      const justification = input.justification?.trim() || null;
      if (!difference.isZero() && !justification) {
        throw new ApiError(400, "Explique a diferença entre o dinheiro esperado e o valor contado.");
      }

      const closedAt = new Date();
      const closing = await tx.cashRegisterClosing.create({
        data: {
          shiftId: id,
          idempotencyKey,
          cashSales,
          debitSales,
          creditSales,
          pixSales,
          countedCash,
          expectedCash,
          difference,
          justification,
          closedById: actor.userId,
          closedAt,
        },
      });
      await tx.cashRegisterShift.update({ where: { id }, data: { status: "CLOSED", closedAt } });
      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          entity: "CashRegisterShift",
          entityId: id,
          action: "CLOSE",
          before: { status: "OPEN" },
          after: {
            status: "CLOSED",
            cashSales: cashSales.toString(),
            debitSales: debitSales.toString(),
            creditSales: creditSales.toString(),
            pixSales: pixSales.toString(),
            countedCash: countedCash.toString(),
            expectedCash: expectedCash.toString(),
            difference: difference.toString(),
            justification,
          },
        },
      });
      return closing;
    });
  }, 201);
}
