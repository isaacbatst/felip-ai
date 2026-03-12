# Default Templates as Suggestions

## Context

When a user creates custom message templates (counter offer or CTA), the default templates are completely hidden. This makes it impossible to reference or reuse the default templates as a starting point for new custom templates.

## Design

### Scope

Frontend-only changes in `nest_api/public/dashboard.html`. Applies to both Counter Offer and CTA template sections.

### Behavior by state

#### No custom templates

- **"Criar meus próprios templates"** button shown **above** the default templates list
- Default templates displayed as radio buttons for selection (current behavior)
- Clicking the button opens the editor (blank) as today

#### Has custom templates

- "Meus Templates" list with toggle, edit, delete controls (current behavior)
- **No "Voltar aos padrões" button** — custom mode is permanent
- **"+ Adicionar template"** button opens an **inline template chooser** instead of immediately opening a blank editor
- The chooser shows:
  - **"Em branco"** option — opens editor with empty body
  - **Default templates as clickable cards** — each shows the template preview text; clicking opens the editor pre-filled with that template's body
- Clicking "Cancelar" or choosing an option closes the chooser and (if option selected) opens the editor

#### Editor

- No changes to the editor itself
- Only difference: `editingTemplate.body` may come pre-filled from a default template

### Technical changes

All in Alpine.js data/methods within `dashboard.html`:

1. **New state**: `showTemplateChooser: false`, `templateChooserType: null`
2. **"+ Adicionar template" button**: calls `openTemplateChooser(type)` instead of `startNewTemplate(type)`
3. **New method `openTemplateChooser(type)`**: sets `showTemplateChooser = true` and `templateChooserType = type`
4. **New method `startFromDefault(type, defaultTemplate)`**: calls `startNewTemplate(type)`, then sets `editingTemplate.body = defaultTemplate.preview`, then calls `updateTemplatePreview()`, then closes chooser
5. **New method `startBlankTemplate(type)`**: calls `startNewTemplate(type)`, then closes chooser
6. **New inline HTML block**: between custom templates list and editor, conditionally shown when `showTemplateChooser && templateChooserType === '<type>'`
7. **Remove "Voltar aos padrões" button** from both counter_offer and cta sections
8. **Move "Criar meus próprios templates" button** to above the default templates list (both sections)

### UI details for the chooser

- Appears inline where the "+ Adicionar template" button is
- "Em branco" option: dashed border card, same style as current "+ Adicionar" button
- Default template cards: compact, showing preview text, with subtle hover effect
- "Cancelar" link to close without choosing
