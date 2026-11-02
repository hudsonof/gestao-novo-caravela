# Operação, backup e monitoramento

## Armazenamento de comprovantes

1. No Supabase Storage, crie o bucket `deposit-proofs` como **privado**, sem acesso público e com limite máximo de arquivo de 10 MB.
2. Configure na Vercel `SUPABASE_STORAGE_URL`, `SUPABASE_STORAGE_SERVICE_ROLE_KEY` e `DEPOSIT_PROOFS_BUCKET=deposit-proofs` como variáveis server-side. Não use prefixo `NEXT_PUBLIC_` para a chave.
3. Aplique a migration e publique a aplicação. Comprovantes aceitos: PDF/JPG/PNG, até 10 MB; o servidor valida extensão, MIME e assinatura do arquivo.
4. O backend emite uma URL de upload temporária para um único objeto; o browser envia o arquivo diretamente ao bucket e o servidor confere novamente assinatura, tipo e tamanho antes de gravar metadados.
5. Links de leitura são assinados por 60 segundos e só são emitidos para ADMIN/MANAGER autenticados. Se houver restrição CORS no projeto, permita os domínios da aplicação.

O banco continua usando Prisma com `DATABASE_URL` e `DIRECT_URL`. As variáveis Supabase desta seção atendem somente ao Storage.

## CI financeira

Em cada pull request e push para `main`, `.github/workflows/ci.yml` provisiona um PostgreSQL descartável, aplica todas as migrations e executa testes, lint e build. Os testes de integração limpam as tabelas antes de cada cenário; por isso o workflow usa um banco efêmero dedicado chamado `finance_test`.

Para executar os mesmos cenários localmente, configure `DATABASE_URL` e `DIRECT_URL` em um PostgreSQL descartável cujo nome contenha `test`, aplique as migrations e defina `RUN_FINANCE_INTEGRATION_TESTS=1`. A suíte recusa executar gravações se o nome do banco não indicar um destino de teste.

## Backup diário

O workflow `.github/workflows/database-backup.yml` roda diariamente às 06:17 UTC quando `DATABASE_BACKUP_ENABLED=true`.

No GitHub, configure:

| Tipo | Nome | Conteúdo |
|---|---|---|
| Secret | `BACKUP_DATABASE_URL` | URL do PostgreSQL de produção por conexão direta ou session pooler; não use transaction pooler |
| Secret | `SUPABASE_STORAGE_SERVICE_ROLE_KEY` | Chave privada com permissão para escrever no Storage |
| Variable | `SUPABASE_STORAGE_URL` | URL base do projeto Supabase |
| Variable | `BACKUP_BUCKET` | `database-backups` |
| Variable | `BACKUP_AGE_RECIPIENT` | Chave pública age usada para cifrar os dumps |
| Variable | `DEPOSIT_PROOFS_BUCKET` | Bucket de comprovantes de produção (padrão `deposit-proofs`) |
| Variable | `DATABASE_BACKUP_ENABLED` | `true` para ativar o job agendado |

Crie o bucket privado `database-backups` com limite de objeto acima do tamanho estimado do dump comprimido. Gere o par de chaves com `age-keygen`; guarde a identidade privada em local seguro fora do GitHub e cadastre somente a chave pública como `BACKUP_AGE_RECIPIENT`. O arquivo contém dump PostgreSQL e cópia de todos os comprovantes privados, tem hashes verificados e é cifrado antes de ser enviado. Restrinja o acesso ao bucket e use uma cópia em provedor/região independente para proteção contra perda do projeto Supabase inteiro.

## Exercício de restauração

O workflow manual `.github/workflows/restore-drill.yml` exige o environment GitHub `staging` e substitui o banco informado por `STAGING_DATABASE_URL`. Configure esse secret no environment apontando exclusivamente para um banco descartável de homologação. O workflow também compara o destino com `BACKUP_DATABASE_URL` e interrompe a restauração se reconhecer o mesmo banco ou projeto Supabase de origem. Configure `STAGING_SUPABASE_STORAGE_URL` e `STAGING_DEPOSIT_PROOFS_BUCKET` como variables e `STAGING_SUPABASE_STORAGE_SERVICE_ROLE_KEY` como secret, todos para um projeto Supabase de homologação separado. A origem do backup usa `SUPABASE_STORAGE_URL`, `SUPABASE_STORAGE_SERVICE_ROLE_KEY` e `BACKUP_BUCKET`; configure `BACKUP_AGE_IDENTITY` como secret nesse environment.

Execute o workflow com o caminho de um objeto `backups/...tar.gz.age` e digite `RESTORE_STAGING`. A rotina baixa e decifra o backup, restaura o PostgreSQL, reenvia os comprovantes para o Storage de homologação e verifica que há contas financeiras. O procedimento substitui os dados do banco de homologação e escreve no bucket de homologação; não configure URLs de produção nesse environment.

## Monitoramento de disponibilidade

O endpoint público `/api/health` verifica uma consulta ao PostgreSQL e responde HTTP 503 em caso de falha. O workflow `.github/workflows/health-monitor.yml` consulta a URL a cada 15 minutos quando `HEALTH_MONITOR_ENABLED=true`.

Configure a secret `APP_HEALTH_URL` com a URL HTTPS publicada terminada em `/api/health`; configure a variable `HEALTH_MONITOR_ENABLED=true`. Ative notificações do GitHub Actions para os responsáveis. Esse monitor cobre disponibilidade da aplicação e do banco; para alertas de erros de negócio, latência e métricas, configure um serviço de observabilidade na conta de hospedagem.

## Homologação e liberação

1. Mantenha projetos/bancos separados para desenvolvimento, homologação e produção.
2. Rode migrations em homologação e restaure nela o último backup cifrado.
3. Execute o CI, faça o fluxo de caixa ponta a ponta e confira os saldos por conta e o ledger.
4. Não promova para produção enquanto o CI falhar ou o exercício de restauração não estiver concluído.
5. Guarde registro da data do exercício, backup usado, resultado e responsável pela validação.
