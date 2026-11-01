# Gestão Novo Caravela

Sistema web para a gestão financeira do salão de eventos: eventos, Bilheteria, Mesas, Bar, fundo de troco, cofre central, movimentações e contas a pagar.

## Stack

- Next.js App Router, React e TypeScript
- PostgreSQL com Prisma
- Deploy planejado na Vercel

## Estado do projeto

A especificação funcional completa está em docs/ESPECIFICACAO_GESTAO_NOVO_CARAVELA.md.

Esta é a fundação inicial: inclui o modelo de dados, serviços financeiros básicos, consultas de leitura e telas iniciais para painel, eventos, caixas, movimentações, despesas e cofre. O fluxo operacional ainda está em desenvolvimento.

**Não use para registrar valores reais.** Ainda faltam autenticação e autorização no servidor, operações completas de escrita, migrations revisadas em banco real, abertura de caixa e distribuição de troco, fechamento integrado à sessão, depósitos, fluxos completos de despesas, backups e homologação.

## Executar localmente

1. Instale as dependências:

       npm install

2. Copie .env.example para .env e configure DATABASE_URL com um PostgreSQL de desenvolvimento.

3. Crie a migration inicial:

       npx prisma migrate dev --name init

4. Inicie a aplicação:

       npm run dev

Acesse http://localhost:3000.

## Regras financeiras adotadas

- Dinheiro, Pix, débito e crédito ficam identificados separadamente.
- Entradas eletrônicas não aumentam o saldo físico da gaveta.
- Transferências entre fundo, caixas, cofre e trânsito não são faturamento.
- Lançamentos financeiros devem ser rastreáveis e idempotentes.
- Correções devem preservar o registro original.

A senha e a URL do banco devem ficar somente em variáveis de ambiente locais ou da Vercel. Não as coloque no repositório.
