# Input data batch processor

## Overview

`src\cliProcessInputList.mjs` loads a text file containing part numbers, queries PartSurfer,
PartSurfer Photo, and HPE Buy sequentially, and writes combined CSV rows back to the same folder.
The helper is intended for processing `list1.txt` located in the shared **input data** directory.

## Input format

- Location: `C:\Users\G\Desktop\jarvis.hpe v1.0.0\input data\list1.txt`
- Encoding: UTF-8
- One SKU per line; blank lines are ignored.
- Lines that start with `#` are treated as comments and skipped.

## Running from Windows

```bat
cd "C:\Users\G\Desktop\jarvis.hpe v1.0.0\apps\hpe-partsurfer"
.\scripts\run_input_list.bat "C:\Users\G\Desktop\jarvis.hpe v1.0.0\input data\list1.txt" "C:\Users\G\Desktop\jarvis.hpe v1.0.0\input data\buyhpe_output"
```

The batch file forwards the arguments to
`node --experimental-vm-modules .\src\cliProcessInputList.mjs --in "%~1" --out "%~2"`.

## Output files

Two CSV files are created in `C:\Users\G\Desktop\jarvis.hpe v1.0.0\input data` using the provided
prefix:

- `C:\Users\G\Desktop\jarvis.hpe v1.0.0\input data\buyhpe_output.csv`
- `C:\Users\G\Desktop\jarvis.hpe v1.0.0\input data\buyhpe_output_semicolon.csv`

Both files include the following header (semicolon layout is Excel-friendly for Russian locales):

```
#;PartNumber;PS_Title;PSPhoto_Title;BUY_Title;PS_SKU;PS_Category;PS_Availability;PS_URL;PS_Image;PS_Error;PSPhoto_SKU;PSPhoto_URL;PSPhoto_Image;PSPhoto_Error;BUY_SKU;BUY_URL;BUY_Image;BUY_Error
```

The first column `#` increments each processed part (starting from 1) so the Excel sheet retains the
original ordering. Provider specific titles are grouped up front (`PartNumber`, `PS_Title`,
`PSPhoto_Title`, and `BUY_Title`) to match the revised review flow, while the remaining technical
fields keep their previous order. Pricing columns were removed from the Buy HPE export; when the
product cannot be located the CSV now records `BUY_URL` as `Product Not Found`.

For providers that return no data or throw errors, the corresponding `*_Error` column contains a short
status such as `not found`, `CHECK MANUALLY`, or an error code while the other provider-specific
columns remain empty.

When every provider misses on a `-002` spare, the CLI automatically retries with the `-001` suffix.
Successful lookups keep the fetched provider data but annotate the exported `PartNumber` with
`"<original> (auto change <alternate>)"` so reviewers can see the substituted SKU. Parts in the
denylist (currently `804329-002`) skip auto-correction entirely and are emitted with
`CHECK MANUALLY` markers plus `BUY_URL` set to `Product Not Found`.

## Parser notes

- **PartSurfer Search.aspx** now prefers the details table row whose label matches `Part Description`
  (case-insensitive); the cell value is decoded and trimmed before overriding `PS_Title` unless it equals
  `Product Description Not Available`. Category extraction first looks for `Product Category`/`Category`
  in the same table, then falls back to breadcrumb text immediately before the part number while
  filtering out `Keyword`. Availability strings coming from `Availability`, `Orderable`, `Status`, or
  `Lifecycle` rows are normalised to canonical values such as `Available`, `Not Orderable`, `Obsolete`,
  `End of Life`, `Replaced (PN)`, `Out of Stock`, or `Information Only`.
- **PartSurfer ShowPhoto.aspx** scans the document for `Part Description : ...` first, then evaluates
  nearby captions/headings (`h1`, `h2`, `.caption`, etc.) before finally falling back to `<img alt>` text.
  Placeholder messages (including `Product Description Not Available`) are ignored. When the photo page
  exposes a meaningful title but Search does not, the CLI backfills `PS_Title` using the photo
  description. Photo misses explicitly set `PSPhoto_Error = "not found"` while preserving
  `PSPhoto_URL` for review.
- **Buy HPE PDP** walks a selector cascade of `h1.product-detail__name`, `h1.pdp-product-name`,
  `.product-detail__summary h1`, `.product__title`, and metadata (`meta[property="og:title"]`,
  `meta[name="twitter:title"]`). Structured data (JSON-LD) still supplies SKU/URL/image/category
  fallbacks. HTTP 200 responses with an empty DOM resolve to `BUY_URL = "Product Not Found"` and
  `BUY_Error = "not found"`.
- Provider success is now strictly `title && url`; when every provider fails the CLI emits
  `CHECK MANUALLY` markers (after applying the denylist/auto-correct flow described above).

## Networking, retries, and logging

- SKU normalisation uppercases input, collapses stray whitespace/dashes, expands known truncated suffixes (e.g. `B2` → `B21`), and restores hyphenated forms such as `P00930-B21`.
- All outbound requests force HTTPS, strip tracking parameters, and send `User-Agent` plus `Accept-Language: en-US,en;q=0.8`. ShowPhoto and Buy HPE calls share the same timeout budget and retry up to the configured limit with exponential backoff (default 3 attempts).
- `--concurrency <n>` limits simultaneous lookups (default 3), `--retry <count>` overrides the retry budget, and `--log-json <file>` writes structured JSONL records to `apps\hpe-partsurfer\logs\*.jsonl` with `ts, sku, provider, url, http, bytes, durationMs, retries, parseHint, success` fields.
- CSV exports are emitted as UTF-8 with BOM; all values are trimmed and any embedded semicolons/newlines are escaped so spreadsheets remain aligned.
