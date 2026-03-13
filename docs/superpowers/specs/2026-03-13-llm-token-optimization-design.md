# LLM Token Optimization — Pre-LLM Short-Circuits

## Problem

Today `MessageParser.parse()` calls the LLM for every message that passes basic validations (length, numbers, trap words), even when cheap local checks could determine the message won't result in a response. This wastes tokens on messages where:

- The provider is recognized but the user has no price configuration for it
- The quantity is clearly insufficient (detectable via regex) and the user lacks miles

## Approach

Refactor `MessageParser` from a single `parse()` method into 2 LLM methods (`extractData`, `detectTrap`). Provider extraction stays as a static utility (`ProviderExtractionUtil`) called directly by the handler. Move orchestration to the handler so it can short-circuit before calling the LLM.

## Design

### 1. New `MessageParser` Interface

Replace the single `parse()` method with 2 LLM-focused methods:

```typescript
abstract class MessageParser {
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
- `extractData` returns `RawDataExtractionOutput | null` where null means "not a purchase proposal" (matching the current `extractDataWithAI` internal behavior)
- `detectTrap` is exposed as a public method (currently private in `MessageParserService`)
- The old `parse()` method is removed
- Provider extraction stays on `ProviderExtractionUtil.extractProvider()` — the handler calls it directly (it's keyword matching, not AI, so it doesn't belong on the parser interface)
- Normalization of quantity/prices (currently inside `parse()`) moves to the handler

### 2. `QuantityPreFilterUtil` — Conservative Regex Estimator

New pure static utility. Extracts an approximate quantity from **raw message text** (not normalized) using unambiguous patterns only. Returns `null` when uncertain (handler proceeds to LLM).

**Patterns matched (conservative):**

| Pattern | Example | Result |
|---|---|---|
| `\d+k` (integer base) | `242k`, `50K` | 242000, 50000 |
| `\d+kk` | `1kk` | 1000000 |
| `\d+m` | `2m`, `2M` | 2000000 |
| `\d+\.000` (dot + exactly 3 zeros) | `50.000` | 50000 |
| `\d+,000` (comma + exactly 3 zeros) | `50,000` | 50000 |
| `\d+mil\b` | `50mil` | 50000 |

**Not matched (left for LLM):**
- Numbers without suffix: `84000` (could be price or quantity)
- Decimal base with k: `21,5k` (separator ambiguity)
- Comma thousands with k: `302,900k`

**Important:** This util operates on the raw (untrimmed) message text, NOT on text normalized by `ProviderExtractionUtil.normalizeText()` (which splits digit-letter boundaries like `"242k"` → `"242 k"`).

**When multiple candidates exist:** return the largest match with a recognized suffix (purchase proposals typically have one quantity, and it's the largest number with a suffix).

**Return type:** `number | null`. Null = "not confident" — handler skips pre-checks and proceeds to LLM.

### 3. New Handler Flow

```
1.  Cheap validations (length, numbers, trap words, isReply)     [unchanged]
2.  Fetch programs from DB                                        [unchanged]
3.  ProviderExtractionUtil.extractProvider(text, programs) → airlineId | null
    → null? log + return
4.  Find program in DB by airlineId
    → not found? log + return
5.  Fetch liminar variant via milesProgramRepository.findLiminarFor(airlineId)
    getConfiguredProgramIds(userId)
    → program AND its liminar variant both absent from configuredProgramIds?
    → log("provider X found but user has no config") + return            [NEW]
6.  QuantityPreFilterUtil.estimate(text) → quantity | null
    → if quantity !== null:
      - Check hasSufficientMiles for program (and liminar if exists)
      - If ALL candidates fail → log + return                            [NEW]
7.  messageParser.extractData(text, reasoningEffort) → LLM call
    → null? return (not a purchase proposal)
8.  messageParser.detectTrap(text) if reasoningEffort === 'high'
9.  Normalize quantity/prices (QuantityNormalizationUtil, PriceNormalizationUtil)
10. Post-LLM validations (cpfCount, absurdPrice, multiple prices,
    minQuantity with real cpfCount, etc.)                                [unchanged]
11. Price calculation and message sending                                [unchanged]
```

Key points:
- Steps 3, 5, 6 are new pre-LLM short-circuits
- Step 3: handler calls `ProviderExtractionUtil` directly (no longer inside parser)
- Step 5: fetches liminar variant via DB call, then checks if ANY variant (normal or liminar) is configured — only aborts if neither is
- Step 6: only checks `hasSufficientMiles` (not minQuantity, since cpfCount is unknown pre-LLM). Optimistic: null from pre-filter means "can't tell" → proceed to LLM
- Step 9: normalization that was inside `parse()` is now explicit in handler
- Step 10: minQuantity check stays here (needs cpfCount from LLM)

### 4. Tests

**`QuantityPreFilterUtil` (new, extensive tests):**
- Extracts correctly: `"smiles 242k 1cpf"` → 242000, `"latam 50.000 2cpf"` → 50000, `"smiles 1kk"` → 1000000, `"azul 50mil 1cpf"` → 50000, `"latam 50,000 2cpf"` → 50000
- Returns null (conservative): `"smiles 84000 1cpf"` (no suffix), `"latam 21,5k 1cpf"` (decimal k), unclear text
- Multiple candidates: `"smiles 50k 1cpf 20"` → 50000 (largest with suffix)
- Edge cases: `"50K"` uppercase, `"100.000"` with dot, `"50milhas"` should not match (word boundary)

**Handler tests (adapt existing ~2285 lines):**
- Update mocks from `messageParser.parse()` to `messageParser.extractData`, `messageParser.detectTrap`
- Add `ProviderExtractionUtil.extractProvider` as a static call (spy or test via input text)
- Add tests for new short-circuits:
  - Provider found but user has no config → no LLM call (`extractData` not called), no message sent
  - Pre-filter returns quantity and miles insufficient → no LLM call
  - Pre-filter returns null → proceeds to LLM normally

**`MessageParserService` tests (adapt if they exist):**
- Reflect new 2-method interface (`extractData`, `detectTrap`)

## Out of Scope

- Passing provider name as a variable to the LLM prompt (separate issue)
- Changes to the stored prompt on OpenAI
- Handler post-LLM logic (counter offer, CTA, dedup, delay) — unchanged
