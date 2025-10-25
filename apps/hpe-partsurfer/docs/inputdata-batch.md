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

- **PartSurfer Search.aspx** now prefers the details table row whose label is exactly `Part Description`;
  this value is used for `PS_Title`. Category extraction first looks for `Product Category`/`Category`
  in the same table, then falls back to breadcrumb text immediately before the part number while
  filtering out `Keyword` noise. Availability strings are normalised from labels such as `Availability`,
  `Orderable`, `Status`, and `Lifecycle` to consistent values like `Available`, `Not Orderable`,
  `Obsolete`, `End of Life`, or `Replaced (<PN>)`.
- **PartSurfer ShowPhoto.aspx** pulls the most meaningful text in the order `<title>` → nearby caption
  headings (`h1`, `h2`, `.caption`, etc.) → `<img alt>`. When the search page is missing a title but the
  photo page has one, the CLI backfills `PS_Title` using the photo caption. Photo misses explicitly set
  `PSPhoto_Error` to `not found`.
- **Buy HPE PDP** looks for titles in dynamic DOM nodes such as `h1.product-detail__name`,
  `[data-testid="pdp_productTitle"]`, `meta[property="og:title"]`, and
  `meta[name="twitter:title"]`. HTTP 200 responses that still fail to produce a title are treated as
  misses, yielding `BUY_URL = "Product Not Found"` and `BUY_Error = "not found"` even when the page
  returns an empty shell.
- Provider success is now strictly `title && url`; when every provider fails the CLI emits
  `CHECK MANUALLY` markers (after applying the denylist/auto-correct flow described above).
