@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run_nightly_quality_gate.ps1" %*
endlocal
