# LF-57: Mensagem de Fechamento Editável

## Problem

When a buyer's accepted price >= our calculated price, the bot sends a hardcoded `"Vamos!"` to the group. Users want to customize this closing message to match their personal style and avoid looking like a bot.

## Solution

Extend the existing message template system (built in LF-52) with a new `closing` type. Reuse the same infrastructure: DB table, CRUD endpoints, random selection, placeholder substitution, and markdown formatting.

## Changes

### Type Extension

Add `'closing'` to `MessageTemplateType`:
```typescript
export type MessageTemplateType = 'counter_offer' | 'cta' | 'closing';
```

No DB migration needed — `type` is a text column.

### Purchase Handler

Replace the hardcoded `'Vamos!'` (line 315) with template-based message building:

1. Fetch active `closing` templates for the user
2. If templates exist: pick random, apply placeholders via `applyTemplatePlaceholders`
3. If no templates: fall back to `'Vamos!'`

Available placeholders: `{PROGRAMA}`, `{QUANTIDADE}`, `{CPF_COUNT}`, `{PRECO}`, `{MENSAGEM_ORIGINAL}`.

### Dashboard UI

Add a "Mensagem de Fechamento" section in the proposal settings tab. Same editor pattern as CTA/counter-offer:
- Textarea with placeholder buttons
- Formatting helper text (`**negrito**`, `__itálico__`, `` `código` ``)
- Live preview with `x-html` and markdown-to-HTML conversion
- Create/edit/delete/activate operations via existing API endpoints

### Formatting

Already supported — `convertToTdlibMarkdown` in the proxy service converts Telegram-client syntax before sending.

### Backward Compatibility

Zero-config: if no `closing` templates are configured, behavior is identical to today (`"Vamos!"`).
