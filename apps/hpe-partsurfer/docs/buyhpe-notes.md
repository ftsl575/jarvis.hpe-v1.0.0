# buy.hpe.com integration notes

## Overview

The Buy HPE integration fetches product detail pages, extracts descriptive metadata (title, SKU,
canonical URL, image, category), and reports whether the page contained enough information to be
considered a success. Requests honour the shared timeout/retry budget and reuse the global
`User-Agent`/`Accept-Language` headers.

## Fetch behaviour

- Base URL defaults to `https://buy.hpe.com/` but can be overridden with the `baseUrl` option.
- Requests are limited to `GET` for public product and search pages.
- Two retries are attempted for transient failures (`429` or `5xx` responses) with exponential backoff.
- A timeout can be adjusted through `timeoutMs` (default: 12 seconds).

## Parser strategy

1. Parse JSON-LD payloads that expose `Product`/`Offer` schema nodes and normalise the core fields:
   title, sku/partNumber, canonical URL, image, and category. (Price and availability values are
   ignored to keep the export schema stable.)
2. Fallback to DOM heuristics when schema data is missing. The fallback walks a selector cascade in
   the following order and returns the first non-empty value:
   - `h1.product-detail__name`
   - `h1.pdp-product-name`
   - `.product-detail__summary h1`
   - `.product__title`
   - `meta[property="og:title"]`
   - `meta[name="twitter:title"]`
   If every selector fails on a live page, the parser returns `null` and the provider records
   `BUY_URL = "Product Not Found"` with `BUY_Error = "not found"`.

## Provider flow

The provider first requests `/[locale]/p/<SKU>` (default locale is `us/en`). If the product page
cannot be parsed (including empty-DOM responses) or returns a `404`, the provider fetches
`/[locale]/search?q=<SKU>` and pulls the first product card link before re-running the parser.
Successful results include `source: "HPE Buy (buy.hpe.com)"` and an additional `fetchedFrom` field
indicating whether the direct or search fallback succeeded.

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
