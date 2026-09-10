@echo off
REM Auto-push to GitHub - Watches for file changes and automatically commits/pushes

echo Starting Auto-Push to GitHub...
echo Monitoring directory: %CD%
echo Press Ctrl+C to stop
echo.

:loop
REM Add all changes
git add -A

REM Check if there are changes to commit
git diff-index --quiet HEAD
if errorlevel 1 (
    REM There are changes, commit and push
    echo [%date% %time%] Changes detected, committing and pushing...
    git commit -m "Auto-commit: %date% %time%"
    git push origin main
    echo [%date% %time%] Push completed!
    echo.
)

REM Wait 10 seconds before checking again
timeout /t 10 /nobreak >nul
goto loop

@REM Made with Bob
