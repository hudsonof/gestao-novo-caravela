import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, handleApi } from "@/lib/http";
import { requireAdmin } from "@/lib/authorization";
import { posSectorForRole } from "@/lib/pos-roles";

const userRoleSchema = z.enum(["ADMIN", "MANAGER", "POS_TICKETS", "POS_TABLES", "POS_BAR", "POS_WAITER"]);
const schema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email().max(254),
  password: z.string().min(14).max(200),
  role: userRoleSchema,
  posCashRegisterId: z.string().trim().nullable().optional(),
});

async function validatePosRegister(role: z.infer<typeof userRoleSchema>, registerId: string | null) {
  const expectedSector = posSectorForRole(role);
  if (!expectedSector) {
    if (registerId) throw new ApiError(400, "Associe um caixa somente a usuários com perfil de operação do PDV.");
    return null;
  }
  if (!registerId) throw new ApiError(400, "Selecione o caixa vinculado ao perfil do PDV.");
  const register = await prisma.cashRegister.findUnique({ where: { id: registerId }, select: { id: true, sector: true, active: true } });
  if (!register || !register.active) throw new ApiError(400, "O caixa selecionado não existe ou está inativo.");
  if (register.sector !== expectedSector) throw new ApiError(400, "O perfil do usuário não corresponde ao setor do caixa.");
  return register.id;
}

export async function GET() {
  return handleApi(async () => {
    await requireAdmin();
    return prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, active: true, posCashRegisterId: true, posCashRegister: { select: { name: true } }, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
  });
}

export async function POST(request: Request) {
  return handleApi(async () => {
    const actor = await requireAdmin();
    const input = schema.parse(await request.json());
    const registerId = await validatePosRegister(input.role, input.posCashRegisterId?.trim() || null);
    const passwordHash = await bcrypt.hash(input.password, 12);
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.name,
          email: input.email.trim().toLowerCase(),
          passwordHash,
          role: input.role,
          posCashRegisterId: registerId,
        },
        select: { id: true, name: true, email: true, role: true, active: true, posCashRegisterId: true },
      });
      await tx.auditLog.create({ data: { actorId: actor.userId, entity: "User", entityId: user.id, action: "CREATE", after: { email: user.email, role: user.role, posCashRegisterId: registerId } } });
      return user;
    });
  }, 201);
}
