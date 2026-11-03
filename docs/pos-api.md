# API e gestão do PDV

O PDV usa os mesmos usuários e o mesmo fluxo de autenticação do sistema de gestão. Não é mais necessário cadastrar terminais nem distribuir credenciais próprias de terminal. Esta etapa prepara e documenta a API; o aplicativo Android/Flutter e a integração Stone ficam em projeto separado.

## URL base

- Produção: `https://novo-caravela.vercel.app`
- Desenvolvimento: URL local ou ambiente de preview correspondente.

Todas as chamadas devem usar HTTPS em produção.

## Login e sessão

O login usa o provider Credentials do Auth.js já utilizado pelo sistema. O aplicativo deve guardar e reenviar os cookies de sessão com um cookie jar; não usa `Authorization: Bearer` nem token de terminal.

1. `GET /api/auth/csrf` para obter o `csrfToken`.
2. `POST /api/auth/callback/credentials` com `email`, `password` e `csrfToken`; preservar os cookies `Set-Cookie` da resposta.
3. `GET /api/auth/session` para validar o login e ler `user.id`, `user.role` e `user.posCashRegisterId`.
4. `POST /api/auth/signout` ao sair, enviando o CSRF token conforme o fluxo Auth.js.

A sessão tem duração de oito horas. O Auth.js trata o callback Credentials como POST e fornece o endpoint CSRF para proteger as operações de autenticação. Consulte a documentação oficial antes de implementar detalhes do cliente HTTP Flutter.

## Perfis e permissões

O administrador configura os usuários em **Acessos ao sistema**. Cada usuário possui um único perfil:

| Perfil no usuário | Setor permitido | Acesso |
|---|---|---|
| `POS_TICKETS` | Bilheteria | Abertura e operação de comandas de entrada |
| `POS_TABLES` | Mesas | Venda de mesas |
| `POS_BAR` | Bar | Venda direta de produtos do bar |
| `POS_WAITER` | Bar | Pedidos de salão com mesa e garçom |
| `MANAGER` | — | Rotas de gestão autorizadas a gerente |
| `ADMIN` | — | Rotas administrativas e de gestão |

Os perfis de operação devem estar vinculados a um caixa ativo do setor correspondente. O servidor valida usuário, situação, perfil e caixa em cada requisição. `MANAGER` e `ADMIN` também entram pelo mesmo login; no aplicativo, esses perfis devem abrir as funções de gestão consumindo as rotas já existentes, que continuam protegidas por `requireManager`/`requireAdmin`. As rotas de operação listadas abaixo são exclusivas dos perfis `POS_*` e não aceitam gerente/administrador sem perfil de caixa.

## Rotas de operação

| Método e rota | Finalidade |
|---|---|
| `GET /api/v1/pos/events` | Lista eventos abertos com sessão de caixa aberta no caixa associado ao usuário. |
| `GET /api/v1/pos/bootstrap?eventId=...` | Retorna usuário/perfil, caixa, evento, sessão, produtos com preço efetivo e imagens. Para Garçom, também retorna mesas e colaboradores ativos. |
| `GET /api/v1/pos/orders?eventId=...` | Lista comandas abertas do mesmo caixa e perfil. |
| `POST /api/v1/pos/orders` | Abre comanda/pedido. Corpo: `eventId`, `commandCode`, opcionalmente `tableId`, `waiterEmployeeId`, `operatorEmployeeId`. Garçom exige mesa e garçom. |
| `GET /api/v1/pos/orders/{id}` | Consulta comanda do caixa e perfil autenticados. |
| `POST /api/v1/pos/orders/{id}/items` | Inclui produto e quantidade. Preço é calculado no servidor. |
| `PATCH /api/v1/pos/orders/{id}/items/{itemId}` | Atualiza quantidade antes de qualquer pagamento. |
| `DELETE /api/v1/pos/orders/{id}/items/{itemId}` | Remove item antes de qualquer pagamento. |
| `POST /api/v1/pos/orders/{id}/payments` | Registra pagamento, inclusive parcial. |
| `POST /api/v1/pos/orders/{id}/cancel` | Cancela pedido aberto sem pagamento; exige `reason`. |

Todas as operações de escrita devem enviar `Idempotency-Key` única por ação para permitir repetição segura em caso de timeout. O aplicativo não pode escolher o perfil nem o caixa no payload: ambos vêm do usuário autenticado.

## Integração do aplicativo

1. Configurar `API_BASE_URL` como `https://novo-caravela.vercel.app` em produção.
2. Implementar cliente HTTP com cookie jar persistente e HTTPS; não armazenar senha depois do login.
3. Após autenticar, ler `user.role` e mostrar somente o fluxo correspondente.
4. Consultar eventos e bootstrap; montar catálogo de acordo com o perfil e carregar `imageUrl`.
5. Gerar chave idempotente por operação e enviar no header.
6. Tratar `401` como sessão expirada, `403` como perfil/caixa sem permissão e `409` como evento, caixa ou comanda em estado incompatível.
7. No pagamento Stone, registrar no backend apenas depois do resultado confirmado pelo fluxo Stone; preservar a chave idempotente para evitar duplicidade.

## Histórico e migração

Pedidos criados por terminais antigos preservam o vínculo histórico ao terminal. Novos pedidos registram o usuário autenticado; o campo de terminal fica vazio para novos registros. A migration adiciona os perfis de usuário, a associação de caixa e o operador do pedido sem remover os dados existentes.

Após integrar, aplique a migration com `npm run db:deploy`. Revise/atribua os perfis e caixas aos usuários em **Acessos ao sistema** antes de liberar o login dos PDVs.
