param(
  [string]$InputDir = ".\apps\hpe-partsurfer",
  [string]$OutputName = "sample_results_classified.csv"
)

# найти последний CSV
$csv = Get-ChildItem -Path $InputDir -Filter "sample_results*.csv" -File |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $csv) { Write-Error "No CSV found in $InputDir"; exit 1 }

# всегда использовать ";" как разделитель
$delimiter = ";"

function Get-SourceLabel {
  param([string]$sourcePage, [string]$url)
  if ($sourcePage -match "Photo" -or $url -match "ShowPhoto\.aspx") { return "Photo HPE PartSurfer" }
  if ($sourcePage -match "Search" -or $url -match "partsurfer\.hpe\.com") { return "HPE PartSurfer" }
  if ($sourcePage -match "buy\.hpe\.com") { return "buy.hpe.com" }
  return "Another"
}

$rows = Import-Csv -Path $csv.FullName -Delimiter ","  # читаем исходный (всегда с запятой)
$updated = foreach ($r in $rows) {
  $srcLabel = Get-SourceLabel -sourcePage $r.source_page -url $r.image_url
  $r.source_page = $srcLabel
  $r
}

$outPath = Join-Path $csv.DirectoryName $OutputName
$updated | Export-Csv -Path $outPath -Delimiter $delimiter -Encoding UTF8 -NoTypeInformation
Write-Host "Saved:" (Resolve-Path $outPath)
