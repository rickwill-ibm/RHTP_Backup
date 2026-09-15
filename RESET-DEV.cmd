@echo off
cd /d "%~dp0"
echo Stopping any running Node / Next dev servers...
taskkill /im node.exe /f >nul 2>&1
echo Deleting the .next build folder (overwritten by the production packaging builds)...
if exist ".next" rmdir /s /q ".next"
echo.
echo Starting a CLEAN dev server. Wait for the line that says "Ready", then
echo open (or hard-refresh with Ctrl+Shift+R):  http://localhost:4032
echo.
npm run dev
