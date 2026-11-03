import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";

const schema = z.object({ name: z.string().trim().min(1).max(80) });

export async function GET() {
  return handleApi(async () => {
    await requireManager();
    return prisma.posTable.findMany({ orderBy: { name: "asc" } });
  });
}

export async function POST(request: Request) {
  return handleApi(async () => {
    const actor = await requireManager();
    const input = schema.parse(await request.json());
    return prisma.$transaction(async (tx) => {
      const table = await tx.posTable.create({ data: input });
      await tx.auditLog.create({ data: { actorId: actor.userId, entity: "PosTable", entityId: table.id, action: "CREATE", after: { name: table.name } } });
      return table;
    });
  }, 201);
}
