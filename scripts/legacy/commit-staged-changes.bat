@echo off
REM One-time script to commit and push currently staged changes
echo ========================================
echo   Commit and Push Staged Changes
echo ========================================
echo.

REM Check if there are staged changes
git diff --cached --quiet
if errorlevel 1 (
    echo Staged changes detected. Committing...
    git commit -m "Manual commit: Staged changes from %date% %time%"
    if errorlevel 1 (
        echo ERROR: Commit failed!
        pause
        exit /b 1
    )
    echo.
    echo Commit successful! Now pushing to GitHub...
    git push origin main
    if errorlevel 1 (
        echo ERROR: Push failed! Check your network connection and permissions.
        pause
        exit /b 1
    )
    echo.
    echo ========================================
    echo   SUCCESS! Changes pushed to GitHub
    echo ========================================
) else (
    echo No staged changes found.
    echo.
    echo Checking for unstaged changes...
    git diff --quiet
    if errorlevel 1 (
        echo Unstaged changes detected. Run 'git add -A' first, then run this script again.
    ) else (
        echo No changes to commit.
    )
)

echo.
pause

@REM Made with Bob
