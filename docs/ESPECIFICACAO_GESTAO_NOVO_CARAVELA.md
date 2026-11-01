# Novo Caravela — Especificação Funcional e Técnica

**Versão:** 3.1  
**Data:** 31/10/2026  
**Projeto:** `gestao-novo-caravela`  
**Repositório previsto:** https://github.com/hudsonof/gestao-novo-caravela  
**Status:** Especificação do MVP; implementação inicial em andamento. **Não é sistema homologado para operar dinheiro real.**

## 1. Objetivo

Desenvolver um sistema web para gestão financeira de um salão de eventos, centralizando eventos, bilheteria, mesas, bar, múltiplos caixas, fundo de troco, cofre central, receitas, despesas, contas a pagar, colaboradores, sangrias, depósitos, fechamento, auditoria e relatórios. O sistema deve permitir identificar **quanto entrou, quanto saiu, onde está o dinheiro e quem foi responsável**.

### 1.1 Decisões confirmadas

| Tema | Definição |
|---|---|
| Aplicação | Full-stack Next.js (App Router), React e TypeScript |
| Hospedagem | Vercel |
| Banco | PostgreSQL |
| ORM | Prisma |
| Vendas | Combinação de métodos; lançamentos manuais e automáticos |
| Setores | Bilheteria, Mesas e Bar |
| Caixas | Vários caixas por setor, com sessões por evento |
| Fundo de troco | Fundo central distribuído aos caixas |
| Cofre | Um cofre central |
| Pagamentos | Dinheiro, Pix, débito e crédito |
| Acesso | Administração e gerentes |
| Colaboradores | Cadastro operacional, sem login obrigatório |
| Despesas | Por evento e gerais; contas a pagar e vencimentos |
| Conferência | Gerente informa o valor físico contado |
| Saldos | Atualizados após cada lançamento confirmado |
| Integração | Stone futura, condicionada às APIs/dados disponíveis |

## 2. Escopo do produto

### 2.1 Módulos

1. **Eventos:** cadastro, status, responsáveis, datas, vinculação de caixas, resultados.
2. **Caixas:** cadastro por setor, múltiplas unidades, sessões de abertura e fechamento, saldo e extrato.
3. **Fundo central:** recebimento, distribuição e reposição de troco, devolução e saldo.
4. **Cofre central:** custódia do numerário, entradas por sangria, saídas para depósito.
5. **Movimentações:** entradas, saídas, transferências, estornos e histórico.
6. **Despesas e contas a pagar:** fornecedor, categoria, evento opcional, vencimento, pagamentos parciais, situação.
7. **Colaboradores:** cadastro, função, associação a eventos e caixas, diárias/cachês e pagamentos quando aplicável.
8. **Depósitos:** preparação, retirada, valor em trânsito, confirmação bancária, comprovante.
9. **Fechamento:** saldo esperado, valor físico informado, diferença, justificativa e aprovação.
10. **Dashboard e relatórios:** visão por evento, setor, caixa, período, pagamento e responsável.
11. **Segurança e auditoria:** papéis, autenticação, permissões, registro de operações e alertas.

### 2.2 Fora do MVP inicial

- PDV completo, comandas e estoque em tempo real.
- Integração automática Stone garantida (depende de disponibilidade e autorização).
- Detecção de desvios por câmeras/IA.
- Folha de pagamento e obrigações trabalhistas.
- Emissão fiscal automática.
- Conciliação bancária automatizada completa.

A arquitetura deve permitir evolução para essas funções sem reescrever o núcleo financeiro.

## 3. Fluxo operacional

1. **Preparação:** cadastrar evento, responsáveis e caixas; conferir fundo central.
2. **Abertura:** criar sessões de caixa, registrar operador e distribuir fundo de troco.
3. **Operação:** registrar vendas/recebimentos e despesas; atualizar saldos após cada transação.
4. **Sangrias:** transferir dinheiro do caixa ao cofre, identificando entrega e recebimento.
5. **Conferência:** gerente informa o valor físico contado; sistema calcula divergência.
6. **Fechamento:** registrar justificativa, aprovar ou sinalizar pendências e bloquear novos lançamentos comuns.
7. **Depósito:** retirar do cofre, registrar trânsito, confirmar crédito bancário com comprovante.
8. **Resumo:** consolidar faturamento, recebimentos, despesas, saldos e divergências do evento.

### 3.1 Setores

| Operação | Bilheteria | Mesas | Bar |
|---|---|---|---|
| Ingressos | Sim | Não | Não |
| Mesas/reservas | Não | Sim | Não |
| Bebidas | Não | Conforme operação | Sim |
| Fundo de troco | Sim | Sim | Sim |
| Sangrias | Sim | Sim | Sim |
| Fechamento individual | Sim | Sim | Sim |

**Não duplicar receita:** uma venda realizada com garçom, registrada na Stone e atendida no bar deve possuir uma única identidade comercial, mesmo que atravesse setores.

## 4. Requisitos funcionais

### Eventos — RF001–RF005

- **RF001:** criar, editar, consultar eventos.
- **RF002:** abrir e encerrar eventos.
- **RF003:** vincular múltiplos caixas ao evento.
- **RF004:** consultar resultados individuais e consolidados.
- **RF005:** bloquear encerramento com pendências não tratadas, exceto autorização auditada.

### Caixas — RF006–RF013

- **RF006:** cadastrar caixas por setor.
- **RF007:** abrir sessões por evento.
- **RF008:** registrar entradas e saídas.
- **RF009:** registrar forma de pagamento.
- **RF010:** transferir valores e registrar sangrias.
- **RF011:** registrar contagem física e fechamento.
- **RF012:** calcular diferenças entre saldo esperado e contado.
- **RF013:** consultar histórico por caixa e operador.

### Fundo e troco — RF014–RF020

- **RF014:** manter saldo do fundo central.
- **RF015:** distribuir troco aos caixas.
- **RF016:** repor troco.
- **RF017:** devolver dinheiro ao fundo central.
- **RF018:** permitir detalhamento opcional por cédulas/moedas; o fechamento do MVP exige somente valor total contado.
- **RF019:** impedir saída de numerário acima do saldo disponível, salvo ajuste formal autorizado.
- **RF020:** registrar quem autorizou, entregou e recebeu.

### Movimentações e despesas — RF021–RF028

- **RF021:** registrar receitas manualmente.
- **RF022:** aceitar importação/integração de receitas sem duplicidade.
- **RF023:** manter categorias de receitas e despesas.
- **RF024:** registrar pagamentos e anexar comprovantes.
- **RF025:** vincular despesas a evento ou administração geral.
- **RF026:** controlar contas abertas, parciais, pagas e vencidas.
- **RF027:** registrar cancelamentos e estornos justificados.
- **RF028:** guardar origem, referência externa e idempotência.

### Colaboradores — RF029–RF033

- **RF029:** cadastrar e consultar colaboradores.
- **RF030:** vincular colaboradores a caixas/eventos.
- **RF031:** registrar diárias/cachês quando aplicável.
- **RF032:** controlar valores pendentes e pagos.
- **RF033:** consultar histórico financeiro por colaborador.

### Cofre e depósitos — RF034–RF040

- **RF034:** registrar sangrias.
- **RF035:** transferir numerário ao cofre central.
- **RF036:** registrar retirada para depósito.
- **RF037:** identificar responsável pelo transporte.
- **RF038:** anexar comprovante bancário.
- **RF039:** confirmar depósito realizado.
- **RF040:** identificar valores em trânsito e pendentes.

### Dashboard e relatórios — RF041–RF048

- **RF041:** visão por evento e consolidada.
- **RF042:** receitas por setor e forma de pagamento.
- **RF043:** despesas por categoria.
- **RF044:** saldos por caixa, fundo e cofre.
- **RF045:** divergências de fechamento.
- **RF046:** resultado financeiro por evento.
- **RF047:** exportação CSV no MVP; Excel/PDF como evolução.
- **RF048:** relatório de auditoria.

## 5. Regras de negócio

| Código | Regra |
|---|---|
| RN001 | Toda sessão pertence a um evento e caixa. |
| RN002 | Um caixa não possui duas sessões abertas simultaneamente. |
| RN003 | Transferência interna não gera faturamento nem despesa. |
| RN004 | Registro importado possui identidade externa única. |
| RN005 | Dinheiro, Pix, débito e crédito são conciliados separadamente. |
| RN006 | Lançamentos confirmados não podem ser apagados fisicamente. |
| RN007 | Estorno preserva o original, a justificativa e o responsável. |
| RN008 | Sangria registra origem, destino, entrega e recebimento. |
| RN009 | Fechamento guarda saldo esperado, contado e diferença. |
| RN010 | Sessão encerrada não aceita movimentação ordinária. |
| RN011 | Despesa geral pode não pertencer a evento. |
| RN012 | Toda operação registra usuário, data e origem. |
| RN013 | Pagamentos parciais acumulados não excedem a dívida. |
| RN014 | Depósito em trânsito não é tratado como depósito confirmado. |
| RN015 | Operações concorrentes não podem gerar saldo incorreto. |
| RN016 | Reenvio de operação com mesma chave idempotente não cria novo movimento. |
| RN017 | Venda em cartão/Pix não aumenta o saldo físico em dinheiro. |
| RN018 | Ajustes de caixa exigem justificativa e trilha de auditoria. |

### 5.1 Fórmulas

```text
Saldo físico esperado = saldo inicial + entradas em dinheiro - saídas em dinheiro
Diferença de fechamento = valor contado - saldo físico esperado
Saldo a pagar = valor da despesa - soma dos pagamentos confirmados
Resultado preliminar = receitas reconhecidas - despesas atribuídas ao período/evento
```

**Atenção:** resultado preliminar não é lucro líquido contábil. Receitas, recebimentos, fluxo de caixa e contas a receber devem ser apresentados separadamente.

### 5.2 Exemplo de fundo

| Destino | Valor ilustrativo |
|---|---:|
| Bilheteria 01 | R$ 300 |
| Bilheteria 02 | R$ 300 |
| Mesas 01 | R$ 200 |
| Bar 01 | R$ 400 |
| Bar 02 | R$ 400 |
| **Total transferido** | **R$ 1.600** |

O valor apenas muda de conta interna; não entra no faturamento.

## 6. Backlog de implementação

**Prioridade:** P0 = obrigatório para operação; P1 = pode ser entregue após o núcleo financeiro.

| Épico | ID | História | Prioridade |
|---|---|---|---|
| Segurança | US001 | Login e sessão | P0 |
| Segurança | US002 | Permissões administrador/gerente | P0 |
| Segurança | US003 | Cadastro e desativação de usuários | P0 |
| Segurança | US004 | Auditoria de operações | P0 |
| Eventos | US005 | CRUD de eventos | P0 |
| Eventos | US006 | Abertura e encerramento de eventos | P0 |
| Colaboradores | US007 | Cadastro e funções | P0 |
| Colaboradores | US008 | Vincular responsáveis | P0 |
| Caixas | US009 | Múltiplos caixas por setor | P0 |
| Caixas | US010 | Abertura de sessão | P0 |
| Fundo | US011 | Distribuição de troco | P0 |
| Fundo | US012 | Reposição e devolução | P0 |
| Saldos | US013 | Atualização após cada lançamento | P0 |
| Movimentações | US014 | Receitas por setor e pagamento | P0 |
| Movimentações | US015 | Saídas e despesas pagas | P0 |
| Movimentações | US016 | Transferências internas | P0 |
| Movimentações | US017 | Estornos justificados | P0 |
| Movimentações | US018 | Extrato com filtros | P0 |
| Cofre | US019 | Sangrias para cofre | P0 |
| Cofre | US020 | Saldo do cofre central | P0 |
| Depósitos | US021 | Retirada para depósito | P0 |
| Depósitos | US022 | Confirmação e comprovante | P0 |
| Fechamento | US023 | Valor físico contado | P0 |
| Fechamento | US024 | Saldo esperado e diferença | P0 |
| Fechamento | US025 | Confirmação por gerente | P0 |
| Fechamento | US026 | Justificativas e pendências | P0 |
| Despesas | US027 | Despesas gerais ou por evento | P0 |
| Despesas | US028 | Fornecedor, categoria e vencimento | P0 |
| Despesas | US029 | Pagamentos parciais/integrais | P0 |
| Despesas | US030 | Vencidas e a vencer | P0 |
| Dashboard | US031 | Saldos por caixa e cofre | P1 |
| Dashboard | US032 | Receitas e despesas por evento | P1 |
| Dashboard | US033 | Alertas e divergências | P1 |
| Relatórios | US034 | Exportação CSV | P1 |
| Qualidade | US035 | Testes financeiros automatizados | P0 |
| Infra | US036 | PostgreSQL e migrations | P0 |
| Infra | US037 | Vercel e ambientes | P0 |
| Infra | US038 | Backup, monitoramento e homologação | P0 |

### 6.1 Critérios de aceite do MVP

- Administrador ou gerente autenticado consegue abrir evento e várias sessões de caixa.
- Distribuição do fundo altera saldos internos, sem gerar receita.
- Cada lançamento confirmado aparece no extrato e atualiza o saldo imediatamente após a transação.
- Sangria reduz caixa e aumenta cofre no mesmo commit.
- Fechamento registra valor físico, saldo esperado, divergência e responsável.
- Despesa pode ter vencimento, evento opcional e pagamentos parciais.
- Depósito transita de cofre para valor em trânsito e depois para banco, sem duplicar entrada.
- É possível consultar resumo por evento e rastrear cada movimentação.
- Testes críticos de concorrência, idempotência e autorização passam.

## 7. Arquitetura

```text
Navegador (desktop / tablet / celular)
  └── Next.js App Router + React + TypeScript
       ├── Server Components (consultas)
       ├── Server Actions (operações internas)
       ├── Route Handlers (APIs / webhooks)
       └── Serviços de domínio
            ├── Autorização e validação Zod
            ├── Eventos / sessões / fundo / cofre
            ├── Ledger de movimentações
            ├── Despesas / depósitos / fechamento
            └── Auditoria e idempotência
                 └── Prisma ORM
                      └── PostgreSQL gerenciado
```

**Tecnologias:** Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, Zod, Prisma, PostgreSQL, Auth.js ou provedor gerenciado, Vitest, Playwright, Sentry, storage privado de comprovantes e Vercel.

### 7.1 Organização sugerida

```text
src/
├── app/
│   ├── (auth)/login/
│   ├── (dashboard)/
│   │   ├── dashboard/
│   │   ├── eventos/
│   │   ├── caixas/
│   │   ├── fundo-caixa/
│   │   ├── cofre/
│   │   ├── movimentacoes/
│   │   ├── despesas/
│   │   ├── colaboradores/
│   │   ├── depositos/
│   │   └── relatorios/
│   └── api/integrations/stone/
├── modules/
│   ├── events/
│   ├── cash-registers/
│   ├── cash-fund/
│   ├── transactions/
│   ├── expenses/
│   ├── employees/
│   ├── deposits/
│   ├── reconciliation/
│   └── reports/
├── components/ui/
├── lib/auth/
├── lib/db/
└── types/
prisma/
├── schema.prisma
└── migrations/
```

### 7.2 Requisitos não funcionais

- Valores monetários em `Decimal(18,2)` ou inteiros em centavos, nunca `float`.
- Transações ACID para movimentação e atualização de saldos.
- Proteção contra concorrência (bloqueio/controle de versão) e idempotência.
- Autorização **no servidor**, inclusive em Server Actions.
- Registros financeiros imutáveis após confirmação; correções via estorno.
- Logs estruturados e auditoria com responsável, antes/depois e data.
- Backup automático, restauração testada, segregação de ambientes.
- Banco acessível somente pelo backend; credenciais em variáveis seguras.
- Pooling adequado para PostgreSQL em execução serverless.
- Atualização da interface após mutações; consultas periódicas ou eventos em tempo real entre sessões.
- Importações demoradas em jobs persistentes, sem depender de requisições longas.
- Comprovantes em storage privado, com autorização de leitura.

## 8. Modelo de dados Prisma

### 8.1 Entidades centrais

| Entidade | Função |
|---|---|
| `User` | Usuários administradores/gerentes |
| `Employee` | Colaboradores operacionais |
| `Event` | Eventos e status |
| `CashRegister` | Cadastro físico/lógico dos caixas |
| `CashSession` | Operação de um caixa em um evento |
| `FinancialAccount` | Contas de caixa, fundo, cofre, banco, trânsito, recebíveis |
| `FinancialTransaction` | Lançamentos, transferências, estornos |
| `CashClosing` | Conferência e divergência |
| `Expense` | Contas a pagar |
| `ExpensePayment` | Pagamentos das despesas |
| `Deposit` | Depósitos e confirmação |
| `AuditLog` | Trilha de auditoria |
| `IntegrationRecord` | Deduplicação de registros externos |
| `Receivable` | Recebíveis Pix/cartão e liquidações (fase de conciliação) |

### 8.2 Enums e campos mínimos propostos

```prisma
enum UserRole { ADMIN MANAGER }
enum EventStatus { PLANNED OPEN CLOSING CLOSED CANCELLED }
enum CashSector { TICKETS TABLES BAR }
enum SessionStatus { OPEN CLOSED }
enum AccountType {
  CASH_SESSION CENTRAL_FUND CENTRAL_VAULT BANK IN_TRANSIT
  RECEIVABLE EXTERNAL
}
enum TransactionType { SALE EXPENSE TRANSFER ADJUSTMENT REFUND }
enum PaymentMethod { CASH PIX DEBIT CREDIT BANK_TRANSFER }
enum ExpenseStatus { OPEN PARTIAL PAID CANCELLED }
enum DepositStatus { PREPARED IN_TRANSIT CONFIRMED CANCELLED }
```

**Campos de referência:**

- `User`: `id`, `name`, `email` único, `role`, `active`, `createdAt`.
- `Employee`: `id`, `name`, `position`, `active`, `createdAt`.
- `Event`: `id`, `name`, `startsAt`, `endsAt`, `status`, `notes`, `createdAt`.
- `CashRegister`: `id`, `name`, `sector`, `active`.
- `CashSession`: `id`, `eventId`, `registerId`, `accountId` único, `employeeId`, `openedById`, `openedAt`, `closedAt`, `status`.
- `FinancialAccount`: `id`, `name`, `type`, `balance Decimal(18,2)`, `active`.
- `FinancialTransaction`: `id`, `eventId`, `sourceId`, `destinationId`, `type`, `paymentMethod`, `amount Decimal(18,2)`, `description`, `reference`, `idempotencyKey` único, `reversalOfId`, `createdById`, `createdAt`.
- `CashClosing`: `id`, `sessionId` único, `expectedAmount`, `countedAmount`, `difference`, `justification`, `closedById`, `createdAt`.
- `Expense`: `id`, `eventId` opcional, `description`, `category`, `supplier`, `amount`, `dueDate`, `status`, `createdAt`.
- `ExpensePayment`: `id`, `expenseId`, `transactionId` único, `amount`, `paidAt`, `createdById`.
- `Deposit`: `id`, `amount`, `status`, `withdrawalTxId` único, `confirmationTxId` opcional, `bankReference`, `preparedById`, `confirmedAt`, `createdAt`.
- `AuditLog`: `id`, `actorId`, `entity`, `entityId`, `action`, `before Json`, `after Json`, `createdAt`.

**Importante:** esta é a definição conceitual inicial, não um schema final pronto para migration. As relações inversas, FKs, índices, constraints e relações com autenticação devem ser completadas e testadas no arquivo `prisma/schema.prisma` do projeto. O schema efetivamente implementado pode evoluir, desde que preserve as regras financeiras.

### 8.3 Restrições de banco

- `CHECK (amount > 0)` para movimentações válidas.
- Origem e destino diferentes quando ambos definidos.
- Índice único parcial para uma sessão aberta por caixa.
- Unicidade de referências externas por provedor e identificador.
- Débito e crédito na mesma transação.
- Pagamentos acumulados não podem exceder o total da despesa.
- Não permitir transferência acima do saldo físico disponível.
- Saldo materializado deve ser reconciliável com o ledger.
- Impedir mutação/exclusão de lançamentos confirmados; estorno cria operação vinculada.

## 9. Rotas de interface

| Rota | Tela |
|---|---|
| `/login` | Login |
| `/dashboard` | Resumo geral |
| `/eventos` | Eventos |
| `/eventos/novo` | Novo evento |
| `/eventos/[id]` | Detalhe do evento |
| `/caixas` | Caixas |
| `/caixas/[id]` | Sessão e extrato |
| `/caixas/[id]/fechamento` | Conferência e fechamento |
| `/fundo-caixa` | Fundo de troco |
| `/cofre` | Cofre central |
| `/movimentacoes` | Extrato |
| `/despesas` | Contas a pagar |
| `/despesas/nova` | Nova despesa |
| `/depositos` | Depósitos |
| `/colaboradores` | Colaboradores |
| `/relatorios` | Relatórios |
| `/configuracoes` | Usuários, categorias e parâmetros |

### 9.1 Operações HTTP propostas

| Método | Rota | Finalidade |
|---|---|---|
| POST | `/api/events` | Criar evento |
| POST | `/api/cash-sessions` | Abrir sessão |
| POST | `/api/transactions` | Registrar lançamento |
| POST | `/api/transfers` | Transferir valores |
| POST | `/api/cash-sessions/:id/close` | Fechar sessão |
| POST | `/api/expenses` | Cadastrar despesa |
| POST | `/api/expenses/:id/payments` | Pagar despesa |
| POST | `/api/deposits` | Preparar depósito |
| POST | `/api/deposits/:id/confirm` | Confirmar depósito |
| GET | `/api/reports/events/:id` | Resumo por evento |

Server Actions podem ser usadas nas operações internas da UI; Route Handlers são especialmente úteis para APIs, webhooks e integrações. Todas as entradas devem ser validadas com Zod e autorizadas no servidor.

## 10. Especificação das telas

### Dashboard

- Seleção de evento/período.
- Cards: receitas, despesas, saldo de caixas físicos, saldo do cofre.
- Lista de caixas abertos, saldos e operadores.
- Alertas: divergências, contas vencidas, depósitos pendentes.
- Gráficos de receitas por setor e forma de pagamento.

### Caixas

- Listagem por setor e evento, situação e responsável.
- Detalhe com saldo, fundo inicial, entradas, saídas e extrato.
- Ações: abrir, registrar entrada, registrar saída, transferir/sangria, fechar.
- Confirmação explícita de operações financeiras.

### Fechamento

- Exibir sessão, caixa, responsável e horário.
- Gerente informa o **valor físico total contado**.
- Sistema calcula diferença em relação ao esperado.
- Justificativa, aprovação e bloqueio de movimentações após encerramento.

### Contas a pagar

- Total pendente, vencido e a vencer.
- Listagem por fornecedor, evento, categoria, vencimento e status.
- Cadastro de despesa e pagamentos parciais/integrais.
- Anexos e histórico de pagamentos.

### Cofre e depósitos

- Saldo do cofre, histórico de sangrias, saídas e responsáveis.
- Preparar depósito, registrar valor em trânsito e confirmar com comprovante.

### Colaboradores e relatórios

- Cadastro e vínculo com eventos/caixas.
- Relatórios por evento, caixa, setor, forma de pagamento, período e colaborador.
- Exportação CSV inicialmente; PDF/Excel posteriormente.

## 11. Testes obrigatórios

| Cenário | Aceite |
|---|---|
| Duas transferências concorrentes | Sem saldo negativo indevido nem perda de atualização |
| Reenvio da mesma operação | Um único lançamento efetivo |
| Fundo → caixa | Soma dos saldos internos inalterada |
| Venda no crédito | Não aumenta dinheiro físico |
| Pagamento parcial | Saldo devedor correto |
| Lançamento após fechamento | Rejeitado |
| R$ 50 faltantes | Divergência de -R$ 50 registrada |
| Depósito não confirmado | Valor permanece em trânsito |
| Estorno | Original preservado e contralançamento rastreável |
| Usuário sem permissão | Operação recusada pelo backend |
| Falha entre débito/crédito | Rollback completo |
| Falha de conexão/backup | Recuperação testada |

## 12. Planejamento de entrega

| Sprint | Entrega |
|---|---|
| 1 | Fundação Next.js, autenticação, permissões, PostgreSQL, migrations, layout |
| 2 | Eventos, colaboradores, caixas, sessões, fundo central |
| 3 | Ledger, transferências, saldos e auditoria |
| 4 | Cofre, sangrias, depósitos e fechamento |
| 5 | Despesas, pagamentos, dashboard e relatórios |
| 6 | Testes de concorrência, segurança, deploy e homologação |

**Estimativa inicial:** 6–10 semanas, sujeita à disponibilidade da equipe e ao refinamento técnico. Integração Stone e conciliação avançada ficam para a próxima fase.

## 13. Infraestrutura e implantação

- Repositório GitHub: `hudsonof/gestao-novo-caravela`.
- Aplicação Vercel conectada ao repositório.
- Ambientes separados: desenvolvimento, homologação e produção.
- PostgreSQL gerenciado com pooling e backup.
- `DATABASE_URL` e segredos configurados como variáveis seguras.
- Migrations executadas de forma controlada no deploy.
- Monitoramento de erros, logs e alertas.
- Não liberar acesso de usuários reais até concluir autenticação, autorização e homologação financeira.

## 14. Situação do desenvolvimento

Foi preparada uma **base inicial local** com Next.js, Prisma, serviços de movimentação e telas de consulta, mas isso não equivale à conclusão do MVP. Permanecem pendentes: autenticação/autorização, migrations verificadas em PostgreSQL real, CRUDs completos, integrações, conciliação, testes de integração e concorrência, auditoria integral e homologação.

O repositório privado informado pelo responsável é `https://github.com/hudsonof/gestao-novo-caravela.git`. A publicação de arquivos no GitHub depende de acesso de escrita autorizado; esta especificação não afirma que o repositório já foi atualizado.

## 15. Próximos passos

1. Revisar o schema Prisma real do repositório e alinhar com esta especificação.
2. Criar migrations e validar conexão com PostgreSQL de desenvolvimento.
3. Implementar autenticação e autorização de administrador/gerente.
4. Finalizar o serviço transacional de movimentações e testes críticos.
5. Entregar CRUD de eventos, caixas, fundo, despesas e fechamento.
6. Homologar fluxo completo com dados fictícios antes de usar dinheiro real.

---

**Documento de referência para desenvolvimento do Novo Caravela.** Qualquer mudança que afete o cálculo de saldos, reconhecimento de receitas, contas a pagar ou rastreabilidade deve ser registrada e revisada antes de implementação.