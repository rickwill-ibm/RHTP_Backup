@echo off
cd /d "%~dp0"
echo FAST standalone Windows build (small, ~1-2 min zip)...
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0packaging\Make-WPCO-Win-Standalone.ps1"
echo.
echo ===== FINISHED =====  Look in the dist-portable folder (auto-versioned zip + folder).
pause
