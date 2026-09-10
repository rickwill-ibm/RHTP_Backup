@echo off
setlocal enabledelayedexpansion

REM ?? EDIT THIS LINE to match where you cloned the repo ?????????????????????
set "PROJECT_DIR=C:\Users\5J0601897\Desktop\BOB Project - 052926\tcoc"
REM ??????????????????????????????????????????????????????????????????????????

echo ========================================
echo   TCOC Demo Startup with Auto-Sync
echo ========================================
echo.
echo Project:    %PROJECT_DIR%
echo App URL:    http://localhost:4029
echo.

REM Verify the project folder exists
if not exist "%PROJECT_DIR%\package.json" (
    echo ERROR: Project not found at:
    echo   %PROJECT_DIR%
    echo.
    echo Edit this .bat file and update the PROJECT_DIR line at the top.
    echo.
    pause
    exit /b 1
)

REM Move into the project folder
cd /d "%PROJECT_DIR%"

REM Kill anything already running on port 4029
echo Checking port 4029...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":4029 " 2^>nul') do (
    echo   Stopping existing server (PID %%a)...
    taskkill /PID %%a /F >nul 2>&1
)
echo     Port 4029 is free
echo.

REM Install dependencies if missing
if not exist "%PROJECT_DIR%\node_modules" (
    echo [0/3] Installing dependencies...
    call npm install
    echo     Dependencies installed
    echo.
)

REM Write helper bats to TEMP (avoids spaces-in-path issues)
set "HELPER1=%TEMP%\tcoc_autosync.bat"
echo @echo off > "%HELPER1%"
echo cd /d "%PROJECT_DIR%" >> "%HELPER1%"
echo call "%PROJECT_DIR%\auto-sync-github.bat" >> "%HELPER1%"

set "HELPER2=%TEMP%\tcoc_devserver.bat"
echo @echo off > "%HELPER2%"
echo cd /d "%PROJECT_DIR%" >> "%HELPER2%"
echo npm run dev >> "%HELPER2%"

REM Start auto-sync in its own window
echo [1/3] Starting auto-sync with GitHub...
start "TCOC Auto-Sync" cmd /k "%HELPER1%"
timeout /t 2 /nobreak >nul
echo     Auto-sync running
echo.

REM Start Next.js dev server in its own window
echo [2/3] Starting Next.js dev server...
start "TCOC Dev Server" cmd /k "%HELPER2%"
echo     Dev server starting...
echo.

REM Wait then open browser
echo [3/3] Waiting for server to be ready...
timeout /t 10 /nobreak >nul
start http://localhost:4029
echo     Browser opened
echo.

echo ========================================
echo   All systems running!
echo ========================================
echo.
echo   Auto-sync : TCOC Auto-Sync window  (push/pull every 5s)
echo   Dev server: TCOC Dev Server window (http://localhost:4029)
echo.
echo Close both windows above when done.
echo.
pause >nul
