import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";
import { validateDepositProofMetadata } from "@/server/deposit-proof";
import { createPrivateUploadUrl } from "@/server/private-storage";

const schema = z.object({
  fileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const actor = await requireManager();
    const { id: depositId } = await context.params;
    const deposit = await prisma.deposit.findUnique({ where: { id: depositId }, select: { id: true, status: true } });
    if (!deposit) throw new ApiError(404, "Depósito não encontrado.");
    if (deposit.status === "CANCELLED") throw new ApiError(409, "Não é possível anexar comprovantes a um depósito cancelado.");
    const input = schema.parse(await request.json());
    const metadata = validateDepositProofMetadata(input);
    const storagePath = `${depositId}/${randomUUID()}.${metadata.extension}`;
    const uploadUrl = await createPrivateUploadUrl(storagePath);
    return { objectPath: storagePath, uploadUrl, fileName: metadata.fileName, contentType: metadata.contentType, sizeBytes: metadata.sizeBytes };
  }, 201);
}
