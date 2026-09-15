@echo off
cd /d "%~dp0"
echo Building WPCO portable demo (mock) - this takes several minutes...
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0packaging\Make-WPCO-Portable.ps1"
echo.
echo ================  FINISHED  ================
echo If WPCO-Demo-Portable.zip is in this folder, it worked.
pause
