import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";

const schema = z.object({ name: z.string().trim().min(2).max(100), profile: z.enum(["TICKETS", "TABLES", "BAR", "WAITER"]), cashRegisterId: z.string().min(1) });
const registerSector: Record<string, string> = { TICKETS: "TICKETS", TABLES: "TABLES", BAR: "BAR", WAITER: "BAR" };

export async function GET() {
  return handleApi(async () => {
    await requireManager();
    return prisma.posDevice.findMany({ select: { id: true, name: true, profile: true, cashRegisterId: true, active: true, createdAt: true, lastUsedAt: true, cashRegister: { select: { name: true, sector: true } } }, orderBy: { createdAt: "desc" } });
  });
}

export async function POST(request: Request) {
  return handleApi(async () => {
    const actor = await requireManager();
    const input = schema.parse(await request.json());
    const register = await prisma.cashRegister.findUnique({ where: { id: input.cashRegisterId } });
    if (!register || !register.active) throw new ApiError(404, "Caixa ativo não encontrado.");
    if (register.sector !== registerSector[input.profile]) throw new ApiError(400, "O perfil do terminal não corresponde ao setor do caixa.");
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const device = await prisma.$transaction(async (tx) => {
      const created = await tx.posDevice.create({ data: { ...input, tokenHash, createdById: actor.userId }, select: { id: true, name: true, profile: true, cashRegisterId: true, active: true } });
      await tx.auditLog.create({ data: { actorId: actor.userId, entity: "PosDevice", entityId: created.id, action: "CREATE", after: { name: created.name, profile: created.profile, cashRegisterId: created.cashRegisterId } } });
      return created;
    });
    return { device, token };
  }, 201);
}
