# Documentação do Novo Caravela

Esta pasta reúne a documentação de produto, operação e desenvolvimento. Para entender o comportamento que está sendo implementado agora, comece pelos guias de controle de caixas e colaboradores; a especificação funcional original descreve um escopo mais amplo e também serve como backlog.

## Guias atuais

- [Visão geral técnica](visao-geral-tecnica.md): tecnologias, autenticação, permissões e organização.
- [Controle de caixas e colaboradores](controle-de-caixas.md): uso das telas, regras operacionais e cálculos.
- [API de controle de caixas](api-controle-de-caixas.md): endpoints, payloads, autenticação e respostas de erro.
- [Instalação e implantação](instalacao-e-deploy.md): variáveis de ambiente, banco de dados, migrations e comandos.

## Documentos de referência existentes

- [Especificação funcional e técnica](ESPECIFICACAO_GESTAO_NOVO_CARAVELA.md): requisitos iniciais de escopo amplo, modelo proposto e backlog. Nem todos os módulos descritos estão na navegação atual.
- [API e gestão do PDV](pos-api.md): autenticação, perfis e rotas previstas para o aplicativo PDV separado.

## Escopo da interface atual

A navegação principal está simplificada para **Controle de caixas** (`/caixas`) e **Colaboradores** (`/equipe`), destinada a usuários `ADMIN` e `MANAGER`. Outras telas e requisitos que aparecem na especificação ampla devem ser tratados como legado ou backlog até serem revalidados.

Os guias desta pasta descrevem o fluxo simplificado de operação e a alteração de fechamento com o campo agregado **Vendas (Máquina)**.