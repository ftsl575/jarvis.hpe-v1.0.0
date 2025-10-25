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
PartNumber;PS_Title;PS_SKU;PS_Category;PS_Availability;PS_URL;PS_Image;PS_Error;PSPhoto_Title;PSPhoto_SKU;PSPhoto_URL;PSPhoto_Image;PSPhoto_Error;BUY_Title;BUY_SKU;BUY_Price;BUY_Currency;BUY_Availability;BUY_URL;BUY_Image;BUY_Error
```

For providers that return no data or throw errors, the corresponding `*_Error` column contains a short
status such as `not found` or an error code while the other provider-specific columns remain empty.
