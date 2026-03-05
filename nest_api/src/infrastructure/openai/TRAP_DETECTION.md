# AI Trap Detection

## Overview

Messages in Telegram miles-buying groups pass through two layers of trap/bait detection:

1. **Regex-based (all modes)** — Hardcoded trap words with `\b` word boundaries and optional plural `s?` suffix on single-word entries. Fast, zero cost, catches known patterns.

2. **AI-based (precise mode only)** — Runs after keyword matching confirms a program name exists, before the expensive data extraction call. Uses an inline prompt with `gpt-5-nano` at `high` reasoning effort. Catches novel trap patterns not in the hardcoded list.

## Fail behavior

- **Regex**: fail-open (only blocks known words)
- **AI trap detection**: fail-closed (blocks message on API error or unparseable response)

## Cost Analysis

Baseline: ~$1/day per user with 10 groups using `gpt-5-nano` for parsing (~$0.10/day/group, ~$3/month/group).

### AI trap detection cost (precise mode groups only)

Assumptions:
- ~30 messages/group/day pass pre-flight checks + keyword matching
- Input: ~300 tokens (inline prompt ~250 + message ~30-50 tokens for 100-char messages)
- Reasoning tokens (high effort): ~200-800 per call
- Output: ~20 tokens (boolean result)

| Model | Cost/call | Per group/day | Per group/month |
|-------|-----------|---------------|-----------------|
| `gpt-5-nano` (current) | $0.001-0.004 | $0.03-0.12 | $0.90-3.60 |
| `o4-mini` (upgrade path) | $0.005-0.01 | $0.15-0.30 | $4.50-9.00 |

### Upgrade path

The model is configured in `MessageParserService.config.model`. To upgrade trap detection to a separate model, extract `detectTrap()` to use its own model string. The `o4-mini` reasoning model provides stronger contextual analysis for catching sophisticated traps at ~3x the cost.
