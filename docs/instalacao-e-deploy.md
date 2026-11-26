# Instalação e implantação

## Requisitos

- Node.js compatível com as versões do Next.js e Prisma declaradas em `package.json`.
- PostgreSQL. O projeto usa Supabase como provedor PostgreSQL e Prisma como ORM.
- Um usuário administrador inicial ou as variáveis `INITIAL_ADMIN_*` para o seed.

## Configuração local

1. Clone o repositório e instale as dependências:

```bash
npm ci
```

2. Copie o modelo de ambiente:

```bash
cp .env.example .env
```

3. Preencha as variáveis:

| Variável | Uso |
| --- | --- |
| `DATABASE_URL` | Conexão de runtime. No Supabase, use o Transaction Pooler (normalmente porta 6543) |
| `DIRECT_URL` | Conexão usada pelo Prisma CLI e migrations. Use Session Pooler (normalmente porta 5432) ou conexão direta compatível |
| `AUTH_SECRET` | Segredo aleatório para assinar a sessão Auth.js |
| `AUTH_TRUST_HOST` | Configure `true` nos ambientes hospedados atrás de proxy confiável |
| `BUSINESS_TIME_ZONE` | Fuso usado para exibir datas operacionais; padrão recomendado `America/Sao_Paulo` |
| `INITIAL_ADMIN_NAME` | Nome do administrador criado no seed, se configurado |
| `INITIAL_ADMIN_EMAIL` | E-mail do administrador inicial |
| `INITIAL_ADMIN_PASSWORD` | Senha inicial; use senha forte com pelo menos 14 caracteres |
| `FIREBASE_STORAGE_BUCKET` | Bucket de imagens do catálogo do PDV |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Credencial privada do Firebase para operações de imagens |

Use as URLs fornecidas pelo Supabase. Se a senha do PostgreSQL tiver caracteres especiais reservados em URL, aplique percent-encoding. Não publique `.env`, `AUTH_SECRET` ou credenciais do Firebase no Git.

Para gerar um segredo localmente, pode-se usar `openssl rand -base64 32`.

4. Gere o Prisma Client, aplique as migrations, rode o seed inicial e inicie o servidor:

```bash
npm run db:generate
npm run db:deploy
npm run db:seed
npm run dev
```

Acesse `/login`. O seed pode criar o administrador inicial quando as três variáveis `INITIAL_ADMIN_*` estiverem preenchidas. Não use credenciais de exemplo em ambiente compartilhado.

## Comandos disponíveis

| Comando | Uso |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Gera Prisma Client e compila Next.js |
| `npm run start` | Inicia a aplicação compilada |
| `npm run lint` | ESLint |
| `npm test` | Executa Vitest |
| `npm run db:generate` | Gera Prisma Client a partir do schema |
| `npm run db:migrate` | Cria/aplica migration no fluxo de desenvolvimento |
| `npm run db:deploy` | Aplica migrations pendentes; use no banco de destino antes do novo código depender do schema |
| `npm run db:seed` | Executa os dados iniciais e configuração de administrador |

`db:generate` atualiza o cliente Prisma; não altera o schema do banco. Para aplicar alterações de schema em produção, use `db:deploy`.

## Implantação na Vercel

Configure as variáveis de ambiente para os ambientes necessários (Development, Preview e Production) na Vercel. A configuração deve incluir `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `AUTH_TRUST_HOST` e `BUSINESS_TIME_ZONE`; inclua as variáveis de administrador apenas se o seed inicial for necessário. Configure as credenciais Firebase somente quando a funcionalidade de imagens do PDV for usada.

### Aplicação da migration de Vendas (Máquina)

A alteração adiciona `CashRegisterClosing.machineSales` e preenche o campo para fechamentos existentes com a soma de débito, crédito e Pix. As colunas antigas permanecem no banco.

Antes de liberar o código que consulta a nova coluna, aplique a migration no banco de destino:

```bash
npm run db:deploy
```

Execute o comando com o `.env` apontado para o banco correto ou em um job de release seguro. Depois, publique o código da aplicação. Não rode migrations apontando por engano para um banco local quando a intenção for atualizar produção.

`prisma.config.ts` lê `DIRECT_URL` para operações do Prisma CLI. O runtime da aplicação usa `DATABASE_URL`.

## Primeiro deploy e operação

- Gere credenciais próprias para cada ambiente e mantenha-as fora do repositório.
- Confirme no painel do Supabase que as migrations foram aplicadas ao banco esperado.
- Verifique o acesso com uma conta ativa `ADMIN` ou `MANAGER`.
- Faça a validação funcional com valores de teste antes de usar o fluxo com dinheiro real.
- Configure backup, retenção e recuperação de desastre diretamente no provedor do banco.