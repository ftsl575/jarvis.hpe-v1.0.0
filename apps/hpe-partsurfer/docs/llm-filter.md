# LLM verification filter

## Purpose

The Buy HPE provider now runs a post-processing filter that verifies DOM/JSON-LD output against the
source HTML using two external APIs:

- OpenAI ChatGPT (configurable via `OPENAI_API_KEY`, optional `OPENAI_MODEL`, `OPENAI_API_BASE_URL`).
- DeepSeek Chat Completion API (`DEEPSEEK_API_KEY`, optional `DEEPSEEK_MODEL`, `DEEPSEEK_API_BASE_URL`).

Both APIs act strictly as **verifiers** and **extractors**. They must not invent, rewrite, or expand
marketing copy beyond what is present in the provided snippet.

## Sanitisation pipeline

1. Scripts and styles are stripped from the fetched HTML; the snippet is truncated to 20 000
   characters to keep prompts deterministic.
2. Candidate values from DOM/JSON-LD parsing (title, description, SKU) are normalised via
   `utils/normalizeText.js` (Unicode NFKC, HTML decoding, whitespace collapse, boilerplate removal).
3. The context passed to the models includes:
   - Target SKU (after normalisation).
   - Candidate title and marketing description (if available).
   - Canonical URL (for reference only).
   - Sanitised HTML snippet.

## Prompt contract

Models receive a shared prompt that instructs them to return a single JSON object with the following
keys:

| Key | Type | Notes |
| --- | ---- | ----- |
| `title` | string | Must match text in the snippet. Empty string when unverifiable. |
| `marketing_description` | string | Verbatim marketing copy from the snippet. Empty string when unavailable. |
| `sku` | string | SKU/part number extracted from the snippet. Empty string when absent. |
| `lang` | string | Language hint (`html[lang]`, meta, or text inference). Empty string when unknown. |
| `evidenceSnippet` | string | Short quote showing where the description was found. |
| `charStart` | number | Zero-based character index into the sanitised snippet. |
| `charEnd` | number | End index (exclusive). Must be ≥ `charStart`. |
| `confidence` | number | 0–1 range; 0 when unverifiable. |

Responses are wrapped in `response_format: json_object`, so non-JSON content is rejected before
parsing.

## Validation & merge rules

- Normalised responses from both models must agree on title, marketing description, and SKU before
  being accepted.
- The first matching description becomes `marketingDescription` on the provider payload. Evidence
  metadata is emitted under `llmEvidence` (`snippet`, `charStart`, `charEnd`, `promptHash`,
  `providers`, `agreement`).
- If the models disagree or return conflicting SKUs, the row is flagged with `manualCheck: true` and
  the description is left untouched.
- When both models return empty strings for all text fields, the provider emits an empty description
  **without** forcing a manual review.
- Confidence is averaged across agreeing responses; disagreement falls back to the agreement score.

## Operational notes

- Missing API keys disable the filter gracefully. DOM/JSON-LD output still flows, but `manualCheck`
  remains `false` and no marketing description is attached.
- Prompt hashes (SHA-256 of the sanitised snippet) are logged for reproducibility while keeping raw
  HTML out of log files.
- The filter runs synchronously inside `providerBuyHpe` so CLI consumers automatically benefit from
  the verification step without extra configuration.
