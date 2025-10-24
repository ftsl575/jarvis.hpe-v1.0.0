@echo off
setlocal

:: Переход в каталог hpe-partsurfer
cd /d "%~dp0apps\hpe-partsurfer"

echo === Running HPE PartSurfer Batch ===
set LIVE_MODE=true
set DEBUG_SAVE_HTML=true
set DEBUG_DIR=debug

:: Запуск Node.js с входным файлом sample_parts.txt
node src\cli.js --input sample_parts.txt --out sample_results.csv --live

:: Проверка и конвертация CSV → XLSX
echo === Converting CSV to Excel ===
powershell -Command ^
  "if (Test-Path '.\sample_results.csv') { " ^
  + "$excel = New-Object -ComObject Excel.Application; " ^
  + "$wb = $excel.Workbooks.Open((Resolve-Path '.\sample_results.csv').Path); " ^
  + "$out = (Join-Path (Get-Location) 'sample_results.xlsx'); " ^
  + "$wb.SaveAs($out, 51); $wb.Close(); $excel.Quit(); " ^
  + "Write-Host 'Saved as sample_results.xlsx'; " ^
  + "} else { Write-Host 'CSV not found'; exit 1 }"

echo === Done ===
pause
