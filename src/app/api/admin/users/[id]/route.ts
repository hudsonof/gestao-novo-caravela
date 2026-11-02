import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, handleApi } from "@/lib/http";
import { requireAdmin } from "@/lib/authorization";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().max(254).optional(),
  password: z.string().min(14).max(200).optional(),
  role: z.enum(["ADMIN", "MANAGER"]).optional(),
}).refine((input) => Object.keys(input).length > 0, "Informe ao menos um campo para atualizar.");

const historyRelations = {
  openedSessions: true,
  ledgerEntries: true,
  closings: true,
  expensesCreated: true,
  expensePaymentsCreated: true,
  depositsCreated: true,
  depositAttachments: true,
  compensationsCreated: true,
  employeePaymentsCreated: true,
  auditLogs: true,
} as const;

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const actor = await requireAdmin();
    const { id } = await context.params;
    const input = updateSchema.parse(await request.json());
    const passwordHash = input.password ? await bcrypt.hash(input.password, 12) : undefined;

    return prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id } });
      if (!target) throw new ApiError(404, "Usuário não encontrado.");
      if (actor.userId === id && input.role === "MANAGER" && target.role === "ADMIN") {
        throw new ApiError(409, "Não é possível remover seu próprio perfil de administrador.");
      }
      if (target.role === "ADMIN" && target.active && input.role === "MANAGER") {
        const activeAdmins = await tx.user.count({ where: { role: "ADMIN", active: true } });
        if (activeAdmins <= 1) throw new ApiError(409, "O sistema precisa manter ao menos um administrador ativo.");
      }

      const data = {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.email !== undefined ? { email: input.email.toLowerCase() } : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(passwordHash ? { passwordHash } : {}),
      };
      const updated = await tx.user.update({
        where: { id },
        data,
        select: { id: true, name: true, email: true, role: true, active: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          entity: "User",
          entityId: id,
          action: "UPDATE",
          before: { name: target.name, email: target.email, role: target.role },
          after: { name: updated.name, email: updated.email, role: updated.role, passwordChanged: Boolean(passwordHash) },
        },
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const actor = await requireAdmin();
    const { id } = await context.params;
    if (actor.userId === id) throw new ApiError(409, "Não é possível excluir o próprio usuário.");

    return prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({
        where: { id },
        include: { _count: { select: historyRelations } },
      });
      if (!target) throw new ApiError(404, "Usuário não encontrado.");

      if (target.role === "ADMIN" && target.active) {
        const activeAdmins = await tx.user.count({ where: { role: "ADMIN", active: true } });
        if (activeAdmins <= 1) throw new ApiError(409, "O sistema precisa manter ao menos um administrador ativo.");
      }

      const hasHistory = Object.values(target._count).some((count) => count > 0);
      if (hasHistory) throw new ApiError(409, "Este usuário possui registros vinculados. Inative-o para preservar o histórico.");

      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          entity: "User",
          entityId: id,
          action: "DELETE",
          before: { name: target.name, email: target.email, role: target.role },
        },
      });
      await tx.user.delete({ where: { id } });
      return { id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  });
}
