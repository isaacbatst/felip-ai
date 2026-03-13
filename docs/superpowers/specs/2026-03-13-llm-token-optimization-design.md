# LLM Token Optimization — Pre-LLM Short-Circuits

## Problem

Today `MessageParser.parse()` calls the LLM for every message that passes basic validations (length, numbers, trap words), even when cheap local checks could determine the message won't result in a response. This wastes tokens on messages where:

- The provider is recognized but the user has no price configuration for it
- The quantity is clearly insufficient (detectable via regex) and the user lacks miles

## Approach

Refactor `MessageParser` from a single `parse()` method into 3 granular methods. Move orchestration to the handler so it can short-circuit before calling the LLM.

## Design

### 1. New `MessageParser` Interface

Replace the single `parse()` method with 3 independent methods:

```typescript
abstract class MessageParser {
  // Keyword matching, no LLM (synchronous)
  abstract extractProvider(text: string, programs: ProgramOption[]): number | null;

  // LLM call — extract quantity, cpfCount, prices
  abstract extractData(
    text: string,
    reasoningEffort?: 'minimal' | 'high'
  ): Promise<RawDataExtractionOutput | null>;

  // LLM call — trap detection (precise mode only)
  abstract detectTrap(text: string): Promise<boolean>;
}
```

Notes:
- `extractProvider` is synchronous (no AI)
- `extractData` returns `RawDataExtractionOutput` (raw strings) instead of normalized `PurchaseProposal[]` — normalization moves to the handler
- `detectTrap` is exposed as a public method (currently private in `MessageParserService`)
- The old `parse()` method is removed

### 2. `QuantityPreFilterUtil` — Conservative Regex Estimator

New pure static utility. Extracts an approximate quantity from raw text using unambiguous patterns only. Returns `null` when uncertain (handler proceeds to LLM).

**Patterns matched (conservative):**

| Pattern | Example | Result |
|---|---|---|
| `\d+k` (integer base) | `242k`, `50K` | 242000, 50000 |
| `\d+kk` | `1kk` | 1000000 |
| `\d+m` | `2m`, `2M` | 2000000 |
| `\d+\.000` (dot + exactly 3 zeros) | `50.000` | 50000 |
| `\d+mil` | `50mil` | 50000 |

**Not matched (left for LLM):**
- Numbers without suffix: `84000` (could be price or quantity)
- Decimal base with k: `21,5k` (separator ambiguity)
- Comma thousands with k: `302,900k`

**When multiple candidates exist:** return the largest match with a recognized suffix (purchase proposals typically have one quantity, and it's the largest number with a suffix).

**Return type:** `number | null`. Null = "not confident" — handler skips pre-checks and proceeds to LLM.

### 3. New Handler Flow

```
1.  Cheap validations (length, numbers, trap words, isReply)     [unchanged]
2.  Fetch programs from DB                                        [unchanged]
3.  extractProvider(text, programs) → airlineId | null
    → null? log + return
4.  Find program in DB by airlineId
    → not found? log + return
5.  getConfiguredProgramIds(userId)
    → program AND its liminar variant both absent from configuredProgramIds?
    → log("provider X found but user has no config") + return            [NEW]
6.  QuantityPreFilterUtil.estimate(text) → quantity | null
    → if quantity !== null:
      - Check hasSufficientMiles for program (and liminar if exists)
      - Check minQuantity for program (and liminar if exists)
      - If ALL candidates fail → log + return                            [NEW]
7.  extractData(text, reasoningEffort) → LLM call
    → null or !isPurchaseProposal? return
8.  detectTrap(text) if reasoningEffort === 'high'
9.  Normalize quantity/prices (QuantityNormalizationUtil, PriceNormalizationUtil)
10. Post-LLM validations (cpfCount, absurdPrice, multiple prices, etc.) [unchanged]
11. Price calculation and message sending                                [unchanged]
```

Key points:
- Steps 5-6 are new pre-LLM short-circuits
- Step 5 checks if ANY variant (normal or liminar) is configured — only aborts if neither is
- Step 6 is optimistic: null from pre-filter means "can't tell" → proceed to LLM
- Step 9: normalization that was inside `parse()` is now explicit in handler

### 4. Tests

**`QuantityPreFilterUtil` (new, extensive tests):**
- Extracts correctly: `"smiles 242k 1cpf"` → 242000, `"latam 50.000 2cpf"` → 50000, `"smiles 1kk"` → 1000000, `"azul 50mil 1cpf"` → 50000
- Returns null (conservative): `"smiles 84000 1cpf"` (no suffix), `"latam 21,5k 1cpf"` (decimal k), unclear text
- Multiple candidates: `"smiles 50k 1cpf 20"` → 50000 (largest with suffix)
- Edge cases: `"50K"` uppercase, `"100.000"` with dot

**Handler tests (adapt existing):**
- Update mocks from `messageParser.parse()` to `extractProvider`, `extractData`, `detectTrap`
- Add tests for new short-circuits:
  - Provider found but user has no config → no LLM call, no message sent
  - Pre-filter returns quantity and miles insufficient → no LLM call
  - Pre-filter returns null → proceeds to LLM normally

**`MessageParserService` tests (adapt if they exist):**
- Reflect new 3-method interface

## Out of Scope

- Passing provider name as a variable to the LLM prompt (separate issue)
- Changes to the stored prompt on OpenAI
- Handler post-LLM logic (counter offer, CTA, dedup, delay) — unchanged
