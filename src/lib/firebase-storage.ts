import { createHash, createSign } from "node:crypto";
import { ApiError } from "@/lib/http";

type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };
const bucketName = process.env.FIREBASE_STORAGE_BUCKET || "pdv-caravela.firebasestorage.app";
let tokenCache: { value: string; expiresAt: number } | null = null;

function serviceAccount(): ServiceAccount {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new ApiError(503, "Configure FIREBASE_SERVICE_ACCOUNT_JSON para usar imagens do catálogo.");
  try {
    const account = JSON.parse(raw) as ServiceAccount;
    if (!account.client_email || !account.private_key) throw new Error();
    return account;
  } catch {
    throw new ApiError(503, "FIREBASE_SERVICE_ACCOUNT_JSON não contém uma credencial de serviço válida.");
  }
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function sign(value: string, privateKey: string) {
  return createSign("RSA-SHA256").update(value).sign(privateKey);
}

async function accessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.value;
  const account = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/devstorage.read_write",
    aud: account.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const assertion = `${unsigned}.${base64Url(sign(unsigned, account.private_key))}`;
  const endpoint = account.token_uri || "https://oauth2.googleapis.com/token";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || typeof result.access_token !== "string") throw new ApiError(502, "Não foi possível autenticar no Cloud Storage.");
  tokenCache = { value: result.access_token, expiresAt: Date.now() + Math.max(60, Number(result.expires_in) || 3600) * 1000 };
  return tokenCache.value;
}

async function storageError(response: Response, fallback: string) {
  const text = await response.text().catch(() => "");
  throw new ApiError(response.status >= 400 && response.status < 500 ? 400 : 502, text.slice(0, 500) || fallback);
}

export async function uploadProductImage(path: string, bytes: Uint8Array, contentType: string) {
  const token = await accessToken();
  const endpoint = new URL(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucketName)}/o`);
  endpoint.searchParams.set("uploadType", "media");
  endpoint.searchParams.set("name", path);
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": contentType, "cache-control": "public, max-age=3600" },
    body,
    cache: "no-store",
  });
  if (!response.ok) await storageError(response, "Não foi possível enviar a imagem ao Firebase Storage.");
}

export async function deleteStorageObject(path: string) {
  const token = await accessToken();
  const response = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(path)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok && response.status !== 404) await storageError(response, "Não foi possível remover a imagem do Firebase Storage.");
}

function encodeRfc3986(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function signedImageUrl(path: string, expiresSeconds = 3600) {
  const account = serviceAccount();
  const date = new Date();
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = iso.slice(0, 8);
  const scope = `${day}/auto/storage/goog4_request`;
  const credential = `${account.client_email}/${scope}`;
  const signedHeaders = "host";
  const canonicalPath = `/${encodeRfc3986(bucketName)}/${path.split("/").map(encodeRfc3986).join("/")}`;
  const query = [
    ["X-Goog-Algorithm", "GOOG4-RSA-SHA256"],
    ["X-Goog-Credential", credential],
    ["X-Goog-Date", iso],
    ["X-Goog-Expires", String(expiresSeconds)],
    ["X-Goog-SignedHeaders", signedHeaders],
  ].map(([key, value]) => [encodeRfc3986(key), encodeRfc3986(value)] as const).sort(([a], [b]) => a.localeCompare(b));
  const canonicalQuery = query.map(([key, value]) => `${key}=${value}`).join("&");
  const canonicalRequest = ["GET", canonicalPath, canonicalQuery, "host:storage.googleapis.com\n", signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
  const hash = createHash("sha256").update(canonicalRequest).digest("hex");
  const stringToSign = ["GOOG4-RSA-SHA256", iso, scope, hash].join("\n");
  const signature = sign(stringToSign, account.private_key).toString("hex");
  return `https://storage.googleapis.com${canonicalPath}?${canonicalQuery}&X-Goog-Signature=${signature}`;
}
