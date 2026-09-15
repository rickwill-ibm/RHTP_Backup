@echo off
cd /d "%~dp0"
echo Building WPCO MAC portable demo (mock, standalone) - several minutes...
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0packaging\Make-WPCO-Mac-Portable.ps1"
echo.
echo ===== FINISHED =====  Look in the dist-portable folder (auto-versioned zip + folder).
pause
