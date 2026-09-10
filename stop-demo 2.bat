@echo off
setlocal enabledelayedexpansion

REM ============================================================
REM  RHTP / TCOC Platform  —  Stop / Clean Shutdown
REM
REM  Double-click to stop all running RHTP services:
REM    - RHTP dev server      (port 4029)
REM    - PA Standalone app    (port 4032)
REM    - Installer wizard     (port 9999)
REM    - Docker backbone      (FHIR + MySQL, if running)
REM
REM  Safe to run even if services are not running.
REM ============================================================

set "PROJECT_DIR=%~dp0"
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"

title RHTP Stop

echo.
echo  ================================================
echo   RHTP / TCOC Platform  -  Shutdown
echo  ================================================
echo.

REM ── Kill by port ─────────────────────────────────────────────
for %%P in (4029 4032 9999) do (
    set "KILLED="
    for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":%%P "') do (
        if not "%%a"=="0" (
            taskkill /PID %%a /F >nul 2>&1
            if not errorlevel 1 (
                echo  [OK] Stopped process on port %%P  (PID %%a^)
                set "KILLED=1"
            )
        )
    )
    if not defined KILLED (
        echo  [--] Port %%P  not in use
    )
)

echo.

REM ── Docker backbone ──────────────────────────────────────────
set "COMPOSE_FILE=%PROJECT_DIR%\install\docker-compose.backbone.yml"
if exist "%COMPOSE_FILE%" (
    where docker >nul 2>&1
    if not errorlevel 1 (
        echo  [..] Stopping Docker backbone...
        docker compose -f "%COMPOSE_FILE%" down >nul 2>&1
        if not errorlevel 1 (
            echo  [OK] Docker backbone stopped
        ) else (
            echo  [--] Docker backbone was not running
        )
    ) else (
        echo  [--] Docker not found - skipping backbone stop
    )
) else (
    echo  [--] No Docker compose file found - skipping
)

echo.
echo  ================================================
echo   All RHTP services stopped.
echo  ================================================
echo.
echo   To restart:  double-click  start-demo.bat
echo   To reinstall: run  install.ps1  or  install.bat
echo  ================================================
echo.
pause
