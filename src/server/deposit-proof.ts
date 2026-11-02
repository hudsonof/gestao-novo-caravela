import { createHash } from "node:crypto";
import { ApiError } from "@/lib/http";

export const MAX_DEPOSIT_PROOF_BYTES = 10 * 1024 * 1024;

const fileTypes = {
  pdf: { contentType: "application/pdf", signature: (bytes: Uint8Array) => startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]) },
  jpg: { contentType: "image/jpeg", signature: (bytes: Uint8Array) => startsWith(bytes, [0xff, 0xd8, 0xff]) },
  jpeg: { contentType: "image/jpeg", signature: (bytes: Uint8Array) => startsWith(bytes, [0xff, 0xd8, 0xff]) },
  png: { contentType: "image/png", signature: (bytes: Uint8Array) => startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
} as const;

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((byte, index) => bytes[index] === byte);
}

export function validateDepositProofMetadata(input: {
  fileName: string;
  contentType: string;
  sizeBytes: number;
}) {
  const fileName = input.fileName.trim();
  if (!fileName || fileName.length > 180 || /[\\/\u0000-\u001f\u007f]/.test(fileName)) {
    throw new ApiError(400, "Nome de arquivo inválido.");
  }
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes < 0) throw new ApiError(400, "O tamanho do arquivo é inválido.");
  if (input.sizeBytes === 0) throw new ApiError(400, "O arquivo está vazio.");
  if (input.sizeBytes > MAX_DEPOSIT_PROOF_BYTES) {
    throw new ApiError(413, "O comprovante deve ter no máximo 10 MB.");
  }

  const extension = fileName.split(".").pop()?.toLowerCase() || "";
  const type = fileTypes[extension as keyof typeof fileTypes];
  if (!type || input.contentType.toLowerCase() !== type.contentType) {
    throw new ApiError(415, "Envie um comprovante PDF, JPG ou PNG válido.");
  }

  return {
    fileName,
    extension: extension === "jpeg" ? "jpg" : extension,
    contentType: type.contentType,
    sizeBytes: input.sizeBytes,
  };
}

export function validateDepositProof(input: {
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
}) {
  const metadata = validateDepositProofMetadata({ fileName: input.fileName, contentType: input.contentType, sizeBytes: input.bytes.length });
  const type = fileTypes[metadata.extension as keyof typeof fileTypes];
  if (!type.signature(input.bytes)) throw new ApiError(415, "Envie um comprovante PDF, JPG ou PNG válido.");
  return { ...metadata, sha256: createHash("sha256").update(input.bytes).digest("hex") };
}

export function isDepositProofObjectPath(depositId: string, objectPath: string) {
  const prefix = `${depositId}/`;
  if (!objectPath.startsWith(prefix)) return false;
  return /^[0-9a-f-]{36}\.(pdf|jpg|png)$/i.test(objectPath.slice(prefix.length));
}
