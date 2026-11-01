import { auth } from "../../auth";
import { ApiError } from "@/lib/http";
import { prisma } from "@/lib/db";

export async function requireManager() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new ApiError(401, "Autenticação necessária.");
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true, active: true } });
  if (!user || !user.active) throw new ApiError(401, "Usuário inativo ou inexistente.");
  if (user.role !== "ADMIN" && user.role !== "MANAGER") {
    throw new ApiError(403, "Acesso não autorizado.");
  }
  return { userId: user.id, role: user.role, name: user.name };
}

export async function requireAdmin() {
  const user = await requireManager();
  if (user.role !== "ADMIN") throw new ApiError(403, "Somente administradores podem executar esta operação.");
  return user;
}
