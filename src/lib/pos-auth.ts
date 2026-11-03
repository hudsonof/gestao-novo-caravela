import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http";

export function newPosToken() {
  return randomBytes(32).toString("base64url");
}

export function hashPosToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function requirePosDevice(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token || token.length > 200) throw new ApiError(401, "Credencial do terminal ausente ou inválida.");
  const device = await prisma.posDevice.findUnique({ where: { tokenHash: hashPosToken(token) }, include: { cashRegister: true } });
  if (!device || !device.active || !device.cashRegister.active) throw new ApiError(401, "Terminal revogado ou inativo.");
  await prisma.posDevice.update({ where: { id: device.id }, data: { lastUsedAt: new Date() } });
  return device;
}
