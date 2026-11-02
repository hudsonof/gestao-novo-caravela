import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";

const registerSchema = z.object({ name: z.string().trim().min(2).max(80), sector: z.enum(["TICKETS", "TABLES", "BAR"]) });

export async function GET() {
  return handleApi(async () => {
    await requireManager();
    return prisma.cashRegister.findMany({ orderBy: [{ sector: "asc" }, { name: "asc" }] });
  });
}

export async function POST(request: Request) {
  return handleApi(async () => {
    const actor = await requireManager();
    const data = registerSchema.parse(await request.json());
    return prisma.$transaction(async (tx) => {
      const duplicate = await tx.cashRegister.findUnique({ where: { name: data.name }, select: { id: true } });
      if (duplicate) throw new ApiError(409, "Já existe um caixa com esse nome.");
      const register = await tx.cashRegister.create({ data });
      await tx.auditLog.create({ data: { actorId: actor.userId, entity: "CashRegister", entityId: register.id, action: "CREATE", after: { name: register.name, sector: register.sector } } });
      return register;
    });
  }, 201);
}
