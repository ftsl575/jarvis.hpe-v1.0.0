# buy.hpe.com integration notes

## Overview

The Buy HPE integration fetches product detail pages, extracts descriptive metadata (title, SKU,
canonical URL, image, category), and reports whether the page contained enough information to be
considered a success. Requests honour the shared timeout/retry budget and rotate between a
small pool of desktop/tablet `User-Agent` values while sending `Accept-Language: en-US,en;q=0.9`.

## Fetch behaviour

- Base URL defaults to `https://buy.hpe.com/` but can be overridden with the `baseUrl` option.
- Requests are limited to `GET` for public product and search pages.
- Two retries are attempted for transient failures (`429` or `5xx` responses) with exponential backoff.
- Each retry uses the next `User-Agent` from the configured pool to reduce the chance of repeated
  blocks.
- A timeout can be adjusted through `timeoutMs` (default: 12 seconds).

## Parser strategy

1. Parse JSON-LD payloads that expose `Product`/`Offer` schema nodes and normalise the core fields.
   Title candidates now include `productName`, `baseProduct.productName`, `name`, `headline`, and
   `title`. The parser still extracts SKU/partNumber identifiers, canonical URLs, images, and category
   strings while ignoring price/availability fields to keep the export schema stable.
2. Fallback to DOM heuristics when schema data is missing. The fallback walks a selector cascade in
   the following order and returns the first non-empty, non-generic value:
   - `h1.pdp-product-name`
   - `h1.product-detail__name`
   - `.product-detail__summary h1`
   - `.product__title`
   - `[data-testid="pdp_productTitle"]`
   - `meta[property="og:title"]`
   - `meta[name="twitter:title"]`
   - JSON-LD `title`/`name` fields as a last resort
   Titles that mirror “Buy HPE...” boilerplate or the SKU itself are ignored so search/photo fallbacks
   can supply better copy. Canonical URLs are resolved from `<link rel="canonical">` or `og:url`,
   normalised, and required for success so the provider only returns payloads with both `title` and `url`.
   If every selector fails on a live page—or the DOM is effectively empty—the parser returns `null` and
   the provider records `BUY_URL = "Product Not Found"` with `BUY_Error = "not found"`.

### Examples

- Working PDP: `/us/en/p/P00930-B21` exposes `h1.pdp-product-name`, a canonical link, and image meta,
  yielding a complete payload with `HPE ProLiant DL380 Gen10 Server`.
- Search fallback: `/us/en/search?q=R7K89A` links to a PDP whose breadcrumbs provide the
  `Networking > Access Points > Wi-Fi 6E` category.
- Empty template: pages that only render placeholders (e.g. blank CMS shells) trigger the `Product Not
  Found` state even if they return HTTP 200.

## Provider flow

The provider first requests `/[locale]/p/<SKU>` (default locale is `us/en`). If the product page
cannot be parsed (including empty-DOM responses) or returns a `404`, the provider fetches
`/[locale]/search?q=<SKU>` and pulls the first product card link before re-running the parser. When
the PDP responds with `403`, `429`, or `503`, the search page is used as a data source directly: the
first matching product card provides the title/URL (and image when available) and the provider marks
the row as `fetchedFrom: "search-card"`. If no card exists the original status code is rethrown so the
CLI can emit `CHECK MANUALLY`. Successful results always include `source: "HPE Buy (buy.hpe.com)"`
and an additional `fetchedFrom` field indicating whether the direct, search, or search-card path
produced the payload.

## Aggregator integration

- The main aggregation pipeline resolves PartSurfer metadata first and only then invokes the
  buy.hpe.com provider, preserving both payloads in the emitted list.
- buy.hpe.com entries always expose `source: "HPE Buy (buy.hpe.com)"` so downstream
  classification stays aligned with the supported source taxonomy.
- Part numbers are normalised once prior to executing the provider chain to keep duplicate SKUs
  from triggering redundant requests.
- When both the direct product lookup and the fallback search miss (or the DOM is empty), the batch
  export records `BUY_URL = "Product Not Found"` and surfaces `BUY_Error = "not found"` so manual
  follow-up is obvious.

## CSV export helper

`exportCsvBuyHpe` accepts one or multiple parsed product records and writes both comma-separated and
 semicolon-separated files to `apps/hpe-partsurfer/sample_results.csv` and
 `apps/hpe-partsurfer/sample_results_semicolon.csv`. Values are normalised and quoted when necessary,
 with a static `source` column populated as `HPE Buy (buy.hpe.com)`.

## Sample runner

Use `scripts\run_sample_buyhpe.bat` to download a single SKU through the ESM runner in
`src\runSampleBuyHpe.mjs`. Example:

```bat
cd "C:\Users\G\Desktop\jarvis.hpe v1.0.0\apps\hpe-partsurfer"
.\scripts\run_sample_buyhpe.bat Q1J09B
```

The batch file changes into the application directory, calls
`node --experimental-vm-modules .\src\runSampleBuyHpe.mjs`, and prints the provider response as
formatted JSON. Live mode is enabled automatically so no additional flags are required.
