# LF-57: Closing Message Templates Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded "Vamos!" group message with user-customizable templates supporting placeholders, random selection, and markdown formatting.

**Architecture:** Extend the existing message template system (LF-52) with a new `closing` type. Reuse the same DB table, CRUD endpoints, repository, and dashboard editor pattern. Add a third sub-tab in the proposal settings UI.

**Tech Stack:** NestJS, Drizzle ORM, Alpine.js, TDLib markdown v1

---

## Chunk 1: Backend — Type Extension + Handler Logic

### Task 1: Extend MessageTemplateType

**Files:**
- Modify: `nest_api/src/infrastructure/persistence/message-template.repository.ts:1`

- [ ] **Step 1: Add 'closing' to MessageTemplateType**

```typescript
export type MessageTemplateType = 'counter_offer' | 'cta' | 'closing';
```

- [ ] **Step 2: Commit**

```bash
git add nest_api/src/infrastructure/persistence/message-template.repository.ts
git commit -m "feat(LF-57): add 'closing' to MessageTemplateType"
```

### Task 2: Write failing test for closing template selection

**Files:**
- Modify: `nest_api/src/infrastructure/telegram/handlers/telegram-user-purchase.handler.spec.ts`

- [ ] **Step 1: Write test — uses custom closing template when available**

Add a new describe block after the existing "Vamos!" tests (around line 630). The test should:
- Mock `messageTemplateRepository.findActiveByUserAndType` to return a closing template with placeholders when called with `'closing'` type
- Trigger a purchase where `acceptedPrice >= lowestPrice`
- Assert `sendMessage` was called with the rendered template (placeholders replaced), NOT `'Vamos!'`

```typescript
it('should use custom closing template when available', async () => {
  mockMessageTemplateRepository.findActiveByUserAndType.mockImplementation(
    async (userId: string, type: string) => {
      if (type === 'closing') {
        return [{ id: 1, userId, type: 'closing', body: 'Fechou! **{PROGRAMA}** {QUANTIDADE}k', isActive: true, createdAt: new Date(), updatedAt: new Date() }];
      }
      return [];
    },
  );

  mockMessageParser.parse.mockResolvedValue(
    createPurchaseProposalArray({
      quantity: 30_000,
      cpfCount: 1,
      airlineId: PROGRAM_IDS.SMILES,
      acceptedPrices: [25],
    }),
  );

  await handler.handlePurchase(
    loggedInUserId, telegramUserId, chatId, messageId,
    'SMILES 30k 1CPF aceito 25',
  );

  const sentMessage = mockTdlibUserClient.sendMessage.mock.calls[0][2];
  expect(sentMessage).toContain('Fechou!');
  expect(sentMessage).toContain('SMILES');
  expect(sentMessage).toContain('30');
  expect(sentMessage).not.toBe('Vamos!');
});
```

- [ ] **Step 2: Write test — falls back to "Vamos!" when no closing templates**

```typescript
it('should fall back to "Vamos!" when no closing templates configured', async () => {
  mockMessageTemplateRepository.findActiveByUserAndType.mockResolvedValue([]);

  mockMessageParser.parse.mockResolvedValue(
    createPurchaseProposalArray({
      quantity: 30_000,
      cpfCount: 1,
      airlineId: PROGRAM_IDS.SMILES,
      acceptedPrices: [25],
    }),
  );

  await handler.handlePurchase(
    loggedInUserId, telegramUserId, chatId, messageId,
    'SMILES 30k 1CPF aceito 25',
  );

  expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledWith(
    telegramUserId,
    chatId,
    'Vamos!',
    messageId,
  );
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter nest_api test -- --testPathPattern=telegram-user-purchase.handler`
Expected: First test FAILS (still sends "Vamos!"), second test PASSES (existing behavior).

### Task 3: Implement closing template selection in handler

**Files:**
- Modify: `nest_api/src/infrastructure/telegram/handlers/telegram-user-purchase.handler.ts:309-315`

- [ ] **Step 1: Replace hardcoded "Vamos!" with template logic**

Replace the block at line 309-315:

```typescript
    // Caso 2: Preço aceito >= calculado (lowest) -> closing message + call to action no privado
    if (maxAcceptedPrice >= lowestPrice) {
      this.logger.log('User max accepted price is higher than calculated price', {
        maxAcceptedPrice,
        lowestPrice,
      });

      const closingMessage = await this.buildClosingMessage(
        loggedInUserId,
        programaForMessage,
        purchaseRequest.quantity,
        effectiveCpfCount,
        this.formatPrivatePrice(calculatedPrices),
        trimmedText,
      );
      await this.tdlibUserClient.sendMessage(telegramUserId, chatId, closingMessage, messageId);
```

- [ ] **Step 2: Add buildClosingMessage method**

Add after `buildPrivateMessage` (around line 538):

```typescript
  /**
   * Builds the closing message for group (when accepted price >= calculated).
   * Uses custom templates if available, falls back to "Vamos!".
   */
  private async buildClosingMessage(
    userId: string,
    programa: string,
    quantidade: number,
    cpfCount: number,
    preco: number | string,
    mensagemOriginal: string,
  ): Promise<string> {
    const customTemplates = await this.messageTemplateRepository.findActiveByUserAndType(userId, 'closing');

    if (customTemplates.length > 0) {
      const selected = customTemplates[Math.floor(Math.random() * customTemplates.length)];
      return applyTemplatePlaceholders(selected.body, {
        programa,
        quantidade,
        cpfCount,
        preco,
        mensagemOriginal,
      });
    }

    return 'Vamos!';
  }
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `pnpm --filter nest_api test -- --testPathPattern=telegram-user-purchase.handler`
Expected: ALL tests PASS (including new ones + existing "Vamos!" tests that mock empty templates).

- [ ] **Step 4: Commit**

```bash
git add nest_api/src/infrastructure/telegram/handlers/telegram-user-purchase.handler.ts \
       nest_api/src/infrastructure/telegram/handlers/telegram-user-purchase.handler.spec.ts
git commit -m "feat(LF-57): replace hardcoded Vamos with closing template selection"
```

### Task 4: Add pre-defined closing templates

**Files:**
- Modify: `nest_api/src/domain/constants/counter-offer-templates.ts`

- [ ] **Step 1: Add CLOSING_TEMPLATES array and builder function**

Add after the `CALL_TO_ACTION_TEMPLATES` section:

```typescript
export const CLOSING_TEMPLATES: Array<{
  id: number;
  description: string;
  preview: string;
}> = [
  {
    id: 1,
    description: 'Simples',
    preview: 'Vamos!',
  },
  {
    id: 2,
    description: 'Com programa',
    preview: '**Fechou!** {PROGRAMA} a {PRECO}',
  },
  {
    id: 3,
    description: 'Informal',
    preview: 'Bora! Te chamei no privado',
  },
  {
    id: 4,
    description: 'Detalhado',
    preview: 'Fechou! {QUANTIDADE}k {PROGRAMA} a {PRECO}, chamei no PV!',
  },
];
```

- [ ] **Step 2: Commit**

```bash
git add nest_api/src/domain/constants/counter-offer-templates.ts
git commit -m "feat(LF-57): add pre-defined closing template suggestions"
```

### Task 5: Add controller endpoint for closing templates

**Files:**
- Modify: `nest_api/src/infrastructure/http/dashboard.controller.ts`

- [ ] **Step 1: Add GET /dashboard/closing/templates endpoint**

Add after the call-to-action templates endpoint (around line 667):

```typescript
  @Get('closing/templates')
  @UseGuards(SessionGuard)
  async getClosingTemplates(@Res() res: Response) {
    const { CLOSING_TEMPLATES } = await import(
      '../../domain/constants/counter-offer-templates'
    );
    return res.json({
      templates: CLOSING_TEMPLATES.map((t) => ({
        id: t.id,
        description: t.description,
        preview: t.preview,
      })),
    });
  }
```

- [ ] **Step 2: Commit**

```bash
git add nest_api/src/infrastructure/http/dashboard.controller.ts
git commit -m "feat(LF-57): add closing templates API endpoint"
```

## Chunk 2: Frontend — Dashboard UI

### Task 6: Add closing template UI to dashboard

**Files:**
- Modify: `nest_api/public/dashboard.html`

This task adds a third sub-tab "Aceitação" for closing message templates. The implementation follows the exact same pattern as the existing "Contra-Oferta" and "Fechamento" (CTA) tabs.

- [ ] **Step 1: Add Alpine.js data properties**

Add alongside existing template data (around line 1774):

```javascript
closingTemplates: [],
customClosingTemplates: [],
```

- [ ] **Step 2: Add third sub-tab button**

In the sub-tab container (around line 365-379), add a third tab button for "Aceitação" with `proposalSubTab === 'closing'`.

- [ ] **Step 3: Add closing section content**

After the callToAction section wrapper (after line ~880), add a new section `x-show="proposalSubTab === 'closing'"` that replicates the same pattern as the counter-offer section:
- Pre-defined templates view (when no custom templates): template chooser + editor
- Custom templates view (when has custom templates): template list with edit/delete/activate + add button + editor
- Same placeholder buttons: {PROGRAMA}, {QUANTIDADE}, {CPF_COUNT}, {PRECO}, {MENSAGEM_ORIGINAL}
- Same formatting helper text and preview
- Use `x-ref="closingTemplateTextarea"` for the textarea refs

- [ ] **Step 4: Add data fetching for closing templates**

In the `loadCounterOfferSettings()` method or equivalent init, add:
```javascript
fetch('/dashboard/closing/templates').then(r => r.json()).then(data => {
  this.closingTemplates = data.templates;
});
this.fetchCustomTemplates('closing');
```

- [ ] **Step 5: Update getCustomTemplates and getActiveTemplateCount**

Add closing case to `getCustomTemplates()`:
```javascript
if (type === 'closing') return this.customClosingTemplates;
```

Same for `getActiveTemplateCount()`.

- [ ] **Step 6: Update fetchCustomTemplates to handle closing**

Add closing case:
```javascript
if (type === 'closing') this.customClosingTemplates = data.templates;
```

- [ ] **Step 7: Update insertPlaceholder to find closing textarea**

Update the ref lookup:
```javascript
const textarea = this.$refs.templateTextarea || this.$refs.ctaTemplateTextarea || this.$refs.closingTemplateTextarea;
```

- [ ] **Step 8: Test manually in browser**

Verify:
- Third tab "Aceitação" appears and switches correctly
- Pre-defined templates load as suggestions
- Can create blank template and from suggestion
- Template editor shows placeholders, formatting help, preview
- Can save, edit, delete, toggle active
- Multiple templates show random selection notice

- [ ] **Step 9: Commit**

```bash
git add nest_api/public/dashboard.html
git commit -m "feat(LF-57): add closing template editor to dashboard UI"
```

### Task 7: Verify end-to-end

- [ ] **Step 1: Run full test suite**

Run: `pnpm --filter nest_api test`
Expected: ALL tests pass.

- [ ] **Step 2: Build**

Run: `pnpm build`
Expected: Clean build, 0 errors.

- [ ] **Step 3: Final commit if any fixes needed**
