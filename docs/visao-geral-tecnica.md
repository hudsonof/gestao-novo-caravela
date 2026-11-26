# Visão geral técnica

## Produto e escopo

O Novo Caravela é uma aplicação web interna para apoiar a gestão do salão de eventos. A experiência principal atual mantém dois módulos: controle de caixas e cadastro de colaboradores. A especificação funcional ampla permanece em [ESPECIFICACAO_GESTAO_NOVO_CARAVELA.md](ESPECIFICACAO_GESTAO_NOVO_CARAVELA.md) como referência de requisitos e backlog.

O aplicativo PDV Android/Flutter é um projeto separado. A documentação da API e autenticação planejadas para o PDV está em [pos-api.md](pos-api.md).

## Stack

| Camada | Tecnologia |
| --- | --- |
| Interface e servidor web | Next.js App Router 15, React 19 e TypeScript |
| Persistência | PostgreSQL no Supabase e Prisma ORM 6 |
| Validação de entrada | Zod |
| Autenticação | Auth.js Credentials, sessão JWT e cookies |
| Hospedagem prevista | Vercel |

A aplicação usa Prisma para as conexões e migrations. O pacote `@supabase/supabase-js` não é necessário para o fluxo atual do banco.

## Organização

- `src/app/(dashboard)/`: páginas protegidas da área de gestão.
- `src/app/api/`: endpoints HTTP de autenticação, gestão e operações.
- `src/components/`: componentes de tela, formulários e modais.
- `src/lib/`: conexão Prisma, autorização, validação compartilhada e utilitários.
- `prisma/schema.prisma`: modelo PostgreSQL declarado para o Prisma.
- `prisma/migrations/`: histórico versionado de alterações do banco.

As páginas e APIs de gestão consultam a autorização no servidor. A interface não é a única barreira de acesso.

## Autenticação e perfis

Auth.js autentica usuários com e-mail e senha. A sessão dura oito horas. Usuários inativos ou inexistentes não podem continuar autenticados.

| Perfil | Acesso principal |
| --- | --- |
| `ADMIN` | Controle de caixas e colaboradores; operações administrativas autorizadas |
| `MANAGER` | Controle de caixas e colaboradores |
| `POS_TICKETS`, `POS_TABLES`, `POS_BAR`, `POS_WAITER` | Acesso ao fluxo de PDV conforme o perfil, em rotas próprias |

O middleware de gestão exige `ADMIN` ou `MANAGER`. O cadastro de colaborador é um registro operacional e não cria uma conta de login.

## Modelo financeiro e consistência

- Valores monetários são armazenados como `NUMERIC(18,2)` e manipulados com `Prisma.Decimal`.
- O navegador usa máscara em Real; as APIs recebem valores decimais em texto, como `125.50`.
- Abertura, retirada e fechamento usam transações e bloqueios de linha para evitar alterações concorrentes sobre o mesmo caixa.
- Aberturas, retiradas, exclusões de retirada e fechamentos geram registros em `AuditLog`.
- Operações `POST` financeiras usam `x-idempotency-key` (UUID) para reduzir duplicidade em repetição após falha de rede.

## Principais entidades

| Entidade | Papel |
| --- | --- |
| `User` | Conta de acesso, perfil e estado ativo |
| `Employee` | Colaborador associado opcionalmente à operação do caixa |
| `CashRegister` | Caixa cadastrado por setor e situação |
| `CashRegisterShift` | Período operacional aberto e fechado |
| `CashRegisterWithdrawal` | Retirada vinculada a uma operação aberta |
| `CashRegisterClosing` | Valores informados no fechamento e resultado do batimento |
| `AuditLog` | Trilha de ações administrativas e financeiras |

A coluna `machineSales` registra o total consolidado de vendas no fechamento. As colunas históricas `debitSales`, `creditSales` e `pixSales` permanecem no schema para preservar os dados já gravados.