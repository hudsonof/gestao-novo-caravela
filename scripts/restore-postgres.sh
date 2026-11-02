#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${RESTORE_CONFIRMATION:?Confirme com RESTORE_STAGING}"
: "${BACKUP_DATABASE_URL:?Configure a URL de produção para impedir restauração sobre a origem}"
: "${STAGING_DATABASE_URL:?Configure a conexão do banco isolado de homologação}"
: "${BACKUP_OBJECT:?Informe o caminho do backup dentro do bucket}"
: "${SUPABASE_STORAGE_URL:?Configure a URL do Supabase Storage}"
: "${SUPABASE_STORAGE_SERVICE_ROLE_KEY:?Configure a service-role key como secret}"
: "${BACKUP_BUCKET:?Configure o bucket privado de backups}"
: "${STAGING_SUPABASE_STORAGE_URL:?Configure o Supabase Storage de homologação}"
: "${STAGING_SUPABASE_STORAGE_SERVICE_ROLE_KEY:?Configure a service-role key de homologação}"
: "${STAGING_DEPOSIT_PROOFS_BUCKET:=deposit-proofs}"
: "${BACKUP_AGE_IDENTITY_FILE:?Informe o arquivo da chave privada age}"

if [[ "$RESTORE_CONFIRMATION" != "RESTORE_STAGING" ]]; then
  echo "Restauração interrompida: a confirmação precisa ser RESTORE_STAGING." >&2
  exit 1
fi
if [[ ! "$BACKUP_OBJECT" =~ ^backups/[A-Za-z0-9._/-]+\.tar\.gz\.age$ || "$BACKUP_OBJECT" == *..* ]]; then
  echo "BACKUP_OBJECT precisa apontar para um arquivo .tar.gz.age dentro de backups/." >&2
  exit 1
fi
for command in age curl pg_restore psql tar node; do
  command -v "$command" >/dev/null || { echo "Comando obrigatório não encontrado: $command" >&2; exit 1; }
done

if ! RESTORE_SOURCE_DATABASE_URL="$BACKUP_DATABASE_URL" \
  RESTORE_TARGET_DATABASE_URL="$STAGING_DATABASE_URL" \
  RESTORE_SOURCE_STORAGE_URL="$SUPABASE_STORAGE_URL" \
  RESTORE_TARGET_STORAGE_URL="$STAGING_SUPABASE_STORAGE_URL" \
  node --input-type=module -e '
    const databaseIdentity = (raw) => {
      const url = new URL(raw);
      const database = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
      const projectRef = url.hostname.match(/^(?:db\.)?([a-z0-9]+)\.supabase\.co$/i)?.[1]
        ?? decodeURIComponent(url.username).match(/^postgres\.([a-z0-9]+)$/i)?.[1];
      if (projectRef) return `supabase:${projectRef.toLowerCase()}`;
      return `${url.hostname.toLowerCase()}:${url.port || "5432"}/${database}`;
    };
    if (databaseIdentity(process.env.RESTORE_SOURCE_DATABASE_URL) === databaseIdentity(process.env.RESTORE_TARGET_DATABASE_URL)) {
      console.error("O banco de homologação não pode ser o banco de produção do backup.");
      process.exit(1);
    }
    if (new URL(process.env.RESTORE_SOURCE_STORAGE_URL).origin === new URL(process.env.RESTORE_TARGET_STORAGE_URL).origin) {
      console.error("O Storage de homologação precisa pertencer a um projeto Supabase separado.");
      process.exit(1);
    }
  '; then
  exit 1
fi

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT
encrypted_file="$work_dir/backup.tar.gz.age"
archive_file="$work_dir/backup.tar.gz"
payload_dir="$work_dir/payload"
storage_url="${SUPABASE_STORAGE_URL%/}"

curl --fail --silent --show-error \
  --header "Authorization: Bearer $SUPABASE_STORAGE_SERVICE_ROLE_KEY" \
  --header "apikey: $SUPABASE_STORAGE_SERVICE_ROLE_KEY" \
  "$storage_url/storage/v1/object/$BACKUP_BUCKET/$BACKUP_OBJECT" \
  --output "$encrypted_file"
age --decrypt --identity "$BACKUP_AGE_IDENTITY_FILE" --output "$archive_file" "$encrypted_file"
tar --extract --gzip --file "$archive_file" --directory "$work_dir"
test -f "$payload_dir/database.dump"
test -f "$payload_dir/deposit-proofs/storage-manifest.json"
pg_restore --list "$payload_dir/database.dump" >/dev/null
pg_restore --clean --if-exists --no-owner --no-acl --exit-on-error --dbname "$STAGING_DATABASE_URL" "$payload_dir/database.dump"
STAGING_SUPABASE_STORAGE_URL="$STAGING_SUPABASE_STORAGE_URL" \
STAGING_SUPABASE_STORAGE_SERVICE_ROLE_KEY="$STAGING_SUPABASE_STORAGE_SERVICE_ROLE_KEY" \
STAGING_DEPOSIT_PROOFS_BUCKET="$STAGING_DEPOSIT_PROOFS_BUCKET" \
  node scripts/storage-archive.mjs restore "$payload_dir/deposit-proofs"

account_count="$(psql "$STAGING_DATABASE_URL" --no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1 --command='SELECT COUNT(*) FROM "FinancialAccount"')"
if [[ ! "$account_count" =~ ^[0-9]+$ || "$account_count" -lt 1 ]]; then
  echo "Verificação pós-restauração falhou: nenhuma conta financeira foi encontrada." >&2
  exit 1
fi

echo "Restauração de homologação validada; contas financeiras encontradas: $account_count"
