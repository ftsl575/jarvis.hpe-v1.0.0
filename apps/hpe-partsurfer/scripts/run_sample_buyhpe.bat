@echo off
setlocal

if "%~1"=="" (
  echo Usage: run_sample_buyhpe.bat ^<SKU^>
  exit /b 1
)

cd /d "C:\Users\G\Desktop\jarvis.hpe v1.0.0\apps\hpe-partsurfer" || exit /b 1

node --experimental-vm-modules .\src\runSampleBuyHpe.mjs "%~1"

endlocal
