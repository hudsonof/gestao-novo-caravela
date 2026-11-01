import { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/http";
export function money(value: string | number | Prisma.Decimal): Prisma.Decimal {
  try {
    const parsed = new Prisma.Decimal(value);
    if (!parsed.isFinite() || parsed.decimalPlaces() > 2) throw new ApiError(400, "Valor monetário inválido.");
    return parsed;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "Valor monetário inválido.");
  }
}
export function positiveMoney(value: string | number | Prisma.Decimal): Prisma.Decimal {
  const parsed = money(value);
  if (!parsed.greaterThan(0)) throw new ApiError(400, "O valor deve ser maior que zero.");
  return parsed;
}
export function formatBRL(value: string | number | Prisma.Decimal) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
}
