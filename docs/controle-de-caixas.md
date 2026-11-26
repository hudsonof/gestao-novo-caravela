# Controle de caixas e colaboradores

## Acesso

As telas de gestão ficam disponíveis para usuários autenticados com perfil `ADMIN` ou `MANAGER`:

- `/caixas`: cadastro de caixas, abertura, retiradas e fechamento.
- `/equipe`: cadastro de colaboradores.

Os formulários de valores exibem máscara de Real. As regras do servidor continuam válidas mesmo se uma chamada for feita fora da interface.

## Cadastro de caixas

A seção de cadastro fica no final da página de caixas. A lista é paginada com dez registros por página.

- **Novo caixa** abre um modal para informar nome e setor: Bilheteria, Mesas ou Bar.
- **Editar** altera nome e setor apenas enquanto não houver operação ou sessão vinculada.
- **Inativar/Ativar** controla se o caixa pode ser escolhido para uma nova abertura. Inativação preserva o histórico.
- **Excluir** só é permitido quando não existe histórico vinculado.

Caixas inativos não podem receber novas operações. Caixas com operação aberta não podem ser inativados.

## Cadastro de colaboradores

Em `/equipe`, a lista também é paginada com dez registros por página. O botão **Novo colaborador** abre o formulário com nome e função opcional.

Cada registro pode ser editado ou ativado/inativado. A exclusão fica indisponível quando há sessões, operações de caixa, diárias/cachês ou pedidos relacionados; nesses casos, inative o colaborador para preservar o histórico.

Um colaborador não é um usuário de login. O campo de responsável na abertura do caixa é opcional e aceita somente colaboradores ativos.

## Abrir uma operação de caixa

Na seção de abertura, selecione um caixa ativo, escolha opcionalmente o colaborador responsável e informe o troco inicial. O valor inicial deve ser zero ou positivo.

Um caixa só pode ter uma operação aberta por vez. Se houver uma sessão do fluxo antigo ainda aberta, ela deve ser encerrada antes de iniciar o fluxo simplificado; a tela apresenta essa condição.

## Retirada do caixa

Na lista **Caixas abertos**, o botão **Retirada do caixa** abre um modal com valor e observação.

- O valor precisa ser maior que zero.
- A retirada pode ultrapassar o troco disponível; o saldo exibido pode ficar negativo.
- A retirada reduz o dinheiro físico esperado no fechamento.
- ADMIN e MANAGER podem excluir uma retirada enquanto a operação estiver aberta.
- A exclusão é confirmada, registrada na auditoria e recalcula os valores considerados no fechamento.
- Depois do fechamento, a API bloqueia a exclusão da retirada.

## Fechamento e batimento

O botão **Fechamento e batimento** abre o modal com os seguintes campos:

| Campo | Uso |
| --- | --- |
| Vendas em dinheiro | Total recebido em espécie durante a operação |
| Vendas (Máquina) | Total consolidado que substitui os campos anteriores de débito, crédito e Pix |
| Dinheiro contado no caixa | Valor físico contado no fechamento |
| Justificativa | Obrigatória quando o valor contado divergir do valor esperado |

A venda pela máquina não altera o valor físico esperado em dinheiro. O sistema calcula:

```text
Dinheiro esperado = Troco inicial + Vendas em dinheiro − Retiradas
Diferença = Dinheiro contado − Dinheiro esperado
```

Se a diferença for diferente de zero, o fechamento exige justificativa. Ao fechar, a operação muda para `CLOSED` e não aceita novas retiradas.

## Fechamentos recentes e histórico

A tabela de fechamentos recentes mostra vendas em dinheiro, Vendas (Máquina), dinheiro esperado, valor contado, diferença, justificativa e retiradas.

A migration `20261126150000_cash_register_machine_sales` adiciona o total agregado e preenche os fechamentos antigos com a soma de débito, crédito e Pix. Os campos detalhados antigos não são removidos. Novos fechamentos gravam o total agregado; não guardam a divisão individual desses três meios.

## Fluxo recomendado

1. Cadastre ou ative os caixas usados na operação.
2. Mantenha os colaboradores ativos e associe o responsável quando abrir o caixa.
3. Abra o caixa informando o troco inicial contado.
4. Registre cada retirada com observação.
5. No fechamento, informe vendas em dinheiro, total da máquina e dinheiro contado.
6. Justifique toda diferença e confira o fechamento na lista de recentes.