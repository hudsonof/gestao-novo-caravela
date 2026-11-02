# Novo Caravela — Gestão Financeira

Sistema web para gestão do fluxo de caixa do salão de eventos Novo Caravela.

## Stack

- Next.js App Router, React e TypeScript
- PostgreSQL no Supabase e Prisma ORM 6
- Auth.js Credentials para acesso de administradores e gerentes
- Deploy previsto na Vercel

## Preparar ambiente

1. Copie `.env.example` para `.env` e obtenha as URLs em **Supabase Dashboard → Connect**:
   - `DATABASE_URL`: use o **Transaction pooler** (porta 6543) para as conexões da aplicação na Vercel. O exemplo inclui `pgbouncer=true` e `connection_limit=1`.
   - `DIRECT_URL`: use o **Session pooler** (porta 5432) ou a conexão direta, se o ambiente tiver suporte de rede compatível. O Prisma CLI usa essa URL para gerar e aplicar migrations.
   - Copie as strings exibidas pelo Supabase e substitua os valores do exemplo. Se a senha tiver caracteres reservados em URL, faça o percent-encoding deles.
2. Gere um `AUTH_SECRET` aleatório, ajuste `BUSINESS_TIME_ZONE` para o fuso do salão e defina as credenciais iniciais de administrador. A senha inicial precisa ter ao menos 14 caracteres.
3. Instale as dependências e aplique o schema:

```bash
npm install
npm run db:generate
npm run db:deploy
npm run db:seed
npm run dev
```

Depois, entre em `/login`. A rotina de seed cria as contas internas (fundo, cofre, banco, recebíveis, trânsito e contrapartida externa), três caixas de exemplo e o administrador inicial quando as variáveis `INITIAL_ADMIN_*` estão preenchidas. A senha é armazenada com hash; o seed não troca a senha de um usuário que já existe.

## Módulos disponíveis

- Eventos com estados planejado, aberto, encerrado e cancelado; eventos planejados podem ser editados e têm responsável identificado.
- Cadastro de caixas por setor com edição antes do primeiro uso e inativação preservando o histórico; sessões por evento e colaborador, fundo de troco, sangria para o cofre e fechamento com contagem física.
- Entradas em dinheiro, Pix, débito, crédito e transferência bancária.
- Despesas vinculadas a evento ou gerais, categorias padronizadas, vencimentos sinalizados e pagamentos parciais.
- Cadastro de categorias de receitas e despesas, com inativação preservando os nomes usados em lançamentos históricos.
- Diárias e cachês por colaborador, com associação opcional a evento, pagamentos parciais, estorno e histórico.
- Transferências entre contas, fundo central, cofre, valores em trânsito, recebíveis e banco.
- Preparação, confirmação bancária ou cancelamento auditado de depósitos.
- Resumos por período, evento, método, categoria, conta e divergência de fechamento, com exportação CSV e consulta da trilha de auditoria.
- Cadastro de colaboradores sem credencial e usuários ADMIN/MANAGER com controle de acesso.
- Estornos por novo lançamento, trilha de auditoria e chaves de idempotência.

## Regras financeiras

- Dinheiro fica em contas físicas de sessão; Pix e transferência entram na conta bancária; cartão de débito/crédito entra em recebíveis.
- Transferências internas não entram como receita nem despesa.
- Despesa cadastrada não reduz caixa até haver pagamento.
- Divergência de fechamento exige justificativa e gera ajuste auditado para alinhar o saldo físico contado.
- Após fechar uma sessão, seu saldo só pode ser recolhido ao cofre. O evento só pode ser encerrado depois de fechar as sessões e recolher os saldos.
- Lançamentos não devem ser editados ou apagados; correções são feitas com estorno identificado.
- Valores são armazenados como `NUMERIC(18,2)`; operações de saldo usam transação e bloqueio de linha.

## Integração de adquirente

A API `POST /api/transactions/import` aceita vendas normalizadas com origem e referência externa únicas, para permitir uma futura ingestão idempotente. A integração automática Stone permanece pendente de credenciais e documentação/API para liquidação e conciliação. O sistema registra vendas manualmente por meio de pagamento e mantém cartão em recebíveis até transferência/baixa.

O cadastro do responsável pelo transporte do depósito e a referência textual do comprovante são registrados. A tela do cofre permite anexar comprovantes PDF, JPG ou PNG de até 10 MB. O servidor emite uma URL temporária de upload para um único caminho e valida novamente o conteúdo depois do envio direto ao bucket privado do Supabase Storage. O banco registra hash SHA-256 e auditoria; links de leitura duram 60 segundos. A chave `SUPABASE_STORAGE_SERVICE_ROLE_KEY` permanece somente no servidor.

Para habilitar anexos, crie no Supabase Storage um bucket **privado** chamado `deposit-proofs` com limite máximo de arquivo de 10 MB, configure `SUPABASE_STORAGE_URL`, `SUPABASE_STORAGE_SERVICE_ROLE_KEY` e `DEPOSIT_PROOFS_BUCKET`, aplique as migrations e redeploy a aplicação. O acesso ao arquivo exige uma sessão ADMIN/MANAGER. Se o projeto restringir CORS, permita os domínios da aplicação. O banco continua conectado exclusivamente por Prisma usando `DATABASE_URL` e `DIRECT_URL`.

## Rotas principais

- Telas: `/`, `/eventos`, `/caixas`, `/movimentacoes`, `/despesas`, `/cofre`, `/relatorios`, `/auditoria`, `/equipe`, `/usuarios` (administrador).
- APIs de escrita financeira e cadastro são protegidas por sessão autenticada; a exceção pública é a checagem de saúde da aplicação.
- As rotas de API validam payloads, registram o ator e usam idempotência em operações financeiras.

## Implantação

Configure `DATABASE_URL` (pooler transacional), `DIRECT_URL` (pooler de sessão ou conexão direta), `AUTH_SECRET` e `AUTH_TRUST_HOST` nas variáveis do ambiente da Vercel. Aplique migrations controladas com `npm run db:deploy` e execute o seed administrativo apenas no primeiro setup. Não use credenciais de exemplo em ambiente publicado.

O workflow `CI financeira` aplica as migrations em PostgreSQL isolado, executa testes unitários e de integração financeira, lint e build em cada PR e push para `main`.

Antes de operar com valores reais, conecte um banco de homologação separado e revise as permissões de deploy. Não há conexão ativa com banco de produção neste repositório.

As migrations mais recentes adicionam responsáveis do evento e do transporte do depósito, referências externas de movimentações, categorias financeiras, controle de diárias/cachês e metadados dos comprovantes. Aplique-as com `npm run db:deploy` e execute `npm run db:seed` para cadastrar as categorias iniciais antes de publicar a versão.

### Testes financeiros

`npm test` executa testes unitários de valores, autorização e validação de comprovantes. Os cenários de integração usam PostgreSQL real e só são ativados quando `RUN_FINANCE_INTEGRATION_TESTS=1`; o workflow de CI cria um banco efêmero chamado `finance_test` e executa esses cenários automaticamente. Para rodá-los localmente, configure `DATABASE_URL` e `DIRECT_URL` para um banco descartável cujo nome contenha `test`, aplique as migrations e defina `RUN_FINANCE_INTEGRATION_TESTS=1` antes de executar `npm test`. A suíte limpa as tabelas do banco antes de cada cenário; nunca use URLs de desenvolvimento compartilhado ou produção.

### Backup e recuperação

O workflow `Backup PostgreSQL` cria um dump custom, valida sua leitura, cifra com age e envia o arquivo para um bucket privado do Supabase Storage. Ele roda diariamente às 06:17 UTC e também pode ser acionado manualmente. Para habilitá-lo:

1. Crie um bucket privado separado chamado `database-backups`.
2. Gere uma chave age (`age-keygen`); salve a chave privada como secret `BACKUP_AGE_IDENTITY` e publique somente a chave pública como variable `BACKUP_AGE_RECIPIENT`.
3. Configure `BACKUP_DATABASE_URL` como secret usando uma conexão PostgreSQL não transacional, `SUPABASE_STORAGE_SERVICE_ROLE_KEY` como secret e as variables `SUPABASE_STORAGE_URL`, `DEPOSIT_PROOFS_BUCKET` (se diferente do padrão) e `BACKUP_BUCKET=database-backups`.
4. Crie a variable `DATABASE_BACKUP_ENABLED=true` para ativar o agendamento.

O arquivo de backup contém o dump PostgreSQL e os comprovantes privados, com manifesto de tamanho e SHA-256, e é cifrado antes do upload. O workflow manual `Simulação de restauração em homologação` baixa e decifra o arquivo e substitui o banco configurado no environment GitHub `staging`. Configure `STAGING_DATABASE_URL` nesse environment apontando para um banco descartável separado da produção e habilite aprovação de ambiente se desejar. Informe o caminho do objeto `backups/...tar.gz.age` e a confirmação `RESTORE_STAGING`. O workflow compara o destino com a origem em `BACKUP_DATABASE_URL` e bloqueia o mesmo banco/projeto Supabase; mantenha o environment apontado somente para recursos descartáveis. A rotina valida a restauração e verifica se há contas financeiras. A configuração completa de buckets, variáveis e secrets está em [docs/OPERATIONS.md](docs/OPERATIONS.md).

### Monitoramento

O workflow `Monitor de disponibilidade` consulta `/api/health` a cada 15 minutos e falha se a aplicação ou o PostgreSQL não responderem como disponíveis. Configure o secret `APP_HEALTH_URL` com a URL completa do endpoint publicado e a variable `HEALTH_MONITOR_ENABLED=true`. Falhas ficam visíveis em GitHub Actions; configure notificações do repositório para os responsáveis pela operação. Esses workflows são preparados no código, mas só passam a executar quando os secrets, variables, buckets e ambiente `staging` forem configurados na conta.
