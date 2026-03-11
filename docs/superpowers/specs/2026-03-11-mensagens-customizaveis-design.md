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
| `id` | integer PK (generatedAlwaysAsIdentity) | Identificador unico |
| `user_id` | text, NOT NULL | Dono do template |
| `type` | text, NOT NULL | `'counter_offer'` ou `'cta'` |
| `body` | text, NOT NULL | Texto com placeholders |
| `is_active` | boolean, default true | Participa da rotacao |
| `created_at` | timestamp | Criacao |
| `updated_at` | timestamp | Ultima edicao |

- Indice em `(user_id, type)`
- Limite de 5 templates por (user_id, type) validado no backend
- Ordenacao por `created_at` (mais antigo primeiro)

## API Endpoints

| Metodo | Rota | Descricao |
|--------|------|-----------|
| `GET` | `/dashboard/message-templates?type=counter_offer\|cta` | Lista templates do usuario |
| `POST` | `/dashboard/message-templates` | Cria template `{ type, body }` |
| `PUT` | `/dashboard/message-templates/:id` | Edita template `{ body, isActive }` |
| `DELETE` | `/dashboard/message-templates/:id` | Remove template |
| `DELETE` | `/dashboard/message-templates?type=counter_offer\|cta` | Remove todos os templates do tipo (bulk delete para "Voltar aos templates padrao") |

### Validacoes

- `POST` rejeita se ja tem 5 templates do mesmo tipo
- `POST` valida que `type` e um dos valores aceitos: `'counter_offer'` ou `'cta'`
- `PUT`/`DELETE` (por id) verificam que o template pertence ao usuario autenticado
- `body` nao pode ser vazio, maximo 1000 caracteres
- Sem validacao de placeholders obrigatorios — usuario pode usar quaisquer placeholders ou nenhum

### Respostas da API

- `GET` retorna `{ success: true, data: { templates: [{ id, type, body, isActive, createdAt }] } }`
- `POST` retorna `{ success: true, data: { template: { id, type, body, isActive, createdAt } } }`
- `PUT` retorna `{ success: true, data: { template: { id, type, body, isActive, createdAt } } }`
- `DELETE` (por id) retorna `{ success: true }`
- `DELETE` (bulk) retorna `{ success: true }`

## Logica de Selecao de Template

1. Busca templates **ativos** (`is_active = true`) do usuario para o tipo (cta ou counter_offer)
2. Se existem templates ativos: escolhe aleatoriamente um e aplica os placeholders
3. Se nao existem templates ativos (nenhum template ou todos inativos): fallback para o template pre-definido atual (comportamento de hoje via `messageTemplateId` / `callToActionTemplateId`)

### Placeholder `{MENSAGEM_ORIGINAL}`

- Contem o texto verbatim da mensagem original enviada no grupo (parametro `text` que o handler ja recebe)
- So esta disponivel em templates customizados (os templates pre-definidos nao o utilizam)
- Se o placeholder esta presente mas a mensagem original nao esta disponivel por algum motivo, substitui por string vazia

### Substituicao de Placeholders

- Usar `replaceAll()` (ou regex global) para todas as substituicoes, permitindo que o usuario use o mesmo placeholder multiplas vezes no template
- Refatorar `buildCounterOfferMessage` e `buildCallToActionMessage` em uma funcao generica `applyTemplatePlaceholders(template, values)` que recebe o texto e um mapa de valores

### Sanitizacao

- Templates sao texto puro enviado como mensagem Telegram — sem risco de injecao
- No dashboard, previews renderizados via Alpine.js `x-text` (escape automatico)

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
- Link "Voltar aos templates padrao" que deleta todos os customizados do tipo (com confirmacao), via endpoint bulk delete

### Criar/Editar template (inline, sem modal)

- `<textarea>` com o corpo do template
- Abaixo, chips clicaveis dos placeholders disponiveis com descricoes curtas:
  - `{PROGRAMA}` — programa de milhas (ex: SMILES)
  - `{QUANTIDADE}` — quantidade em milhares (ex: 50k)
  - `{CPF_COUNT}` — numero de CPFs na demanda (ex: 2 CPFs)
  - `{PRECO}` — preco por milheiro (ex: R$ 18,50)
  - `{MENSAGEM_ORIGINAL}` — texto original da mensagem do grupo
- Ao clicar no chip, insere o placeholder na posicao do cursor no textarea
- Preview em tempo real abaixo, com placeholders substituidos por valores de exemplo
- Botoes salvar / cancelar

### Indicador de rotacao

Texto sutil: "O bot escolhera aleatoriamente entre os X templates ativos" quando ha mais de 1 ativo.

## Impacto no Codigo

### Arquivos modificados

- `schema.ts` — nova tabela `userMessageTemplates`
- Nova migration — criar tabela
- Novo `MessageTemplateRepository` — CRUD + busca ativos
- `telegram-user-purchase.handler.ts` — checar templates customizados antes dos pre-definidos; passar `text` (mensagem original) como contexto
- `counter-offer-templates.ts` — refatorar em funcao generica `applyTemplatePlaceholders(template, values)` com `replaceAll()`, usada tanto pelos templates pre-definidos quanto customizados
- Dashboard controller — novos endpoints CRUD (incluindo bulk delete)
- `dashboard.html` — nova UI dentro das sub-tabs existentes

### O que NAO muda

- Campos `messageTemplateId` e `callToActionTemplateId` — continuam como fallback
- Logica de delay, dedup, blacklist, calculo de preco — intocada
- `sendMessageToUser` do tdlib_worker — intocado (texto puro)

## Testes

- Testes unitarios para `MessageTemplateRepository` (CRUD, limite de 5, ownership)
- Testes unitarios para `applyTemplatePlaceholders` (todos os placeholders, replaceAll, placeholder ausente)
- Testes no handler para o fluxo de selecao: com templates ativos, sem templates ativos (fallback), com `{MENSAGEM_ORIGINAL}`
- Testes de integracao nos endpoints da API (validacoes, autorizacao)

## Abordagem de Fatiamento

Slice vertical: cada fatia entrega valor ponta a ponta (DB + backend + frontend).
