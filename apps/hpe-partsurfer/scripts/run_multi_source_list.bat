@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "APP_DIR=%%~fI"

set "DEFAULT_INPUT=%APP_DIR%\parts_sample.txt"

if "%~1"=="" (
  set "PN_FILE=%DEFAULT_INPUT%"
) else (
  set "PN_FILE=%~1"
  if not exist "%PN_FILE%" if exist "%APP_DIR%\%~1" set "PN_FILE=%APP_DIR%\%~1"
)

for %%I in ("%PN_FILE%") do set "PN_FILE=%%~fI"

if not exist "%PN_FILE%" (
  echo Part number list not found: %PN_FILE%
  exit /b 1
)

set "OUTPUT_CSV=%APP_DIR%\sample_results.csv"
if not "%~2"=="" set "OUTPUT_CSV=%~2"

for %%I in ("%OUTPUT_CSV%") do (
  set "OUTPUT_CSV=%%~fI"
  set "OUTPUT_DIR=%%~dpI"
  set "OUTPUT_NAME=%%~nI"
  set "OUTPUT_EXT=%%~xI"
)

if "%OUTPUT_EXT%"=="" (
  set "OUTPUT_EXT=.csv"
  set "OUTPUT_CSV=%OUTPUT_DIR%%OUTPUT_NAME%%OUTPUT_EXT%"
)

set "OUTPUT_SEMI=%OUTPUT_DIR%%OUTPUT_NAME%_semicolon%OUTPUT_EXT%"

echo === HPE Multi-Source Aggregator ===
echo Input list: %PN_FILE%
echo Output (comma): %OUTPUT_CSV%
echo Output (semicolon): %OUTPUT_SEMI%

timeout /t 1 >NUL 2>&1

pushd "%APP_DIR%" >NUL
node src\aggregateMultiSource.js --input "%PN_FILE%" --out "%OUTPUT_CSV%" --live
set "EXIT_CODE=%ERRORLEVEL%"
popd >NUL

if NOT "%EXIT_CODE%"=="0" (
  echo Aggregation failed with exit code %EXIT_CODE%.
  exit /b %EXIT_CODE%
)

echo Semicolon CSV generated: %OUTPUT_SEMI%
echo === Done ===
exit /b 0
