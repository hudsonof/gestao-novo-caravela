import { Prisma } from "@prisma/client";
export function money(value: string | number | Prisma.Decimal): Prisma.Decimal {
  const parsed = new Prisma.Decimal(value);
  if (!parsed.isFinite() || parsed.decimalPlaces() > 2) throw new Error("Valor monetário inválido");
  return parsed;
}
export function positiveMoney(value: string | number | Prisma.Decimal): Prisma.Decimal {
  const parsed = money(value);
  if (!parsed.greaterThan(0)) throw new Error("Valor deve ser positivo");
  return parsed;
}
export function formatBRL(value: string | number | Prisma.Decimal) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
}
