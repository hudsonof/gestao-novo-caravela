# Novo Caravela — Gestão Financeira

Sistema web para gestão do fluxo de caixa do salão de eventos Novo Caravela.

## Stack

- Next.js App Router, React e TypeScript
- PostgreSQL e Prisma ORM 6
- Auth.js Credentials para acesso de administradores e gerentes
- Deploy previsto na Vercel

## Preparar ambiente

1. Copie `.env.example` para `.env` e configure `DATABASE_URL` para um PostgreSQL acessível.
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

- Eventos com estados planejado, aberto e encerrado.
- Caixas por setor (Bilheteria, Mesas e Bar), sessões por evento e colaborador, fundo de troco, sangria para o cofre e fechamento com contagem física.
- Entradas em dinheiro, Pix, débito, crédito e transferência bancária.
- Despesas vinculadas a evento ou gerais, vencimentos e pagamentos parciais.
- Transferências entre contas, fundo central, cofre, valores em trânsito, recebíveis e banco.
- Preparação, confirmação bancária ou cancelamento auditado de depósitos.
- Resumos por período, método, categoria, conta e divergência de fechamento.
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

A integração Stone permanece como etapa futura, condicionada à disponibilidade de credenciais e documentação/API para liquidação e conciliação. O sistema registra vendas manualmente por meio de pagamento e mantém cartão em recebíveis até transferência/baixa.

## Rotas principais

- Telas: `/`, `/eventos`, `/caixas`, `/movimentacoes`, `/despesas`, `/cofre`, `/relatorios`, `/equipe`, `/usuarios` (administrador).
- APIs de escrita financeira e cadastro são protegidas por sessão autenticada; a exceção pública é a checagem de saúde da aplicação.
- As rotas de API validam payloads, registram o ator e usam idempotência em operações financeiras.

## Implantação

Use PostgreSQL gerenciado com backups e conexão adequada a serverless. Configure `DATABASE_URL`, `AUTH_SECRET` e `AUTH_TRUST_HOST` nas variáveis da Vercel; aplique migrations controladas com `npm run db:deploy` e execute o seed administrativo apenas no primeiro setup. Não use credenciais de exemplo em ambiente publicado.

Antes de operar com valores reais, conecte um banco de homologação, revise as permissões de deploy e execute a bateria de validação funcional, concorrência e recuperação de backup. Não há conexão ativa com banco de produção neste repositório.
