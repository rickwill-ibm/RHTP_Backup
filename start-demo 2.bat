@echo off
setlocal enabledelayedexpansion

REM ============================================================
REM  RHTP / TCOC Platform  —  Demo Launcher (Mock Mode)
REM
REM  Double-click this file from:
REM    C:\GBS\Clients\State of NY\rhtpdemo\
REM
REM  No FHIR server, no Docker, no API keys required.
REM  Runs entirely on mock / seed data.
REM ============================================================

set "PROJECT_DIR=%~dp0"
REM Strip trailing backslash
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"

title RHTP Demo Launcher

echo.
echo  ================================================
echo   RHTP / TCOC Platform  -  Demo Mode
echo  ================================================
echo   URL :  http://localhost:4029
echo   Mode:  Mock data  (no backend required)
echo  ================================================
echo.

REM ── Prereq: Node.js ──────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Node.js is not installed or not on PATH.
    echo.
    echo  Download from: https://nodejs.org/  (LTS version^)
    echo  After installing, close and re-open this window.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version 2^>nul') do set NODE_VER=%%v
echo  [OK] Node.js %NODE_VER%

REM ── Prereq: package.json ─────────────────────────────────────
if not exist "%PROJECT_DIR%\package.json" (
    echo.
    echo  ERROR: package.json not found.
    echo  Make sure this file is in the rhtpdemo folder.
    echo.
    pause
    exit /b 1
)

REM ── First-run: npm install ────────────────────────────────────
if not exist "%PROJECT_DIR%\node_modules\next" (
    echo  [..] node_modules not found - running npm install...
    echo       (this takes 1-2 minutes on first run^)
    echo.
    cd /d "%PROJECT_DIR%"
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo.
        echo  ERROR: npm install failed. Check the output above.
        pause
        exit /b 1
    )
    echo.
    echo  [OK] Dependencies installed
) else (
    echo  [OK] Dependencies ready
)

REM ── Verify .env.local has mock mode on ───────────────────────
if not exist "%PROJECT_DIR%\.env.local" (
    echo  [!!] .env.local missing - creating with mock mode enabled
    echo NEXT_PUBLIC_USE_MOCK_DATA=true > "%PROJECT_DIR%\.env.local"
)
findstr /i "NEXT_PUBLIC_USE_MOCK_DATA=true" "%PROJECT_DIR%\.env.local" >nul 2>&1
if errorlevel 1 (
    echo  [!!] WARNING: .env.local has USE_MOCK_DATA != true
    echo       The app may attempt to connect to a FHIR server.
    echo       Edit .env.local and set NEXT_PUBLIC_USE_MOCK_DATA=true
    echo       to run in demo mode.
    echo.
)

REM ── Free port 4029 if already in use ─────────────────────────
echo  [..] Checking port 4029...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":4029 "') do (
    echo      Stopping existing process on port 4029 (PID %%a^)
    taskkill /PID %%a /F >nul 2>&1
)
echo  [OK] Port 4029 ready

REM ── Start dev server ─────────────────────────────────────────
echo.
echo  [1/2] Starting RHTP dev server...
cd /d "%PROJECT_DIR%"
start "RHTP Dev Server" cmd /k "cd /d "%PROJECT_DIR%" && npm run dev"

REM ── Wait then open browser ────────────────────────────────────
echo  [2/2] Waiting for server to start (15 seconds^)...
timeout /t 15 /nobreak >nul
start http://localhost:4029

echo.
echo  ================================================
echo   RHTP Demo is running!
echo  ================================================
echo.
echo   Main app:       http://localhost:4029
echo   Demo onboarding:http://localhost:4029/demo-onboarding
echo   Demo deck:      http://localhost:4029/demo-deck (53 steps, 10 personas)
echo   Prior Auth:     http://localhost:4029/prior-auth
echo   CMS-0057-F hub: http://localhost:4029/cms
echo   RHTP Overview:  http://localhost:4029/contract-program-selection
echo.
echo   To stop cleanly:  double-click  stop-demo.bat
echo   (closing the "RHTP Dev Server" window also works but
echo    may leave Node processes running on port 4029)
echo  ================================================
echo.
pause
