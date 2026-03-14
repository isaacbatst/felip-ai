# LLM Token Optimization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Avoid unnecessary LLM calls by short-circuiting with cheap local checks (provider config, quantity pre-filter) before calling the AI.

**Architecture:** Split `MessageParser.parse()` into `extractData()` + `detectTrap()`. Handler calls `ProviderExtractionUtil` directly and adds pre-LLM validation gates. New `QuantityPreFilterUtil` estimates quantity from raw text via conservative regex.

**Tech Stack:** NestJS, TypeScript, Jest, OpenAI API

**Spec:** `docs/superpowers/specs/2026-03-13-llm-token-optimization-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `nest_api/src/domain/utils/quantity-pre-filter.util.ts` | Conservative regex quantity estimator |
| Create | `nest_api/src/domain/utils/quantity-pre-filter.util.spec.ts` | Tests for pre-filter |
| Modify | `nest_api/src/domain/interfaces/message-parser.interface.ts` | Replace `parse()` with `extractData()` + `detectTrap()` |
| Modify | `nest_api/src/infrastructure/openai/message-parser.service.ts` | Implement new interface (expose private methods, remove `parse`) |
| Modify | `nest_api/src/infrastructure/telegram/handlers/telegram-user-purchase.handler.ts` | New orchestration flow with pre-LLM short-circuits |
| Modify | `nest_api/src/infrastructure/telegram/handlers/telegram-user-purchase.handler.spec.ts` | Adapt mocks + add short-circuit tests |

---

## Chunk 1: QuantityPreFilterUtil (TDD)

### Task 1: Write failing tests for QuantityPreFilterUtil

**Files:**
- Create: `nest_api/src/domain/utils/quantity-pre-filter.util.spec.ts`

- [ ] **Step 1: Create test file with all cases**

```typescript
import { QuantityPreFilterUtil } from './quantity-pre-filter.util';

describe('QuantityPreFilterUtil', () => {
  describe('k suffix (integer base)', () => {
    it.each([
      ['smiles 242k 1cpf', 242000],
      ['latam 50k 2cpf', 50000],
      ['azul 100k 1cpf', 100000],
      ['smiles 80k 1cpf 20', 80000],
      ['SMILES 50K 1CPF', 50000],
    ])('estimate("%s") -> %d', (input, expected) => {
      expect(QuantityPreFilterUtil.estimate(input)).toBe(expected);
    });
  });

  describe('kk suffix (millions)', () => {
    it.each([
      ['smiles 1kk 1cpf', 1000000],
      ['latam 2kk', 2000000],
      ['smiles 30kk', 30000000],
    ])('estimate("%s") -> %d', (input, expected) => {
      expect(QuantityPreFilterUtil.estimate(input)).toBe(expected);
    });
  });

  describe('m suffix (millions)', () => {
    it.each([
      ['smiles 2m 1cpf', 2000000],
      ['latam 1M', 1000000],
      ['azul 5m', 5000000],
    ])('estimate("%s") -> %d', (input, expected) => {
      expect(QuantityPreFilterUtil.estimate(input)).toBe(expected);
    });
  });

  describe('mil suffix', () => {
    it.each([
      ['smiles 50mil 1cpf', 50000],
      ['latam 100mil 2cpf', 100000],
    ])('estimate("%s") -> %d', (input, expected) => {
      expect(QuantityPreFilterUtil.estimate(input)).toBe(expected);
    });
  });

  describe('dot-thousands (\\d+.000)', () => {
    it.each([
      ['smiles 50.000 1cpf', 50000],
      ['latam 100.000 2cpf', 100000],
      ['azul 30.000 1cpf', 30000],
    ])('estimate("%s") -> %d', (input, expected) => {
      expect(QuantityPreFilterUtil.estimate(input)).toBe(expected);
    });
  });

  describe('comma-thousands (\\d+,000)', () => {
    it.each([
      ['smiles 50,000 1cpf', 50000],
      ['latam 100,000 2cpf', 100000],
    ])('estimate("%s") -> %d', (input, expected) => {
      expect(QuantityPreFilterUtil.estimate(input)).toBe(expected);
    });
  });

  describe('conservative: returns null for ambiguous patterns', () => {
    it.each([
      ['smiles 84000 1cpf'],      // no suffix
      ['latam 21,5k 1cpf'],       // decimal base with k
      ['smiles 302,900k'],         // comma thousands with k
      ['random text no numbers'],  // no numbers
      ['smiles 15 1cpf'],          // small number, no suffix
      ['32.765k 1cpf'],            // decimal base with dot + k
    ])('estimate("%s") -> null', (input) => {
      expect(QuantityPreFilterUtil.estimate(input)).toBeNull();
    });
  });

  describe('word boundary: mil not followed by word chars', () => {
    it.each([
      ['smiles 50milhas'],    // "milhas" != "mil"
      ['50milhoes'],          // "milhoes" != "mil"
    ])('estimate("%s") -> null (mil not isolated)', (input) => {
      expect(QuantityPreFilterUtil.estimate(input)).toBeNull();
    });
  });

  describe('m suffix: not followed by word chars', () => {
    it.each([
      ['smiles min 50k'],  // "min" starts with m but is not a suffix
    ])('estimate("%s") -> 50000 (m in "min" is not a suffix)', (input) => {
      expect(QuantityPreFilterUtil.estimate(input)).toBe(50000);
    });
  });

  describe('multiple candidates: returns largest', () => {
    it('returns largest when multiple patterns match', () => {
      expect(QuantityPreFilterUtil.estimate('smiles 50k e 30k')).toBe(50000);
    });

    it('returns largest across different suffixes', () => {
      expect(QuantityPreFilterUtil.estimate('smiles 1kk e 50k')).toBe(1000000);
    });
  });

  describe('edge cases', () => {
    it('handles whitespace between number and suffix', () => {
      expect(QuantityPreFilterUtil.estimate('smiles 50 k 1cpf')).toBe(50000);
    });

    it('returns null for empty string', () => {
      expect(QuantityPreFilterUtil.estimate('')).toBeNull();
    });

    it('returns null when estimated value < 1000', () => {
      // 0k → 0, filtered out
      expect(QuantityPreFilterUtil.estimate('smiles 0k')).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter nest_api test -- --testPathPattern="quantity-pre-filter" --no-coverage`
Expected: FAIL — module not found

### Task 2: Implement QuantityPreFilterUtil

**Files:**
- Create: `nest_api/src/domain/utils/quantity-pre-filter.util.ts`

- [ ] **Step 3: Write implementation**

```typescript
/**
 * Conservative regex-based quantity estimator.
 * Extracts approximate quantity from raw message text (NOT normalized text).
 * Returns null when uncertain — caller should proceed to LLM.
 */
export class QuantityPreFilterUtil {
  static estimate(text: string): number | null {
    const lower = text.toLowerCase();

    // Order matters: check kk before k, mil before m
    const patterns: { regex: RegExp; multiplier: number }[] = [
      { regex: /(?<![.,\d])(\d+)\s*kk/g, multiplier: 1_000_000 },
      { regex: /(?<![.,\d])(\d+)\s*mil\b/g, multiplier: 1_000 },
      { regex: /(?<![.,\d])(\d+)\s*m(?!\w)/g, multiplier: 1_000_000 },
      { regex: /(?<![.,\d])(\d+)[.,]000(?!\d)/g, multiplier: 1_000 },
      { regex: /(?<![.,\d])(\d+)\s*k(?!k)/g, multiplier: 1_000 },
    ];

    let largest: number | null = null;

    for (const { regex, multiplier } of patterns) {
      let match;
      while ((match = regex.exec(lower)) !== null) {
        const base = parseInt(match[1], 10);
        const value = base * multiplier;
        if (value >= 1000 && (largest === null || value > largest)) {
          largest = value;
        }
      }
    }

    return largest;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter nest_api test -- --testPathPattern="quantity-pre-filter" --no-coverage`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add nest_api/src/domain/utils/quantity-pre-filter.util.ts nest_api/src/domain/utils/quantity-pre-filter.util.spec.ts
git commit -m "feat: add QuantityPreFilterUtil with conservative regex estimation"
```

---

## Chunk 2: MessageParser Interface + Service

### Task 3: Update MessageParser interface

**Files:**
- Modify: `nest_api/src/domain/interfaces/message-parser.interface.ts`

- [ ] **Step 6: Replace parse() with extractData() and detectTrap()**

```typescript
import { Injectable } from '@nestjs/common';
import type { RawDataExtractionOutput } from '../types/purchase.types';

export interface ProgramOption {
  id: number;
  name: string;
}

@Injectable()
export abstract class MessageParser {
  abstract extractData(
    text: string,
    reasoningEffort?: 'minimal' | 'high',
  ): Promise<RawDataExtractionOutput | null>;

  abstract detectTrap(text: string): Promise<boolean>;
}
```

Note: `RawDataExtractionOutput` is already exported from `purchase.types.ts`. `PurchaseProposal` import is removed (handler imports directly where needed).

### Task 4: Update MessageParserService

**Files:**
- Modify: `nest_api/src/infrastructure/openai/message-parser.service.ts`

- [ ] **Step 7: Refactor service to implement new interface**

Key changes:
1. Remove `parse()` method entirely
2. Rename `extractDataWithAI` to `extractData` and make it public (matches abstract method)
3. Move the try/catch from `parse()` into `extractData` — wrap the body in try/catch returning `null` on error (preserves current fail-safe behavior; without this, an OpenAI API failure would crash the handler)
4. Make `detectTrap` public (matches abstract method — it already has its own try/catch)
5. Remove `ProviderExtractionUtil`, `QuantityNormalizationUtil`, `PriceNormalizationUtil` imports (no longer used here)
6. Remove `PurchaseProposal` type import
7. Keep `RawDataExtractionOutput` import (now used as return type of public method)

The `extractData` method body stays identical to the current `extractDataWithAI` **plus** the try/catch from `parse()`. The `detectTrap` method body stays identical. Only visibility and the wrapping `parse()` are removed.

- [ ] **Step 8: Verify build compiles**

Run: `pnpm --filter nest_api build`
Expected: Compilation errors in handler + handler tests (they still reference `parse()`) — this is expected, we fix in Chunk 3.

- [ ] **Step 9: Commit**

```bash
git add nest_api/src/domain/interfaces/message-parser.interface.ts nest_api/src/infrastructure/openai/message-parser.service.ts
git commit -m "refactor: split MessageParser.parse() into extractData() and detectTrap()"
```

---

## Chunk 3: Handler Refactor + Test Updates

### Task 5: Refactor handler to new flow

**Files:**
- Modify: `nest_api/src/infrastructure/telegram/handlers/telegram-user-purchase.handler.ts`

- [ ] **Step 10: Add new imports**

Add to handler imports:
```typescript
import { ProviderExtractionUtil } from '../../../domain/utils/provider-extraction.util';
import { QuantityNormalizationUtil } from '../../../domain/utils/quantity-normalization.util';
import { PriceNormalizationUtil } from '../../../domain/utils/price-normalization.util';
import { QuantityPreFilterUtil } from '../../../domain/utils/quantity-pre-filter.util';
import type { PurchaseProposal } from '../../../domain/types/purchase.types';
```

Remove the `type ProgramOption` import from `message-parser.interface` (if no longer needed — check usage). Actually keep it: it's used for `programsForParser` variable.

- [ ] **Step 11: Rewrite handlePurchase method**

Replace the section from "Busca todos os programas" through "Ignorar se não houver propostas" with the new flow. The code after `const purchaseRequest = purchaseRequests[0]` stays unchanged.

New flow inside `handlePurchase` (replaces lines ~129–153):

```typescript
// Fetch all programs from DB
const allPrograms = await this.milesProgramRepository.getAllPrograms();
const programsForParser: ProgramOption[] = allPrograms.map((p) => ({ id: p.id, name: p.name }));

// Step 3: Extract provider (no LLM)
const airlineId = ProviderExtractionUtil.extractProvider(text, programsForParser);
if (airlineId === null) {
  this.logger.log('No provider found in message');
  return;
}

let program = allPrograms.find((p) => p.id === airlineId);
if (!program) {
  this.logger.warn('Program not found for airlineId', { airlineId });
  return;
}

this.logger.log('Provider found via keyword matching', { airlineId, programName: program.name });

// Step 5: Check if user has config for this program (or its liminar)
const configuredProgramIds = await this.priceTableProvider.getConfiguredProgramIds(loggedInUserId);
const liminarProgram = await this.milesProgramRepository.findLiminarFor(program.id);

const hasNormalConfig = configuredProgramIds.includes(program.id);
const hasLiminarConfig = liminarProgram ? configuredProgramIds.includes(liminarProgram.id) : false;

if (!hasNormalConfig && !hasLiminarConfig) {
  this.logger.log('Provider found but user has no config', {
    airlineId,
    programName: program.name,
  });
  return;
}

// Step 6: Pre-filter quantity check (conservative — null means proceed to LLM)
const estimatedQuantity = QuantityPreFilterUtil.estimate(text);
if (estimatedQuantity !== null) {
  const normalHasMiles = hasNormalConfig
    && await this.priceTableProvider.hasSufficientMiles(loggedInUserId, program.id, estimatedQuantity);
  const liminarHasMiles = hasLiminarConfig && liminarProgram
    && await this.priceTableProvider.hasSufficientMiles(loggedInUserId, liminarProgram.id, estimatedQuantity);

  if (!normalHasMiles && !liminarHasMiles) {
    this.logger.log('Pre-filter: insufficient miles for estimated quantity', {
      estimatedQuantity,
      programName: program.name,
    });
    return;
  }
}

// Step 7: LLM extraction
const reasoningSetting = await this.groupReasoningSettingsRepository.getGroupReasoningSetting(
  loggedInUserId,
  chatId,
);
const reasoningEffort = reasoningSetting?.reasoningMode === 'precise' ? 'high' as const : 'minimal' as const;

const data = await this.messageParser.extractData(text, reasoningEffort);
if (!data) {
  this.logger.warn('No validated request');
  return;
}

// Step 8: Trap detection (precise mode only)
if (reasoningEffort === 'high') {
  const isTrap = await this.messageParser.detectTrap(text);
  if (isTrap) {
    this.logger.warn('AI trap detection flagged message as trap', { text });
    return;
  }
}

// Step 9: Normalize proposals
const purchaseRequests: PurchaseProposal[] = [];
for (const proposal of data.proposals) {
  const quantity = QuantityNormalizationUtil.parse(proposal.rawQuantity);
  if (quantity === null) {
    this.logger.warn('Skipping proposal: quantity invalid or below 1000', {
      rawQuantity: proposal.rawQuantity,
    });
    continue;
  }

  const acceptedPrices = proposal.rawPrices
    .map((r) => PriceNormalizationUtil.parse(r))
    .filter((p): p is number => p !== null);

  purchaseRequests.push({
    isPurchaseProposal: true as const,
    quantity,
    cpfCount: proposal.cpfCount,
    airlineId,
    acceptedPrices,
  });
}

// Ignorar se não houver propostas ou se houver mais de uma
if (!purchaseRequests || purchaseRequests.length !== 1) {
  if (purchaseRequests && purchaseRequests.length > 1) {
    this.logger.warn('Multiple proposals found, ignoring', { count: purchaseRequests.length });
  } else {
    this.logger.warn('No validated request');
  }
  return;
}

const purchaseRequest = purchaseRequests[0];
// ... everything from here stays UNCHANGED ...
```

The key: everything after `const purchaseRequest = purchaseRequests[0]` (line ~153 in current code) remains exactly the same. The `getEffectivePrograms`, price calculation, counter offer logic, etc. are untouched.

**Important:** The `configuredProgramIds` fetch moved earlier (pre-LLM, step 5). Delete the duplicate fetch at the old location (current line 212: `const configuredProgramIds = await this.priceTableProvider.getConfiguredProgramIds(loggedInUserId);`). The `configuredProgramIds` variable from step 5 is reused when calling `getEffectivePrograms` later.

### Task 6: Update handler tests

**Files:**
- Modify: `nest_api/src/infrastructure/telegram/handlers/telegram-user-purchase.handler.spec.ts`

- [ ] **Step 12: Update mock setup and helper**

Replace the mock and helper in `beforeEach`:

```typescript
// OLD:
mockMessageParser = {
  parse: jest.fn(),
} as unknown as jest.Mocked<MessageParser>;

// NEW:
mockMessageParser = {
  extractData: jest.fn().mockResolvedValue(null),
  detectTrap: jest.fn().mockResolvedValue(false),
} as unknown as jest.Mocked<MessageParser>;
```

Replace `createPurchaseProposalArray` helper with:

```typescript
import type { RawDataExtractionOutput } from '@/domain/types/purchase.types';

const createRawExtractionOutput = (overrides?: Partial<{
  rawQuantity: string;
  cpfCount: number;
  rawPrices: string[];
}>): RawDataExtractionOutput => ({
  isPurchaseProposal: true as const,
  proposals: [{
    rawQuantity: '30k',
    cpfCount: 1,
    rawPrices: [],
    ...overrides,
  }],
});
```

- [ ] **Step 13: Mechanical test case update**

For every test that uses `mockMessageParser.parse.mockResolvedValue(...)`, apply this transformation:

**Pattern A — Standard single proposal:**
```typescript
// OLD:
mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
  quantity: 30_000, cpfCount: 1, airlineId: PROGRAM_IDS.SMILES,
}));

// NEW:
mockMessageParser.extractData.mockResolvedValue(createRawExtractionOutput({
  rawQuantity: '30k', cpfCount: 1,
}));
// airlineId comes from text automatically via ProviderExtractionUtil
```

**Quantity mapping** (for the `rawQuantity` field):
- `quantity: 15_000` → `rawQuantity: '15k'`
- `quantity: 30_000` → `rawQuantity: '30k'`
- `quantity: 50_000` → `rawQuantity: '50k'`
- `quantity: 60_000` → `rawQuantity: '60k'`
- `quantity: 0` → `rawQuantity: '0'`

**Price mapping** (for the `rawPrices` field):
- `acceptedPrices: []` → `rawPrices: []` (or omit, default is `[]`)
- `acceptedPrices: [20]` → `rawPrices: ['20']`
- `acceptedPrices: [25]` → `rawPrices: ['25']`
- `acceptedPrices: [15]` → `rawPrices: ['15']`
- `acceptedPrices: [8]` → `rawPrices: ['8']`
- `acceptedPrices: [30]` → `rawPrices: ['30']`
- `acceptedPrices: [18, 20]` → `rawPrices: ['18', '20']`

**Pattern B — Null / empty (not a purchase proposal):**
```typescript
// OLD:
mockMessageParser.parse.mockResolvedValue(null);
// or:
mockMessageParser.parse.mockResolvedValue([]);

// NEW:
mockMessageParser.extractData.mockResolvedValue(null);
```

**Pattern C — Multiple proposals:**
```typescript
// OLD:
mockMessageParser.parse.mockResolvedValue([
  { isPurchaseProposal: true, quantity: 30_000, cpfCount: 1, airlineId: 1, acceptedPrices: [] },
  { isPurchaseProposal: true, quantity: 50_000, cpfCount: 2, airlineId: 3, acceptedPrices: [] },
]);

// NEW:
mockMessageParser.extractData.mockResolvedValue({
  isPurchaseProposal: true as const,
  proposals: [
    { rawQuantity: '30k', cpfCount: 1, rawPrices: [] },
    { rawQuantity: '50k', cpfCount: 2, rawPrices: [] },
  ],
});
```

**Pattern D — Tests that check `parse` was called with args:**
```typescript
// OLD:
expect(mockMessageParser.parse).toHaveBeenCalledWith(text, programs, 'minimal');

// NEW:
expect(mockMessageParser.extractData).toHaveBeenCalledWith(text, 'minimal');
```

**Special: "Provider not found" test (line ~955):**
The test already uses text `'UNKNOWN_AIRLINE 30k 1CPF'` which won't match any program. After refactor, `ProviderExtractionUtil.extractProvider()` returns null → handler returns early. The `extractData` mock is never called. Remove the `mockMessageParser.parse` mock line (it's irrelevant now). Optionally add: `expect(mockMessageParser.extractData).not.toHaveBeenCalled()`.

**Special: "parser returns null" test (line ~971):**
Change text to `'SMILES 30k 1CPF text'` (has provider + numbers + sufficient length so it reaches the LLM). Mock `extractData` to return `null`. Assert `extractData` was called and `sendMessage` was not. The old text `'random text'` never reached `parse()` in the old code either (no numbers → validation 4 catches it).

**Special: "parser returns empty array" test (line ~979):**
Repurpose this test. In the new flow, `extractData` returns `RawDataExtractionOutput | null` — there's no empty-array case. Instead, test when `extractData` returns valid data but all proposals fail quantity normalization:
```typescript
it('should not send message when all proposals have invalid quantity', async () => {
  mockMessageParser.extractData.mockResolvedValue(createRawExtractionOutput({
    rawQuantity: '0', cpfCount: 1,
  }));
  await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF text');
  expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
});
```

- [ ] **Step 14: Run all handler tests**

Run: `pnpm --filter nest_api test -- --testPathPattern="telegram-user-purchase.handler" --no-coverage`
Expected: All PASS

### Task 7: Add new short-circuit tests

**Files:**
- Modify: `nest_api/src/infrastructure/telegram/handlers/telegram-user-purchase.handler.spec.ts`

- [ ] **Step 15: Add pre-LLM short-circuit tests**

Add new describe blocks:

```typescript
describe('Pre-LLM short-circuits', () => {
  describe('Provider config check', () => {
    it('should not call LLM when provider found but user has no config for it', async () => {
      // Remove SMILES (1) and SMILES LIMINAR (2) from configured programs
      configuredProgramIds = [3, 4, 5, 6, 18];

      await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF');

      expect(mockMessageParser.extractData).not.toHaveBeenCalled();
      expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
    });

    it('should proceed to LLM when normal is not configured but liminar is', async () => {
      // Remove SMILES (1) but keep SMILES LIMINAR (2)
      configuredProgramIds = [2, 3, 4, 5, 6, 18];

      mockMessageParser.extractData.mockResolvedValue(createRawExtractionOutput({
        rawQuantity: '30k', cpfCount: 1,
      }));

      await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF');

      expect(mockMessageParser.extractData).toHaveBeenCalled();
    });
  });

  describe('Quantity pre-filter', () => {
    it('should not call LLM when estimated quantity exceeds available miles for all variants', async () => {
      // SMILES has 50k miles, SMILES LIMINAR has 30k — request 80k
      await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 80k 1CPF');

      expect(mockMessageParser.extractData).not.toHaveBeenCalled();
      expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
    });

    it('should proceed to LLM when quantity cannot be estimated (conservative)', async () => {
      // "84000" has no suffix — pre-filter returns null — proceed to LLM
      mockMessageParser.extractData.mockResolvedValue(createRawExtractionOutput({
        rawQuantity: '84000', cpfCount: 1,
      }));

      await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 84000 1CPF');

      expect(mockMessageParser.extractData).toHaveBeenCalled();
    });

    it('should proceed to LLM when estimated quantity has sufficient miles for at least one variant', async () => {
      // SMILES has 50k miles — request 30k — sufficient
      mockMessageParser.extractData.mockResolvedValue(createRawExtractionOutput({
        rawQuantity: '30k', cpfCount: 1,
      }));

      await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF');

      expect(mockMessageParser.extractData).toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 16: Run all tests**

Run: `pnpm --filter nest_api test -- --testPathPattern="telegram-user-purchase.handler" --no-coverage`
Expected: All PASS

- [ ] **Step 17: Commit**

```bash
git add nest_api/src/infrastructure/telegram/handlers/telegram-user-purchase.handler.ts nest_api/src/infrastructure/telegram/handlers/telegram-user-purchase.handler.spec.ts
git commit -m "refactor: add pre-LLM short-circuits to purchase handler

Move provider extraction and quantity pre-filter before the LLM call.
Short-circuits when user has no config for the detected provider or
when estimated quantity exceeds available miles."
```

---

## Chunk 4: Cleanup

### Task 8: Remove unused code

**Files:**
- Modify: `nest_api/src/infrastructure/openai/message-parser.service.ts`

- [ ] **Step 18: Remove dead imports from MessageParserService**

After splitting out `parse()`, the service no longer needs:
- `ProviderExtractionUtil` import
- `QuantityNormalizationUtil` import
- `PriceNormalizationUtil` import
- `PurchaseProposal` type import
- `ProgramOption` type import

Verify these are actually unused (the service should only have `extractData` and `detectTrap` now). Remove unused imports.

**Note:** Do NOT remove `ProgramOption` from `message-parser.interface.ts` itself — it's still used by `ProviderExtractionUtil` (which imports it from that file).

- [ ] **Step 18b: Check for MessageParserService unit tests**

Search for `message-parser.service.spec.ts`. If it exists, update mocks/assertions to reflect the new 2-method interface (`extractData`, `detectTrap` instead of `parse`).

- [ ] **Step 19: Remove old PurchaseProposal import from handler if unused**

Check if `PurchaseProposal` is still used in the handler (it should be — handler constructs it during normalization). If unused, remove.

- [ ] **Step 20: Run full test suite**

Run: `pnpm --filter nest_api test --no-coverage`
Expected: All PASS

- [ ] **Step 21: Commit**

```bash
git add -u
git commit -m "chore: remove dead imports after MessageParser refactor"
```
