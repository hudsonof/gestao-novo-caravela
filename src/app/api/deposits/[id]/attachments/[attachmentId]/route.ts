import { prisma } from "@/lib/db";
import { ApiError, jsonError } from "@/lib/http";
import { requireManager } from "@/lib/authorization";
import { createPrivateDownloadUrl } from "@/server/private-storage";

export async function GET(_request: Request, context: { params: Promise<{ id: string; attachmentId: string }> }) {
  try {
    await requireManager();
    const { id: depositId, attachmentId } = await context.params;
    const attachment = await prisma.depositAttachment.findFirst({ where: { id: attachmentId, depositId } });
    if (!attachment) throw new ApiError(404, "Comprovante não encontrado.");
    const signedUrl = await createPrivateDownloadUrl(attachment.storagePath, attachment.originalFileName);
    return Response.redirect(signedUrl, 302);
  } catch (error) {
    return jsonError(error);
  }
}
