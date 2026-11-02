#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${BACKUP_DATABASE_URL:?Configure a URL direta/session-pooler do PostgreSQL de produção}"
: "${SUPABASE_STORAGE_URL:?Configure a URL do Supabase Storage}"
: "${SUPABASE_STORAGE_SERVICE_ROLE_KEY:?Configure a service-role key como secret}"
: "${BACKUP_BUCKET:?Configure o bucket privado para backups}"
: "${BACKUP_AGE_RECIPIENT:?Configure a chave pública age para criptografia}"

for command in pg_dump pg_restore age curl node tar; do
  command -v "$command" >/dev/null || { echo "Comando obrigatório não encontrado: $command" >&2; exit 1; }
done

if [[ ! "$BACKUP_BUCKET" =~ ^[a-z0-9][a-z0-9._-]{1,62}$ ]]; then
  echo "BACKUP_BUCKET contém caracteres inválidos." >&2
  exit 1
fi

storage_url="${SUPABASE_STORAGE_URL%/}"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT
timestamp="$(date -u +'%Y%m%dT%H%M%SZ')"
run_id="${GITHUB_RUN_ID:-local-$$}"
payload_dir="$work_dir/payload"
archive_file="$work_dir/novo-caravela-$timestamp.tar.gz"
encrypted_file="$archive_file.age"
object_path="backups/$(date -u +'%Y/%m/%d')/novo-caravela-$timestamp-$run_id.tar.gz.age"

mkdir -p "$payload_dir"
pg_dump --format=custom --no-owner --no-acl --file "$payload_dir/database.dump" "$BACKUP_DATABASE_URL"
pg_restore --list "$payload_dir/database.dump" >/dev/null
node scripts/storage-archive.mjs backup "$payload_dir/deposit-proofs"
tar --create --gzip --file "$archive_file" --directory "$work_dir" payload
tar --list --gzip --file "$archive_file" >/dev/null
age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" --output "$encrypted_file" "$archive_file"

curl --fail --silent --show-error \
  --request POST \
  --header "Authorization: Bearer $SUPABASE_STORAGE_SERVICE_ROLE_KEY" \
  --header "apikey: $SUPABASE_STORAGE_SERVICE_ROLE_KEY" \
  --header "Content-Type: application/octet-stream" \
  --header "x-upsert: false" \
  --data-binary "@$encrypted_file" \
  "$storage_url/storage/v1/object/$BACKUP_BUCKET/$object_path" >/dev/null

echo "Backup do banco e comprovantes criptografado, validado e enviado para: $object_path"
