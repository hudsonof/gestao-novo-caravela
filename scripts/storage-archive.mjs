import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [mode, root] = process.argv.slice(2);
if (!new Set(["backup", "restore"]).has(mode) || !root) throw new Error("Uso: node scripts/storage-archive.mjs <backup|restore> <diretório>");

const baseUrl = (mode === "backup" ? process.env.SUPABASE_STORAGE_URL : process.env.STAGING_SUPABASE_STORAGE_URL)?.replace(/\/$/, "");
const serviceKey = mode === "backup" ? process.env.SUPABASE_STORAGE_SERVICE_ROLE_KEY : process.env.STAGING_SUPABASE_STORAGE_SERVICE_ROLE_KEY;
const bucket = mode === "backup" ? (process.env.DEPOSIT_PROOFS_BUCKET || "deposit-proofs") : (process.env.STAGING_DEPOSIT_PROOFS_BUCKET || "deposit-proofs");
if (!baseUrl || !serviceKey) throw new Error(`Configure URL e chave de Storage para ${mode}.`);
if (!/^[a-z0-9][a-z0-9._-]{1,62}$/.test(bucket)) throw new Error("Nome do bucket inválido.");

const rootDirectory = path.resolve(root);
const headers = { authorization: `Bearer ${serviceKey}`, apikey: serviceKey };
const objectUrl = (objectPath) => `${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath.split("/").map(encodeURIComponent).join("/")}`;
const validProofPath = (objectPath) => /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|jpg|png)$/i.test(objectPath);

async function listPrefix(prefix = "", visited = new Set()) {
  if (visited.has(prefix)) return [];
  visited.add(prefix);
  const objects = [];
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const response = await fetch(`${baseUrl}/storage/v1/object/list/${encodeURIComponent(bucket)}`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ prefix, limit: pageSize, offset, sortBy: { column: "name", order: "asc" } }),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Falha ao listar comprovantes no Storage (HTTP ${response.status}).`);
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error("Resposta inválida ao listar comprovantes.");
    for (const item of page) {
      if (typeof item?.name !== "string" || !item.name || item.name === "." || item.name === "..") continue;
      const fullPath = item.name.startsWith(prefix) ? item.name : `${prefix}${item.name}`;
      if (item.id && item.metadata) {
        if (!validProofPath(fullPath)) throw new Error(`Objeto fora do padrão de comprovantes: ${fullPath}`);
        objects.push(fullPath);
      } else {
        objects.push(...(await listPrefix(`${fullPath.replace(/\/$/, "")}/`, visited)));
      }
    }
    if (page.length < pageSize) break;
  }
  return objects;
}

if (mode === "backup") {
  const manifest = [];
  for (const objectPath of await listPrefix()) {
    const response = await fetch(objectUrl(objectPath), { headers, cache: "no-store" });
    if (!response.ok) throw new Error(`Falha ao baixar comprovante (HTTP ${response.status}).`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() || "application/octet-stream";
    const destination = path.resolve(rootDirectory, "objects", ...objectPath.split("/"));
    if (!destination.startsWith(`${rootDirectory}${path.sep}`)) throw new Error("Caminho inválido no bucket de comprovantes.");
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    await writeFile(destination, bytes, { mode: 0o600 });
    manifest.push({ objectPath, sizeBytes: bytes.length, contentType, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  await writeFile(path.join(rootDirectory, "storage-manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 });
  console.log(`Comprovantes incluídos no backup: ${manifest.length}`);
} else {
  const manifest = JSON.parse(await readFile(path.join(rootDirectory, "storage-manifest.json"), "utf8"));
  if (!Array.isArray(manifest)) throw new Error("Manifesto de Storage inválido.");
  for (const item of manifest) {
    if (!item || !validProofPath(item.objectPath) || !Number.isInteger(item.sizeBytes) || item.sizeBytes < 1 || typeof item.contentType !== "string" || !/^[a-f0-9]{64}$/.test(item.sha256)) {
      throw new Error("Entrada inválida no manifesto de Storage.");
    }
    const source = path.resolve(rootDirectory, "objects", ...item.objectPath.split("/"));
    if (!source.startsWith(`${rootDirectory}${path.sep}`)) throw new Error("Caminho inválido no manifesto de Storage.");
    const bytes = await readFile(source);
    if (bytes.length !== item.sizeBytes || createHash("sha256").update(bytes).digest("hex") !== item.sha256) throw new Error(`Integridade do comprovante inválida: ${item.objectPath}`);
    const response = await fetch(objectUrl(item.objectPath), {
      method: "POST",
      headers: { ...headers, "content-type": item.contentType, "x-upsert": "true" },
      body: bytes,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Falha ao restaurar comprovante ${item.objectPath} (HTTP ${response.status}).`);
  }
  console.log(`Comprovantes restaurados e verificados: ${manifest.length}`);
}
