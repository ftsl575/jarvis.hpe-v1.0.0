# buy.hpe.com integration notes

## Overview

The Buy HPE integration adds a lightweight fetcher, parser, and provider that extract pricing
information for public SKU pages. It uses the native `fetch` available in Node.js 18+ with a
conservative retry strategy and honours the shared configuration flags such as `LIVE_MODE` and
`USER_AGENT`.

## Fetch behaviour

- Base URL defaults to `https://buy.hpe.com/` but can be overridden with the `baseUrl` option.
- Requests are limited to `GET` for public product and search pages.
- Two retries are attempted for transient failures (`429` or `5xx` responses) with exponential backoff.
- A timeout can be adjusted through `timeoutMs` (default: 12 seconds).

## Parser strategy

1. Parse JSON-LD payloads that expose `Product`/`Offer` schema nodes and normalise the core fields:
   title, price, priceCurrency, availability, sku/partNumber, canonical URL, image, and category.
2. Fallback to DOM heuristics when schema data is missing. The fallback looks at Open Graph tags,
   breadcrumb navigation, price widgets, and inline availability strings.

## Provider flow

The provider first requests `/[locale]/p/<SKU>` (default locale is `us/en`). If the product page
cannot be parsed or returns a `404`, the provider fetches `/[locale]/search?q=<SKU>` and pulls the
first product card link before re-running the parser. Successful results include
`source: "HPE Buy (buy.hpe.com)"` and an additional `fetchedFrom` field indicating whether the direct
or search fallback succeeded.

## Aggregator integration

- The main aggregation pipeline resolves PartSurfer metadata first and only then invokes the
  buy.hpe.com provider, preserving both payloads in the emitted list.
- buy.hpe.com entries always expose `source: "HPE Buy (buy.hpe.com)"` so downstream
  classification stays aligned with the supported source taxonomy.
- Part numbers are normalised once prior to executing the provider chain to keep duplicate SKUs
  from triggering redundant requests.

## CSV export helper

`exportCsvBuyHpe` accepts one or multiple parsed product records and writes both comma-separated and
 semicolon-separated files to `apps/hpe-partsurfer/sample_results.csv` and
 `apps/hpe-partsurfer/sample_results_semicolon.csv`. Values are normalised and quoted when necessary,
 with a static `source` column populated as `HPE Buy (buy.hpe.com)`.

## Local sampling

Use `scripts\run_sample_buyhpe.bat` to download a single SKU. Example:

```bat
cd "C:\Users\G\Desktop\jarvis.hpe v1.0.0"
cd "C:\Users\G\Desktop\jarvis.hpe v1.0.0\apps\hpe-partsurfer"
.\scripts\run_sample_buyhpe.bat Q1J09B
```

The batch file runs the provider with live mode enabled and prints the parsed JSON payload.
