@echo off
REM TCOC Application Launcher
REM This script starts the Next.js development server and opens the app in your browser

echo Starting TCOC Application...
echo.

REM Change to the project directory
cd /d "%~dp0"

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    echo.
)

REM Start the development server in a new window
start "TCOC Server" cmd /k "npm run dev"

REM Wait for server to start (5 seconds)
echo Waiting for server to start...
timeout /t 5 /nobreak >nul

REM Open the application in default browser
echo Opening application in browser...
start http://localhost:4029

echo.
echo TCOC Application is now running!
echo Server window will remain open - DO NOT CLOSE IT
echo Close the server window when you're done using the app
echo.

@REM Made with Bob
