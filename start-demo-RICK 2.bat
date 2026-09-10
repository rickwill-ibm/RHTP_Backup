@echo off
setlocal enabledelayedexpansion

REM ??????????????????????????????????????????????????????????????????
REM  RICK - TCOC Demo Launcher
REM
REM  FIRST TIME SETUP (do this once):
REM  1. Clone the repo:
REM       git clone https://github.com/rickwill-ibm/RHTP-Code-Base.git
REM  2. Edit the PROJECT_DIR line below to point to the tcoc folder
REM     inside wherever you cloned it.
REM
REM  Example:
REM    set "PROJECT_DIR=C:\Users\Rick\Documents\RHTP-Code-Base\tcoc"
REM
REM  EVERY SESSION: Just double-click this file. That's it.
REM ??????????????????????????????????????????????????????????????????
set "PROJECT_DIR=C:\EDIT_THIS_PATH\RHTP-Code-Base\tcoc"
REM ??????????????????????????????????????????????????????????????????

echo ========================================
echo   TCOC Demo Startup with Auto-Sync
echo   For: Rick
echo ========================================
echo.
echo Project:    %PROJECT_DIR%
echo App URL:    http://localhost:4029
echo Repo:       https://github.com/rickwill-ibm/RHTP-Code-Base
echo.

REM Verify the project folder exists
if not exist "%PROJECT_DIR%\package.json" (
    echo -------------------------------------------------------
    echo  ERROR: Project not found at:
    echo    %PROJECT_DIR%
    echo.
    echo  Open this file in Notepad and update the PROJECT_DIR
    echo  line near the top to point to your cloned repo folder.
    echo.
    echo  Example:
    echo    set "PROJECT_DIR=C:\Users\Rick\Documents\RHTP-Code-Base\tcoc"
    echo -------------------------------------------------------
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
echo   Port 4029 is free
echo.

REM Install dependencies if missing
if not exist "%PROJECT_DIR%\node_modules" (
    echo [0/3] node_modules not found - installing dependencies...
    call npm install
    echo     Dependencies installed
    echo.
)

REM Write helper bats to TEMP (handles spaces in folder paths)
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
echo     Auto-sync running (push and pull every 5 seconds)
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
echo     Browser opened to http://localhost:4029
echo.

echo ========================================
echo   All systems running!
echo ========================================
echo.
echo   Auto-sync : TCOC Auto-Sync window  (push/pull every 5s)
echo   Dev server: TCOC Dev Server window (http://localhost:4029)
echo.
echo   Changes you see will reflect what Jon pushes in real-time.
echo   Close both windows above when you are done.
echo.
pause >nul
