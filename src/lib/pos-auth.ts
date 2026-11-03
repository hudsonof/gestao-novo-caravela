import { auth } from "../../auth";
import type { PosChannel, Sector, UserRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { posChannelForRole, posSectorForRole } from "@/lib/pos-roles";

export type PosUserContext = {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  profile: PosChannel;
  cashRegisterId: string;
  cashRegister: { id: string; name: string; sector: Sector };
};

export async function requirePosUser(): Promise<PosUserContext> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new ApiError(401, "Autenticação necessária.");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { posCashRegister: { select: { id: true, name: true, sector: true, active: true } } },
  });
  if (!user || !user.active) throw new ApiError(401, "Usuário inativo ou inexistente.");

  const profile = posChannelForRole(user.role);
  const expectedSector = posSectorForRole(user.role);
  if (!profile || !expectedSector) throw new ApiError(403, "Este usuário não possui perfil de operação do PDV.");
  const register = user.posCashRegister;
  if (!register || !register.active || register.sector !== expectedSector) {
    throw new ApiError(403, "O perfil do usuário não está vinculado a um caixa ativo compatível.");
  }

  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    profile,
    cashRegisterId: register.id,
    cashRegister: { id: register.id, name: register.name, sector: register.sector },
  };
}
