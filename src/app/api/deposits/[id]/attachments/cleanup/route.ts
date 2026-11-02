import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";
import { isDepositProofObjectPath } from "@/server/deposit-proof";
import { deletePrivateObject } from "@/server/private-storage";

const schema = z.object({ objectPath: z.string().min(1).max(240) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    await requireManager();
    const { id: depositId } = await context.params;
    const input = schema.parse(await request.json());
    if (!isDepositProofObjectPath(depositId, input.objectPath)) throw new ApiError(400, "Caminho de comprovante inválido.");
    const registered = await prisma.depositAttachment.findUnique({ where: { storagePath: input.objectPath }, select: { id: true } });
    if (registered) throw new ApiError(409, "Um comprovante registrado não pode ser removido.");
    await deletePrivateObject(input.objectPath);
    return { removed: true };
  });
}
