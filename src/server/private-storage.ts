import { ApiError } from "@/lib/http";
import { MAX_DEPOSIT_PROOF_BYTES } from "@/server/deposit-proof";

type StorageConfig = { baseUrl: string; serviceKey: string; bucket: string };

function getStorageConfig(bucketOverride?: string): StorageConfig {
  const rawUrl = process.env.SUPABASE_STORAGE_URL?.trim();
  const serviceKey = process.env.SUPABASE_STORAGE_SERVICE_ROLE_KEY?.trim();
  const bucket = (bucketOverride || process.env.DEPOSIT_PROOFS_BUCKET || "deposit-proofs").trim();
  if (!rawUrl || !serviceKey) throw new ApiError(503, "O armazenamento privado de comprovantes não está configurado.");
  if (!/^[a-z0-9][a-z0-9._-]{1,62}$/.test(bucket)) throw new ApiError(500, "O bucket de armazenamento está inválido.");

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ApiError(500, "A URL de armazenamento está inválida.");
  }
  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    throw new ApiError(500, "O armazenamento publicado precisa usar HTTPS.");
  }
  return { baseUrl: `${parsed.origin}/storage/v1`, serviceKey, bucket };
}

function objectUrl(config: StorageConfig, objectPath: string) {
  const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/");
  return `${config.baseUrl}/object/${encodeURIComponent(config.bucket)}/${encodedPath}`;
}

function storageHeaders(config: StorageConfig) {
  return {
    authorization: `Bearer ${config.serviceKey}`,
    apikey: config.serviceKey,
  };
}

export async function createPrivateUploadUrl(objectPath: string) {
  const config = getStorageConfig();
  const pathUrl = objectUrl(config, objectPath).replace("/object/", "/object/upload/sign/");
  const response = await fetch(pathUrl, {
    method: "POST",
    headers: { ...storageHeaders(config), "content-type": "application/json" },
    body: JSON.stringify({ upsert: false }),
    cache: "no-store",
  });
  if (!response.ok) throw new ApiError(502, "Não foi possível preparar o envio privado do comprovante.");
  const payload = await response.json() as { token?: unknown };
  if (typeof payload.token !== "string" || !payload.token) {
    throw new ApiError(502, "O armazenamento não retornou um token de envio válido.");
  }
  const uploadUrl = new URL(pathUrl);
  uploadUrl.searchParams.set("token", payload.token);
  return uploadUrl.toString();
}

export async function downloadPrivateObject(objectPath: string) {
  const config = getStorageConfig();
  const response = await fetch(objectUrl(config, objectPath), {
    headers: storageHeaders(config),
    cache: "no-store",
  });
  if (!response.ok) throw new ApiError(404, "O arquivo enviado não foi encontrado no armazenamento privado.");
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_DEPOSIT_PROOF_BYTES) {
    await response.body?.cancel();
    throw new ApiError(413, "O comprovante deve ter no máximo 10 MB.");
  }
  if (!response.body) throw new ApiError(502, "O armazenamento retornou um arquivo inválido.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_DEPOSIT_PROOF_BYTES) {
      await reader.cancel();
      throw new ApiError(413, "O comprovante deve ter no máximo 10 MB.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return {
    bytes,
    contentType: response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() || "",
  };
}

export async function deletePrivateObject(objectPath: string) {
  const config = getStorageConfig();
  const response = await fetch(`${config.baseUrl}/object/${encodeURIComponent(config.bucket)}`, {
    method: "POST",
    headers: { ...storageHeaders(config), "content-type": "application/json" },
    body: JSON.stringify({ prefixes: [objectPath] }),
    cache: "no-store",
  });
  if (!response.ok) throw new ApiError(502, "Não foi possível remover o arquivo temporário do armazenamento.");
}

export async function createPrivateDownloadUrl(objectPath: string, downloadName: string) {
  const config = getStorageConfig();
  const response = await fetch(`${objectUrl(config, objectPath).replace("/object/", "/object/sign/")}`, {
    method: "POST",
    headers: { ...storageHeaders(config), "content-type": "application/json" },
    body: JSON.stringify({ expiresIn: 60 }),
    cache: "no-store",
  });
  if (!response.ok) throw new ApiError(502, "Não foi possível gerar o acesso temporário ao comprovante.");
  const payload = await response.json() as { signedURL?: unknown };
  if (typeof payload.signedURL !== "string" || !payload.signedURL) {
    throw new ApiError(502, "O armazenamento não retornou um link válido para o comprovante.");
  }
  let signedUrl: URL;
  try {
    signedUrl = new URL(payload.signedURL, `${config.baseUrl}/`);
  } catch {
    throw new ApiError(502, "O armazenamento retornou um link inválido para o comprovante.");
  }
  if (signedUrl.origin !== new URL(config.baseUrl).origin) throw new ApiError(502, "O armazenamento retornou um link fora do projeto configurado.");
  signedUrl.searchParams.set("download", downloadName);
  return signedUrl.toString();
}
