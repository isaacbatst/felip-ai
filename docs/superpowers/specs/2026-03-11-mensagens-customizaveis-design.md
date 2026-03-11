# LF-52: Mensagens Customizaveis e Aleatorias

## Problema

Os templates de mensagem privada (counter-offer e CTA) sao pre-definidos e fixos. O usuario so pode escolher entre as opcoes existentes, sem personalizar o texto. Alem disso, o bot sempre envia a mesma mensagem, o que parece robotico.

## Solucao

Permitir que usuarios criem seus proprios templates de mensagem com placeholders, e que o bot rotacione aleatoriamente entre os templates ativos a cada envio.

## Requisitos

- Templates customizaveis com texto livre e placeholders posicionaveis
- Maximo 5 templates por tipo (counter_offer, cta) por usuario
- Rotacao aleatoria entre templates ativos
- Novo placeholder `{MENSAGEM_ORIGINAL}` que insere o texto da mensagem do grupo
- Backward compatible: usuarios sem templates customizados continuam usando o sistema atual (fallback para templates pre-definidos)
- Placeholders suportados: `{PROGRAMA}`, `{QUANTIDADE}`, `{CPF_COUNT}`, `{PRECO}`, `{MENSAGEM_ORIGINAL}`

## Modelo de Dados

Nova tabela `user_message_templates`:

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| `id` | serial PK | Identificador unico |
| `user_id` | text, NOT NULL | Dono do template |
| `type` | text, NOT NULL | `'counter_offer'` ou `'cta'` |
| `body` | text, NOT NULL | Texto com placeholders |
| `is_active` | boolean, default true | Participa da rotacao |
| `created_at` | timestamp | Criacao |
| `updated_at` | timestamp | Ultima edicao |

- Indice em `(user_id, type)`
- Limite de 5 templates por (user_id, type) validado no backend

## API Endpoints

| Metodo | Rota | Descricao |
|--------|------|-----------|
| `GET` | `/dashboard/message-templates?type=counter_offer\|cta` | Lista templates do usuario |
| `POST` | `/dashboard/message-templates` | Cria template `{ type, body }` |
| `PUT` | `/dashboard/message-templates/:id` | Edita template `{ body, isActive }` |
| `DELETE` | `/dashboard/message-templates/:id` | Remove template |

### Validacoes

- `POST` rejeita se ja tem 5 templates do mesmo tipo
- `PUT`/`DELETE` verificam que o template pertence ao usuario autenticado
- `body` nao pode ser vazio, maximo ~1000 caracteres
- Sem validacao de placeholders obrigatorios — usuario pode usar quaisquer placeholders ou nenhum

## Logica de Selecao de Template

1. Busca templates ativos do usuario para o tipo (cta ou counter_offer)
2. Se existem: escolhe aleatoriamente um e aplica os placeholders
3. Se nao existem: fallback para o template pre-definido atual (comportamento de hoje via `messageTemplateId` / `callToActionTemplateId`)

A mensagem original do grupo e passada como contexto para preencher `{MENSAGEM_ORIGINAL}`.

## Frontend — UX

A UI fica dentro das sub-tabs existentes ("Contra-proposta" e "Fechamento") no dashboard.

### Estado inicial (sem templates customizados)

Radio de selecao dos templates pre-definidos continua como hoje. Abaixo, botao "Criar meus proprios templates" abre o modo de edicao.

### Modo customizado (com templates)

Lista de cards com:
- Preview do texto do template (placeholders visiveis)
- Toggle ativo/inativo por template
- Botoes editar/excluir
- Botao "Adicionar template" (desabilitado se ja tem 5)
- Link "Voltar aos templates padrao" que deleta os customizados (com confirmacao)

### Criar/Editar template (inline, sem modal)

- `<textarea>` com o corpo do template
- Abaixo, chips clicaveis dos placeholders disponiveis (`{PROGRAMA}`, `{QUANTIDADE}`, `{CPF_COUNT}`, `{PRECO}`, `{MENSAGEM_ORIGINAL}`) — ao clicar, insere no cursor
- Preview em tempo real abaixo, com valores de exemplo (ex: "SMILES", "50k", "2 CPFs", "R$ 18,50", "Preciso de 100k smiles")
- Botoes salvar / cancelar

### Indicador de rotacao

Texto sutil: "O bot escolhera aleatoriamente entre os X templates ativos" quando ha mais de 1 ativo.

## Impacto no Codigo

### Arquivos modificados

- `schema.ts` — nova tabela `userMessageTemplates`
- Nova migration — criar tabela
- Novo `MessageTemplateRepository` — CRUD + busca ativos
- `telegram-user-purchase.handler.ts` — checar templates customizados antes dos pre-definidos; passar `mensagemOriginal` como contexto
- `counter-offer-templates.ts` — funcao generica de substituicao de placeholders com suporte a `{MENSAGEM_ORIGINAL}`
- Dashboard controller — novos endpoints CRUD
- `dashboard.html` — nova UI dentro das sub-tabs existentes

### O que NAO muda

- Campos `messageTemplateId` e `callToActionTemplateId` — continuam como fallback
- Logica de delay, dedup, blacklist, calculo de preco — intocada
- `sendMessageToUser` do tdlib_worker — intocado (texto puro)

## Abordagem de Fatiamento

Slice vertical: cada fatia entrega valor ponta a ponta (DB + backend + frontend).
