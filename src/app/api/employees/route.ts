import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";

const employeeSchema = z.object({ name: z.string().trim().min(2).max(120), position: z.string().trim().max(100).optional() });

export async function GET() {
  return handleApi(async () => {
    await requireManager();
    return prisma.employee.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  });
}

export async function POST(request: Request) {
  return handleApi(async () => {
    const actor = await requireManager();
    const data = employeeSchema.parse(await request.json());
    return prisma.$transaction(async (tx) => {
      const employee = await tx.employee.create({ data });
      await tx.auditLog.create({ data: { actorId: actor.userId, entity: "Employee", entityId: employee.id, action: "CREATE", after: { name: employee.name, position: employee.position } } });
      return employee;
    });
  }, 201);
}
