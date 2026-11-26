import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";

const money = z.coerce.string().regex(/^\d+(?:\.\d{1,2})?$/, "Informe um valor válido.");
const schema = z.object({
  cashSales: money,
  machineSales: money.optional(),
  debitSales: money.optional(),
  creditSales: money.optional(),
  pixSales: money.optional(),
  countedCash: money,
  justification: z.string().trim().max(500).optional(),
}).refine((input) => {
  const legacy = [input.debitSales, input.creditSales, input.pixSales];
  const noLegacyValues = legacy.every((value) => value === undefined);
  const allLegacyValues = legacy.every((value) => value !== undefined);
  return (input.machineSales !== undefined && noLegacyValues) ||
    (input.machineSales === undefined && allLegacyValues);
}, { message: "Informe Vendas (Máquina).", path: ["machineSales"] });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const actor = await requireManager();
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    const idempotencyKey = z.string().uuid().parse(request.headers.get("x-idempotency-key"));
    const cashSales = new Prisma.Decimal(input.cashSales);
    const debitSales = input.debitSales === undefined ? new Prisma.Decimal(0) : new Prisma.Decimal(input.debitSales);
    const creditSales = input.creditSales === undefined ? new Prisma.Decimal(0) : new Prisma.Decimal(input.creditSales);
    const pixSales = input.pixSales === undefined ? new Prisma.Decimal(0) : new Prisma.Decimal(input.pixSales);
    const machineSales = input.machineSales === undefined
      ? debitSales.plus(creditSales).plus(pixSales)
      : new Prisma.Decimal(input.machineSales);
    const countedCash = new Prisma.Decimal(input.countedCash);
    const justification = input.justification?.trim() || null;

    return prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "CashRegisterShift" WHERE "id" = ${id} FOR UPDATE`;
      if (!rows.length) throw new ApiError(404, "Operação de caixa não encontrada.");
      const repeated = await tx.cashRegisterClosing.findUnique({ where: { idempotencyKey } });
      if (repeated) {
        const same = repeated.shiftId === id &&
          repeated.cashSales.equals(cashSales) &&
          repeated.machineSales.equals(machineSales) &&
          repeated.debitSales.equals(debitSales) &&
          repeated.creditSales.equals(creditSales) &&
          repeated.pixSales.equals(pixSales) &&
          repeated.countedCash.equals(countedCash) &&
          repeated.justification === justification;
        if (!same) throw new ApiError(409, "A chave de idempotência já foi usada em outro fechamento.");
        return repeated;
      }

      const shift = await tx.cashRegisterShift.findUnique({
        where: { id },
        include: { withdrawals: { select: { amount: true } }, register: true },
      });
      if (!shift) throw new ApiError(404, "Operação de caixa não encontrada.");
      if (shift.status !== "OPEN") throw new ApiError(409, "Este caixa já foi fechado.");

      const withdrawals = shift.withdrawals.reduce((sum, withdrawal) => sum.plus(withdrawal.amount), new Prisma.Decimal(0));
      const expectedCash = new Prisma.Decimal(shift.openingFloat).plus(cashSales).minus(withdrawals);
      const difference = countedCash.minus(expectedCash);
      if (!difference.isZero() && !justification) {
        throw new ApiError(400, "Explique a diferença entre o dinheiro esperado e o valor contado.");
      }

      const closedAt = new Date();
      const closing = await tx.cashRegisterClosing.create({
        data: {
          shiftId: id,
          idempotencyKey,
          cashSales,
          machineSales,
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
            machineSales: machineSales.toString(),
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
