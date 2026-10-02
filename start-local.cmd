@echo off
cd /d "%~dp0"
set "ROOM108_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%ROOM108_NODE%" (
  "%ROOM108_NODE%" server.cjs --lan
) else (
  node server.cjs --lan
)
pause
