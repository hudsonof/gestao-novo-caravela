# API e gestão do PDV

O PDV futuro deve usar o catálogo, pedidos e pagamentos do Novo Caravela. O aplicativo Android/Flutter e a integração Stone não fazem parte desta etapa.

## Configuração web

Acesse **PDV e catálogos** como gerente/administrador para cadastrar produtos:

- `ENTRY`: entradas da bilheteria;
- `TABLE`: opções de mesa;
- `BAR`: bebidas e porções.

Cada produto tem um preço padrão. Um preço específico por evento substitui o preço padrão somente naquele evento. Produtos e mesas podem ser inativados para impedir novas vendas sem apagar o histórico.

Cadastre um terminal com perfil e caixa compatíveis. Os perfis `BAR` e `WAITER` devem usar caixa do setor Bar. A credencial secreta é exibida uma única vez e guardada no banco somente como hash. Para trocar uma credencial, cadastre outro terminal e revogue o anterior; revogação não pode ser revertida.

## Autenticação

As rotas em `/api/v1/pos` exigem:

```http
Authorization: Bearer <credencial-do-terminal>
```

Toda operação de criação deve enviar `Idempotency-Key` única por ação para permitir repetição segura em caso de timeout. Reutilizar uma chave com outro conteúdo retorna conflito.

A credencial determina o perfil e o caixa; o cliente não pode enviar um perfil diferente para ampliar permissões.

## Rotas do terminal

| Método e rota | Finalidade |
|---|---|
| `GET /api/v1/pos/bootstrap?eventId=...` | Retorna evento, sessão aberta, produtos e preço efetivo. Para garçons, retorna mesas e colaboradores ativos. |
| `GET /api/v1/pos/orders?eventId=...` | Consulta comandas abertas do terminal. |
| `POST /api/v1/pos/orders` | Abre comanda/pedido. Corpo: `eventId`, `commandCode`, opcionalmente `tableId`, `waiterEmployeeId`, `operatorEmployeeId`. Garçons exige mesa e garçom. |
| `GET /api/v1/pos/orders/{id}` | Consulta uma comanda pertencente ao terminal. |
| `POST /api/v1/pos/orders/{id}/items` | Inclui produto. Corpo: `productId`, `quantity`. Preço e total são calculados no servidor. |
| `PATCH /api/v1/pos/orders/{id}/items/{itemId}` | Altera a quantidade enquanto não houver pagamentos. |
| `DELETE /api/v1/pos/orders/{id}/items/{itemId}` | Remove item enquanto não houver pagamentos. |
| `POST /api/v1/pos/orders/{id}/payments` | Registra pagamento. Corpo: `amount`, `method` (`CASH`, `PIX`, `BANK_TRANSFER`, `DEBIT`, `CREDIT`). Pagamento parcial é permitido. |
| `POST /api/v1/pos/orders/{id}/cancel` | Cancela comanda ainda não paga. Corpo: `reason`. |

### Exemplo

```http
POST /api/v1/pos/orders
Authorization: Bearer <credencial>
Idempotency-Key: <uuid>
Content-Type: application/json

{
  "eventId": "<evento>",
  "commandCode": "C-123",
  "tableId": "<mesa>",
  "waiterEmployeeId": "<colaborador>"
}
```

Venda direta no bar usa terminal `BAR`; venda de salão usa terminal `WAITER`. O servidor registra o canal a partir do terminal. O tipo de produto permitido também vem do perfil.

## Gestão financeira

Ao pagar, o pedido cria um lançamento `SALE` por meio de `postEntryTx`, com referência externa `POS`, sessão, evento e meio de pagamento. Dinheiro credita a conta da sessão; Pix/transferência credita a primeira conta bancária ativa; débito/crédito credita a primeira conta de recebíveis ativa. Configure estas contas antes de operar.

Pedidos e pagamentos aparecem em **Pedidos do PDV**. Gerentes podem cancelar pedidos sem pagamento ou estornar pedidos pagos. Estorno reverte os lançamentos vinculados e exige justificativa. Se a sessão em dinheiro já estiver fechada, o sistema bloqueia o estorno por essa sessão e exige ajuste no caixa atual.

## Restrições

- A sessão de caixa e o evento devem estar abertos para abrir pedidos e receber pagamentos.
- O total é recalculado pelo servidor com o preço efetivo do evento; o preço enviado pelo cliente é ignorado.
- Após o primeiro pagamento, itens ficam imutáveis; o saldo restante pode ser pago em outra operação.
- Produto usado, preço por evento associado ou mesa com pedido histórico não é apagado; inative em vez disso.
- A autenticação nesta versão usa credencial longa e revogável por terminal. TLS e armazenamento seguro no dispositivo são requisitos para o futuro aplicativo.


## Imagens do catálogo

A tela web aceita imagens JPG, PNG e WebP de até 4 MB. O arquivo é enviado ao bucket `pdv-caravela.firebasestorage.app` em uma rota autenticada do servidor; a credencial do Firebase não é enviada ao navegador. O terminal recebe uma URL assinada de leitura válida por uma hora no bootstrap, junto ao produto.

Configure no ambiente de deploy:

- `FIREBASE_STORAGE_BUCKET=pdv-caravela.firebasestorage.app`
- `FIREBASE_SERVICE_ACCOUNT_JSON`: JSON da conta de serviço do projeto Firebase/Google Cloud, guardado como segredo. Conceda permissão para criar, ler e excluir objetos no bucket.

Configure a mesma variável localmente para testar upload. Não commite a chave de serviço nem a adicione a variáveis `NEXT_PUBLIC_*`. A migration adiciona `PosProduct.imagePath`; execute `npm run db:deploy` depois de integrar a alteração.
