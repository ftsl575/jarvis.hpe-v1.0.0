@echo off
setlocal

echo === Running HPE PartSurfer Batch ===

pushd "%~dp0apps\hpe-partsurfer"
node src\cli.js --input parts_sample.txt --out sample_results.csv --live
popd

echo === Normalizing delimiters ===
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$src = '.\apps\hpe-partsurfer\sample_results.csv';" ^
  "$dst = '.\apps\hpe-partsurfer\sample_results_semicolon.csv';" ^
  "if (Test-Path $src) {Get-Content $src | %% {$_ -replace ',', ';'} | Set-Content -Encoding UTF8 $dst; Write-Host 'Saved semicolon CSV:' $dst} else {Write-Host 'CSV not found'; exit 1}"

echo === Converting CSV to Excel ===
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$csv = Get-ChildItem -Path '.\apps\hpe-partsurfer' -Filter 'sample_results_semicolon.csv' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1;" ^
  "if ($null -eq $csv) { Write-Host 'CSV not found'; exit 1 }" ^
  "$excel = New-Object -ComObject Excel.Application; $excel.Visible=$false;" ^
  "$xlDelimited=1; $xlTextQualifierDoubleQuote=1;" ^
  "$excel.Workbooks.OpenText($csv.FullName, $null, 1, $xlDelimited, $xlTextQualifierDoubleQuote, $false, $false, $false, $true, $false, $false);" ^
  "$wb = $excel.ActiveWorkbook;" ^
  "$out = [System.IO.Path]::ChangeExtension($csv.FullName,'xlsx');" ^
  "$wb.SaveAs($out,51);" ^
  "$wb.Close($true);" ^
  "$excel.Quit();" ^
  "Write-Host ('Saved as ' + $out);"

echo === Done ===
pause
