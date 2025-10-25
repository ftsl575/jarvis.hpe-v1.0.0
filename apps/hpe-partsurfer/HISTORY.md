## [Unreleased]

### Intelligent extraction upgrade
- **LLM verification**: introduce ChatGPT and DeepSeek backed filters that validate Buy HPE titles,
  marketing copy, and SKUs directly against sanitised HTML snippets. Matching responses reinforce
  existing DOM/JSON-LD parsing, surface evidence locations, and raise `manualCheck` only when the
  models disagree or lack verifiable data.
- **Text normalisation**: centralise Unicode/HTML cleanup in `utils/normalizeText.js`, apply NFKC
  folding, strip boilerplate phrases (“Buy HPE…”, “PartSurfer…”, “Service Parts Information…”),
  enforce 1024-character limits, and reuse the helper across PartSurfer and Buy flows.
- **Buy HPE resilience**: expand the User-Agent pool to 20+ realistic desktop/mobile signatures,
  add paced retries (random 2–4s delay plus jittered backoff), refresh cookie jars on 403/429, and
  log per-attempt `uaId`/`method` metadata for downstream throttling analysis.
- **Structured payloads**: capture Buy HPE descriptions, language hints, and LLM verification
  metadata (`marketingDescription`, `confidence`, evidence bounds) while preserving the legacy
  schema for aggregators and CSV exports.

### Final parser QA
- **Safe upgrade**: share text normalisation utilities (including NBSP cleanup and placeholder filtering),
  prioritise PartSurfer table descriptions, backfill PS titles when search returns the SKU, and add
  buy.hpe.com resilience (User-Agent rotation, search-card fallback on 403/503, manual-check signalling).
  Verified via refreshed unit and integration suites.
- **PS/Search**: prefer the details table row labelled `Part Description` for the title, normalise category
  and availability values from both tables and field pairs, and trigger manual checks when the content is the
  `PRODUCT DESCRIPTION NOT AVAILABLE` placeholder.
- **PS/Photo**: capture descriptions from the `Part Description` regex or caption/nearby elements while
  ignoring generic `<title>` values, fall back to alt text, surface the manual-check state on placeholder
  copy, and backfill the search title when photo data is the only success path.
- **Buy HPE**: expand the selector cascade (`h1.pdp-product-name`, `h1.product-detail__name`,
  `.product-detail__summary h1`, `.product__title`, and metadata), add JSON-LD fallbacks (including
  `productName`, `baseProduct.productName`, `name`, and `headline`), and treat empty templates as
  `Product Not Found` so success requires both a title and canonical URL.
- **Miss policy**: keep unified success checks, retain the `-002 → -001` autocorrect with the `804329-002`
  denylist, and escalate placeholder descriptions to the existing `CHECK MANUALLY` flow.
- **Normalisation & transport**: continue to canonicalise SKU/URL pairs, trim all provider fields, honour
  retry/throttling settings, and send explicit request headers for consistent responses.
- **Logging & artefacts**: persist JSONL network logs that include `parseHint` markers and keep writing
  debug HTML snapshots for later analysis.
- **CSV contract**: titles remain at the front of the export, files include a UTF-8 BOM, value escaping covers
  commas/semicolons, and all providers share the exact `Product Not Found` string when URLs are missing.

### Earlier updates

- Added buy.hpe.com provider: fetch, parse, provider, CSV export, Windows-safe paths in tests.
- Enabled buy.hpe.com in main aggregator.
- Reordered batch CSV exports to prefix the key title columns, add a numeric index column, and
  normalise not-found states (auto-correction from `-002` to `-001`, `Product Not Found` URLs, and
  `CHECK MANUALLY` fallbacks).
- Patch: photo title description, robust autocorrect, 804329-002 manual check, PartSurfer 'Part Description',
  Buy not-found.
- Normalize parsers: prefer PartSurfer details table descriptions/categories with availability mapping,
  add photo caption/alt fallbacks (and PS title backfill), strengthen Buy HPE title selectors
  (including og/twitter meta) with empty-DOM `Product Not Found`, and unify provider success criteria.

## v1.0.0-stable — October 2025

- Стабильная работа CLI и API для поиска на HPE PartSurfer.
- Поддерживаемые типы:
  - Option Kit Numbers (XXXXXX-B21)
  - SKU / Product Numbers (PXXXXX-B21, XXXXX-425)
- Обработка Spare и Assembly частично реализована (тестовый режим).
- Тесты 100% успешны (6/6 suites).
- Реализован экспорт в Excel (.xlsx) с колонками.
- Добавлен run_sample_parts.bat для Windows.
