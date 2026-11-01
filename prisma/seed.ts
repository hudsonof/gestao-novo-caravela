import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient, AccountKind, Sector } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const accounts: Array<{ name: string; kind: AccountKind }> = [
    { name: "Fundo central de troco", kind: "FUND" },
    { name: "Cofre central", kind: "VAULT" },
    { name: "Conta bancária principal", kind: "BANK" },
    { name: "Recebíveis de cartão", kind: "RECEIVABLE" },
    { name: "Valores em trânsito", kind: "TRANSIT" },
    { name: "Contrapartida externa", kind: "EXTERNAL" },
  ];
  for (const account of accounts) {
    await prisma.financialAccount.upsert({
      where: { name: account.name },
      update: { kind: account.kind, active: true },
      create: account,
    });
  }

  const registers: Array<{ name: string; sector: Sector }> = [
    { name: "Bilheteria 01", sector: "TICKETS" },
    { name: "Mesas 01", sector: "TABLES" },
    { name: "Bar 01", sector: "BAR" },
  ];
  for (const register of registers) {
    await prisma.cashRegister.upsert({ where: { name: register.name }, update: { sector: register.sector, active: true }, create: register });
  }

  const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  if (email && password) {
    if (password.length < 14) throw new Error("INITIAL_ADMIN_PASSWORD deve ter pelo menos 14 caracteres.");
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        name: process.env.INITIAL_ADMIN_NAME?.trim() || "Administrador",
        email,
        passwordHash,
        role: "ADMIN",
        active: true,
      },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
