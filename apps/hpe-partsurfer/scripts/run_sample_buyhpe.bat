@echo off
setlocal

if "%~1"=="" (
  echo Usage: run_sample_buyhpe.bat ^<SKU^>
  exit /b 1
)

set "SKU=%~1"
set "ROOT=%~dp0.."
pushd "%ROOT%"

node --input-type=module -e "const sku = process.argv[1]; import('../src/providerBuyHpe.js').then(async (mod) => { const result = await mod.providerBuyHpe(sku, { live: true }); console.log(JSON.stringify(result, null, 2)); }).catch((error) => { console.error(error); process.exit(1); });" "%SKU%"

popd
endlocal
