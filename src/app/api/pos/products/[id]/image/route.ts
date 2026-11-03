import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { ApiError, handleApi } from "@/lib/http";
import { requireManager } from "@/lib/authorization";
import { deleteStorageObject, signedImageUrl, uploadProductImage } from "@/lib/firebase-storage";

const MAX_IMAGE_SIZE = 4 * 1024 * 1024;
const imageTypes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const actor = await requireManager();
    const { id } = await context.params;
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "Selecione uma imagem.");
    if (!imageTypes[file.type]) throw new ApiError(400, "Use uma imagem JPG, PNG ou WebP.");
    if (!file.size || file.size > MAX_IMAGE_SIZE) throw new ApiError(400, "A imagem deve ter até 4 MB.");

    const product = await prisma.posProduct.findUnique({ where: { id }, select: { id: true, imagePath: true } });
    if (!product) throw new ApiError(404, "Produto não encontrado.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const validSignature =
      file.type === "image/jpeg" ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff :
      file.type === "image/png" ? bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a :
      bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
    if (!validSignature) throw new ApiError(400, "O conteúdo do arquivo não corresponde a uma imagem JPG, PNG ou WebP válida.");
    const path = `pos-products/${id}/${randomUUID()}.${imageTypes[file.type]}`;
    const imageUrl = signedImageUrl(path);
    await uploadProductImage(path, bytes, file.type);
    let updated;
    try {
      updated = await prisma.$transaction(async (tx) => {
        const value = await tx.posProduct.update({ where: { id }, data: { imagePath: path } });
        await tx.auditLog.create({ data: { actorId: actor.userId, entity: "PosProduct", entityId: id, action: "UPDATE_IMAGE", before: { imagePath: product.imagePath }, after: { imagePath: path } } });
        return value;
      });
    } catch (error) {
      try { await deleteStorageObject(path); } catch (cleanupError) { console.error("Could not clean up failed POS product image upload", cleanupError); }
      throw error;
    }
    if (product.imagePath) {
      try { await deleteStorageObject(product.imagePath); } catch (error) { console.error("Could not remove replaced POS product image", error); }
    }
    return { id: updated.id, imagePath: path, imageUrl };
  }, 201);
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const actor = await requireManager();
    const { id } = await context.params;
    const product = await prisma.posProduct.findUnique({ where: { id }, select: { id: true, imagePath: true } });
    if (!product) throw new ApiError(404, "Produto não encontrado.");
    if (!product.imagePath) return { id, imagePath: null };
    await prisma.$transaction(async (tx) => {
      await tx.posProduct.update({ where: { id }, data: { imagePath: null } });
      await tx.auditLog.create({ data: { actorId: actor.userId, entity: "PosProduct", entityId: id, action: "DELETE_IMAGE", before: { imagePath: product.imagePath } } });
    });
    try { await deleteStorageObject(product.imagePath); } catch (error) { console.error("Could not remove POS product image", error); }
    return { id, imagePath: null };
  });
}
