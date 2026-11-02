import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";

const schema = z.object({ name: z.string().trim().min(2).max(80), type: z.enum(["INCOME", "EXPENSE"]) });

export async function GET() {
  return handleApi(async () => {
    await requireManager();
    return prisma.financeCategory.findMany({ orderBy: [{ type: "asc" }, { name: "asc" }] });
  });
}

export async function POST(request: Request) {
  return handleApi(async () => {
    const actor = await requireManager();
    const input = schema.parse(await request.json());
    return prisma.$transaction(async (tx) => {
      const duplicate = await tx.financeCategory.findUnique({ where: { name_type: { name: input.name, type: input.type } } });
      if (duplicate) throw new ApiError(409, "Já existe uma categoria com esse nome e tipo.");
      const category = await tx.financeCategory.create({ data: input });
      await tx.auditLog.create({ data: { actorId: actor.userId, entity: "FinanceCategory", entityId: category.id, action: "CREATE", after: { name: category.name, type: category.type } } });
      return category;
    });
  }, 201);
}
