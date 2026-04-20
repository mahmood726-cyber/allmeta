@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run_latest_glmm_metafor_crosscheck.ps1" %*
endlocal
