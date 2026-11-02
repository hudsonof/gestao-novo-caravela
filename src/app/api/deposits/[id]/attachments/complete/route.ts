import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";
import { isDepositProofObjectPath, validateDepositProof, validateDepositProofMetadata } from "@/server/deposit-proof";
import { deletePrivateObject, downloadPrivateObject } from "@/server/private-storage";

const schema = z.object({
  objectPath: z.string().min(1).max(240),
  fileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const actor = await requireManager();
    const { id: depositId } = await context.params;
    const input = schema.parse(await request.json());
    if (!isDepositProofObjectPath(depositId, input.objectPath)) throw new ApiError(400, "Caminho de comprovante inválido.");
    const requestedMetadata = validateDepositProofMetadata(input);

    const existing = await prisma.depositAttachment.findUnique({ where: { storagePath: input.objectPath } });
    if (existing) {
      if (existing.depositId !== depositId) throw new ApiError(409, "O arquivo já foi associado a outro depósito.");
      return { id: existing.id, originalFileName: existing.originalFileName, contentType: existing.contentType, sizeBytes: existing.sizeBytes, createdAt: existing.createdAt };
    }

    const deposit = await prisma.deposit.findUnique({ where: { id: depositId }, select: { id: true, status: true } });
    if (!deposit) throw new ApiError(404, "Depósito não encontrado.");
    if (deposit.status === "CANCELLED") throw new ApiError(409, "Não é possível anexar comprovantes a um depósito cancelado.");

    let storedFile: Awaited<ReturnType<typeof downloadPrivateObject>>;
    try {
      storedFile = await downloadPrivateObject(input.objectPath);
    } catch (error) {
      await deletePrivateObject(input.objectPath).catch(() => undefined);
      throw error;
    }
    if (storedFile.contentType !== requestedMetadata.contentType) {
      await deletePrivateObject(input.objectPath).catch(() => undefined);
      throw new ApiError(415, "O tipo do arquivo armazenado não corresponde ao comprovante informado.");
    }
    let metadata: ReturnType<typeof validateDepositProof>;
    try {
      metadata = validateDepositProof({ fileName: requestedMetadata.fileName, contentType: storedFile.contentType, bytes: storedFile.bytes });
    } catch (error) {
      await deletePrivateObject(input.objectPath).catch(() => undefined);
      throw error;
    }
    if (metadata.sizeBytes !== requestedMetadata.sizeBytes) {
      await deletePrivateObject(input.objectPath).catch(() => undefined);
      throw new ApiError(400, "O tamanho do arquivo enviado não corresponde ao informado.");
    }

    try {
      const attachment = await prisma.$transaction(async (tx) => {
        const currentDeposit = await tx.deposit.findUnique({ where: { id: depositId }, select: { id: true, status: true } });
        if (!currentDeposit) throw new ApiError(404, "Depósito não encontrado.");
        if (currentDeposit.status === "CANCELLED") throw new ApiError(409, "Não é possível anexar comprovantes a um depósito cancelado.");
        const saved = await tx.depositAttachment.create({
          data: {
            depositId,
            storagePath: input.objectPath,
            originalFileName: metadata.fileName,
            contentType: metadata.contentType,
            sizeBytes: metadata.sizeBytes,
            sha256: metadata.sha256,
            uploadedById: actor.userId,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.userId,
            entity: "DepositAttachment",
            entityId: saved.id,
            action: "UPLOAD",
            after: { depositId, originalFileName: metadata.fileName, contentType: metadata.contentType, sizeBytes: metadata.sizeBytes, sha256: metadata.sha256 },
          },
        });
        return saved;
      });
      return { id: attachment.id, originalFileName: attachment.originalFileName, contentType: attachment.contentType, sizeBytes: attachment.sizeBytes, createdAt: attachment.createdAt };
    } catch (error) {
      const savedAfterRace = await prisma.depositAttachment.findUnique({ where: { storagePath: input.objectPath } }).catch(() => null);
      if (savedAfterRace?.depositId === depositId) {
        return { id: savedAfterRace.id, originalFileName: savedAfterRace.originalFileName, contentType: savedAfterRace.contentType, sizeBytes: savedAfterRace.sizeBytes, createdAt: savedAfterRace.createdAt };
      }
      await deletePrivateObject(input.objectPath).catch(() => undefined);
      throw error;
    }
  }, 201);
}
