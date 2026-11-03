import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";

const schema = z.object({ active: z.boolean() });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const actor = await requireManager();
    const { id } = await context.params;
    const { active } = schema.parse(await request.json());
    return prisma.$transaction(async (tx) => {
      const device = await tx.posDevice.findUnique({ where: { id } });
      if (!device) throw new ApiError(404, "Terminal não encontrado.");
      const updated = await tx.posDevice.update({ where: { id }, data: { active } });
      await tx.auditLog.create({ data: { actorId: actor.userId, entity: "PosDevice", entityId: id, action: active ? "ACTIVATE" : "REVOKE", before: { active: device.active }, after: { active } } });
      return updated;
    });
  });
}
