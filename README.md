# Novo Caravela — Gestão

Aplicação web interna para apoiar a operação do salão de eventos Novo Caravela.

## Escopo da interface atual

A navegação principal é focada em:

- **Controle de caixas**: cadastro dos caixas por setor, abertura de operação com troco, retiradas e fechamento com batimento.
- **Colaboradores**: cadastro e manutenção dos funcionários que podem ser associados às operações.

O acesso à gestão é protegido por autenticação Auth.js e perfis `ADMIN` e `MANAGER`. O projeto usa PostgreSQL no Supabase com Prisma ORM; o aplicativo PDV Android/Flutter é separado.

## Tecnologias

- Next.js App Router 15, React 19 e TypeScript
- PostgreSQL e Prisma ORM 6
- Auth.js Credentials
- Zod para validação
- Deploy na Vercel

## Instalação rápida

Consulte o guia [Instalação e implantação](docs/instalacao-e-deploy.md) para variáveis de ambiente, conexão com Supabase, seed inicial, migrations e deploy.

```bash
npm ci
cp .env.example .env
npm run db:generate
npm run db:deploy
npm run db:seed
npm run dev
```

## Documentação

O índice de documentos está em [`docs/README.md`](docs/README.md). Os guias principais são:

- [Visão geral técnica](docs/visao-geral-tecnica.md)
- [Controle de caixas e colaboradores](docs/controle-de-caixas.md)
- [API de controle de caixas](docs/api-controle-de-caixas.md)
- [Instalação e implantação](docs/instalacao-e-deploy.md)
- [Especificação funcional original](docs/ESPECIFICACAO_GESTAO_NOVO_CARAVELA.md)
- [API e gestão do PDV](docs/pos-api.md)

A especificação original descreve um escopo mais amplo que a navegação atual. A documentação de controle de caixas descreve o fluxo operacional presente na versão simplificada.