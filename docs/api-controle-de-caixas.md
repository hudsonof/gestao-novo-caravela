# API de controle de caixas

Esta documentação descreve os endpoints de operações simplificadas de caixa. São rotas da aplicação de gestão, destinadas a usuários autenticados `ADMIN` e `MANAGER`; não são endpoints para o operador `POS_*` do aplicativo PDV.

## Convenções

- Use a mesma origem da aplicação e mantenha os cookies de sessão Auth.js.
- Envie `Content-Type: application/json` nos `POST`.
- Valores monetários devem ser strings decimais com ponto e até duas casas, por exemplo `"125.50"`. Não envie o símbolo `R$` nem separador de milhar.
- Para `POST` de abertura, retirada e fechamento, envie `x-idempotency-key` com um UUID novo por operação. Repita a mesma chave somente ao tentar novamente a mesma operação.
- As rotas validam a sessão e consultam novamente o usuário e o perfil no banco.

## Endpoints

| Método e rota | Descrição | Idempotência |
| --- | --- | --- |
| `GET /api/register-shifts` | Lista até 100 operações, com caixa, colaborador, retiradas e fechamento | Não se aplica |
| `GET /api/registers/{id}/operations?page=1` | Lista paginada das operações simplificadas de um caixa; ADMIN/MANAGER | Não se aplica |
| `DELETE /api/registers/{id}/operations` | Remove todas as operações simplificadas do caixa; ADMIN/MANAGER | Não exigida |
| `POST /api/register-shifts` | Abre uma operação de caixa | Obrigatória |
| `POST /api/register-shifts/{id}/withdrawals` | Registra uma retirada em operação aberta | Obrigatória |
| `DELETE /api/register-shifts/{id}/withdrawals/{withdrawalId}` | Exclui retirada de operação aberta; somente ADMIN/MANAGER | Não exigida |
| `POST /api/register-shifts/{id}/close` | Fecha a operação e registra o batimento | Obrigatória |
| `DELETE /api/register-shifts/{id}` | Exclui uma operação aberta ou fechada, com fechamento e retiradas; ADMIN/MANAGER | Não exigida |

## Abrir caixa

`POST /api/register-shifts`

Campos: `registerId` obrigatório; `employeeId` opcional ou nulo; `openingFloat` obrigatório e não negativo.

Exemplo de corpo:

```json
{
  "registerId": "UUID_DO_CAIXA",
  "employeeId": "UUID_DO_COLABORADOR",
  "openingFloat": "150.00"
}
```

Regras: caixa deve estar ativo; colaborador, se informado, deve estar ativo; não pode haver outra operação simplificada nem sessão antiga aberta no mesmo caixa.

## Registrar retirada

`POST /api/register-shifts/{id}/withdrawals`

```json
{
  "amount": "200.00",
  "observation": "Retirada para depósito"
}
```

`amount` precisa ser maior que zero e `observation` deve ter entre 2 e 500 caracteres. O valor pode ser maior do que o dinheiro disponível.

## Excluir retirada

`DELETE /api/register-shifts/{id}/withdrawals/{withdrawalId}` não recebe corpo. A retirada precisa pertencer à operação indicada, e essa operação deve continuar aberta. A API grava `WITHDRAWAL_DELETE` na auditoria com os dados anteriores à exclusão.

## Consultar e limpar operações por caixa

`GET /api/registers/{id}/operations?page=1` retorna 10 operações simplificadas por página, incluindo status, abertura, responsável, retiradas e dados de fechamento. A resposta também informa `legacySessionCount` para indicar sessões do fluxo financeiro anterior.

`DELETE /api/registers/{id}/operations` não recebe corpo. ADMIN e MANAGER podem remover todas as operações simplificadas abertas e fechadas daquele caixa. A API registra snapshots individuais e um registro de limpeza na auditoria antes de remover os fechamentos, retiradas e operações. Sessões antigas do modelo financeiro (`CashSession`) são preservadas e não entram nesta limpeza.

## Remover uma operação

`DELETE /api/register-shifts/{id}` não recebe corpo. ADMIN e MANAGER podem remover uma operação aberta ou fechada. O fechamento e as retiradas vinculadas também são removidos; a API registra os dados anteriores na auditoria.

## Fechar caixa

`POST /api/register-shifts/{id}/close`

Novo formato do corpo:

```json
{
  "cashSales": "500.00",
  "machineSales": "1200.00",
  "countedCash": "700.00",
  "justification": "Diferença explicada, se houver"
}
```

`machineSales` consolida o total que anteriormente era enviado nos campos separados de débito, crédito e Pix. O valor contado e a justificativa são validados no servidor.

Para compatibilidade com clientes antigos, também é aceito o formato com `debitSales`, `creditSales` e `pixSales` no lugar de `machineSales`. Nesse formato, envie os três campos. Não misture o campo agregado com os três detalhados na mesma chamada.

Dinheiro esperado é calculado como troco inicial + `cashSales` − soma das retiradas. `machineSales` não compõe o dinheiro físico esperado. Diferença diferente de zero exige `justification`.

## Respostas e erros comuns

| HTTP | Significado comum |
| --- | --- |
| `200` | Consulta ou exclusão concluída |
| `201` | Abertura, retirada ou fechamento registrado; tentativas idempotentes aceitas também retornam esse status |
| `400` | Payload inválido, valor incorreto ou justificativa ausente |
| `401` | Sessão ausente, usuário inativo ou inválido |
| `403` | Perfil sem permissão de gestão |
| `404` | Caixa, operação ou retirada não encontrada |
| `409` | Operação já encerrada, caixa incompatível ou chave de idempotência reutilizada com outro conteúdo |

Erros retornam um objeto com a propriedade `error`; erros de validação também podem incluir `details`.