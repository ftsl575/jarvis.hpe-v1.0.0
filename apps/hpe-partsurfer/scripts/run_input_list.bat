@echo off
setlocal

if "%~1"=="" (
  echo Usage: run_input_list.bat "C:\Users\G\Desktop\jarvis.hpe v1.0.0\input data\list1.txt" "C:\Users\G\Desktop\jarvis.hpe v1.0.0\input data\buyhpe_output"
  exit /b 1
)

if "%~2"=="" (
  echo Usage: run_input_list.bat "C:\Users\G\Desktop\jarvis.hpe v1.0.0\input data\list1.txt" "C:\Users\G\Desktop\jarvis.hpe v1.0.0\input data\buyhpe_output"
  exit /b 1
)

cd /d "C:\Users\G\Desktop\jarvis.hpe v1.0.0\apps\hpe-partsurfer" || exit /b 1

node --experimental-vm-modules .\src\cliProcessInputList.mjs --in "%~1" --out "%~2"

endlocal
