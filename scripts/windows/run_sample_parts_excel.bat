@echo off
setlocal enabledelayedexpansion

rem Locate repository root (two levels up from scripts\windows)
set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%..\.." >nul 2>&1
if errorlevel 1 (
    echo Failed to change directory to repository root from %SCRIPT_DIR%.
    exit /b 1
)

set "APP_DIR=apps\hpe-partsurfer"
if not exist "%APP_DIR%" (
    echo Expected directory "%APP_DIR%" was not found.
    popd >nul 2>&1
    exit /b 1
)

pushd "%APP_DIR%" >nul 2>&1
if errorlevel 1 (
    echo Unable to enter %APP_DIR%.
    popd >nul 2>&1
    exit /b 1
)

set "EXPORT_DIR=exports"
if not exist "%EXPORT_DIR%" mkdir "%EXPORT_DIR%"

set "INPUT_FILE=sample_parts.txt"
set "CSV_PATH=%EXPORT_DIR%\sample_parts_live.csv"
set "CSV_RU_PATH=%EXPORT_DIR%\sample_parts_live_ru.csv"
set "XLSX_PATH=%EXPORT_DIR%\sample_parts_live.xlsx"

if not exist "%INPUT_FILE%" (
    echo Input file %INPUT_FILE% not found.
    popd >nul 2>&1
    popd >nul 2>&1
    exit /b 1
)

echo Running HPE PartSurfer CLI in live mode...
node src\cli.js --input "%INPUT_FILE%" --out "%CSV_PATH%" --live
if errorlevel 1 goto :cli_error

echo Converting CSV delimiters for Russian locale (comma -> semicolon)...
for %%I in ("%CSV_PATH%") do set "CSV_PATH_ABS=%%~fI"
for %%I in ("%CSV_RU_PATH%") do set "CSV_RU_PATH_ABS=%%~fI"
for %%I in ("%XLSX_PATH%") do set "XLSX_PATH_ABS=%%~fI"

PowerShell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference = 'Stop';" ^
  "$csvPath = '%CSV_PATH_ABS%';" ^
  "$semiPath = '%CSV_RU_PATH_ABS%';" ^
  "$xlsxPath = '%XLSX_PATH_ABS%';" ^
  "Write-Verbose 'Exporting semicolon CSV for Excel' -Verbose;" ^
  "$data = Import-Csv -LiteralPath $csvPath;" ^
  "$data ^| Export-Csv -LiteralPath $semiPath -NoTypeInformation -Delimiter ';' -Encoding UTF8;" ^
  "$excel = $null;" ^
  "$workbook = $null;" ^
  "$sheet = $null;" ^
  "try {" ^
  "  $excel = New-Object -ComObject Excel.Application;" ^
  "  $excel.Visible = $false;" ^
  "  $excel.DisplayAlerts = $false;" ^
  "  $workbook = $excel.Workbooks.Add();" ^
  "  $sheet = $workbook.Worksheets.Item(1);" ^
  "  $connection = 'TEXT;' + $semiPath;" ^
  "  $targetRange = $sheet.Range('A1');" ^
  "  $query = $sheet.QueryTables.Add($connection, $targetRange);" ^
  "  $query.TextFileCommaDelimiter = $false;" ^
  "  $query.TextFileSemicolonDelimiter = $true;" ^
  "  $query.TextFileParseType = 1;" ^
  "  $query.BackgroundQuery = $false;" ^
  "  $query.TextFileColumnDataTypes = [int[]](1,1,1,1,1);" ^
  "  $query.AdjustColumnWidth = $true;" ^
  "  $query.Refresh($false);" ^
  "  $sheet.UsedRange.Value2 = $sheet.UsedRange.Value2;" ^
  "  $query.Delete();" ^
  "  $workbook.SaveAs($xlsxPath, 51);" ^
  "} finally {" ^
  "  if ($workbook -ne $null) { $workbook.Close($false) ^| Out-Null; }" ^
  "  if ($excel -ne $null) { $excel.Quit() ^| Out-Null; }" ^
  "  foreach ($obj in @($sheet, $workbook, $excel)) {" ^
  "    if ($obj -ne $null) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($obj); }" ^
  "  }" ^
  "  [GC]::Collect();" ^
  "  [GC]::WaitForPendingFinalizers();" ^
  "}"
if errorlevel 1 goto :excel_error

echo.
echo Export complete.
echo Raw CSV: %CSV_PATH_ABS%
echo RU CSV: %CSV_RU_PATH_ABS%
echo Excel:  %XLSX_PATH_ABS%

goto :success

:cli_error
echo CLI execution failed.
popd >nul 2>&1
popd >nul 2>&1
exit /b 1

:excel_error
echo Excel automation failed.
popd >nul 2>&1
popd >nul 2>&1
exit /b 1

:success
popd >nul 2>&1
popd >nul 2>&1
exit /b 0
