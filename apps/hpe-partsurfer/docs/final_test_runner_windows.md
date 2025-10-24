# Windows sample runner with Excel export

The `scripts\windows\run_sample_parts_excel.bat` helper automates the manual smoke test for the PartSurfer CLI on Windows. It runs the CLI in live mode, stores the CSV, converts it to a Russian-locale-friendly variant, and finally opens the data in Excel via COM automation to guarantee proper column detection.

## Prerequisites

- Windows 10 or later.
- Node.js 18+ with `npm install` already executed inside `apps\hpe-partsurfer`.
- Microsoft Excel 2016 or later with COM automation enabled.
- Network access to `partsurfer.hpe.com` (the script calls the live CLI).

## Usage

1. Open a Windows terminal.
2. Navigate to the repository root (the folder that contains `apps\hpe-partsurfer`).
3. Run:

   ```bat
   scripts\windows\run_sample_parts_excel.bat
   ```

4. Wait for the script to finish. It prints the paths for all generated artifacts.

## Expected output files

The script creates or overwrites the following artifacts inside `apps\hpe-partsurfer\exports`:

- `sample_parts_live.csv` – raw comma-delimited export produced by the CLI in live mode.
- `sample_parts_live_ru.csv` – semicolon-delimited CSV suitable for systems configured with the Russian locale.
- `sample_parts_live.xlsx` – Excel workbook generated through `QueryTables` so that every column is parsed separately even on a locale that expects semicolons.

## Notes

- The CLI invocation uses the existing flags (`--live`, `LIVE_MODE`, `DEBUG_SAVE_HTML`, `DEBUG_DIR`) without changing their contracts.
- Excel is started invisibly; the script closes the application when finished.
- The script does not touch Jest tests or CI configuration.
