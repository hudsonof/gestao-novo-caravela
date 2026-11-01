import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleApi } from "@/lib/http";
import { requireAdmin } from "@/lib/authorization";

const schema = z.object({ name: z.string().trim().min(2).max(120), email: z.string().email().max(254), password: z.string().min(14).max(200), role: z.enum(["ADMIN", "MANAGER"]) });

export async function GET() {
  return handleApi(async () => {
    await requireAdmin();
    return prisma.user.findMany({ select: { id: true, name: true, email: true, role: true, active: true, createdAt: true }, orderBy: { createdAt: "asc" } });
  });
}

export async function POST(request: Request) {
  return handleApi(async () => {
    const actor = await requireAdmin();
    const input = schema.parse(await request.json());
    const { password, ...userInput } = input;
    const passwordHash = await bcrypt.hash(password, 12);
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { ...userInput, email: input.email.trim().toLowerCase(), passwordHash }, select: { id: true, name: true, email: true, role: true, active: true } });
      await tx.auditLog.create({ data: { actorId: actor.userId, entity: "User", entityId: user.id, action: "CREATE", after: { email: user.email, role: user.role } } });
      return user;
    });
  }, 201);
}
