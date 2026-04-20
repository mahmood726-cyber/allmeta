@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run_preregistered_oracle_pack.ps1" %*
endlocal
