@echo off
setlocal enabledelayedexpansion
REM Auto-Sync with GitHub - Bidirectional sync (push AND pull)
REM This script automatically pushes your changes and pulls others' changes

echo ========================================
echo   Auto-Sync with GitHub (Bidirectional)
echo ========================================
echo.
echo Monitoring: %CD%
echo Repository: https://github.com/rickwill-ibm/RHTP-Code-Base
echo.
echo This script will:
echo   - Pull changes from GitHub every 5 seconds
echo   - Push your changes to GitHub automatically
echo   - Auto-import FHIR state after every pull
echo   - Auto-export FHIR state before every push
echo   - Keep you in sync with your team in real-time
echo.
echo Press Ctrl+C to stop
echo ========================================
echo.

:loop
REM First, pull any changes from GitHub
echo [%date% %time%] Checking for remote changes...
git fetch origin main

REM Check if there are remote changes
git diff --quiet HEAD origin/main
if errorlevel 1 (
    echo [%date% %time%] Remote changes detected! Pulling...
    git pull origin main --no-edit
    echo [%date% %time%] Pull completed - importing FHIR state...
    node fhir/sync-fhir-state.mjs import >nul 2>&1
    if errorlevel 1 (
        echo [%date% %time%] FHIR import skipped (server may be offline)
    ) else (
        echo [%date% %time%] FHIR state synced from GitHub!
    )
    echo.
)

REM Now check for local changes to push
git add -A

REM Export FHIR state before committing so latest data goes up with the push
node fhir/sync-fhir-state.mjs export >nul 2>&1

REM Check if there are any changes to commit (including fhir-state.json)
git add -A
git diff-index --quiet HEAD
if errorlevel 1 (
    echo [%date% %time%] Local changes detected! Committing and pushing...
    git commit -m "Auto-sync: %date% %time%" 2>&1
    if errorlevel 1 (
        echo [%date% %time%] ERROR: Commit failed! Check git status.
        echo.
    ) else (
        git push origin main 2>&1
        if errorlevel 1 (
            echo [%date% %time%] ERROR: Push failed! Check network/permissions.
            echo.
        ) else (
            echo [%date% %time%] Push completed - team can now see your changes!
            echo.
        )
    )
    goto :continue_loop
)

REM Check if there are already committed changes that need to be pushed
for /f %%i in ('git rev-list --count HEAD ^origin/main 2^>nul') do set AHEAD=%%i
if defined AHEAD (
    if not "!AHEAD!"=="0" (
        echo [%date% %time%] Found !AHEAD! unpushed commit(s)! Pushing...
        git push origin main
        echo [%date% %time%] Push completed - team can now see your changes!
        echo.
    )
)

:continue_loop

REM Wait 5 seconds before next sync
echo [%date% %time%] Monitoring... (next check in 5 seconds)
timeout /t 5 /nobreak >nul
goto loop

@REM Made with Bob
