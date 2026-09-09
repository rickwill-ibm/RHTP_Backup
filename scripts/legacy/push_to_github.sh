#!/bin/bash

# Script to push RHTP code to GitHub
# This will prompt you for your GitHub credentials

echo "=========================================="
echo "Pushing RHTP V2.0 to GitHub"
echo "Repository: https://github.com/rickwill-ibm/RHTP-Code-Base"
echo "=========================================="
echo ""
echo "You will be prompted for your GitHub username and password/token"
echo "Note: Use a Personal Access Token instead of your password"
echo "Generate one at: https://github.com/settings/tokens"
echo ""

# Navigate to the project directory
cd "$(dirname "$0")"

# Ensure we're using HTTPS URL
git remote set-url origin https://github.com/rickwill-ibm/RHTP-Code-Base.git

# Push to GitHub
echo "Pushing to GitHub..."
git push -u origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "✅ Successfully pushed to GitHub!"
    echo "View your repository at:"
    echo "https://github.com/rickwill-ibm/RHTP-Code-Base"
    echo "=========================================="
else
    echo ""
    echo "=========================================="
    echo "❌ Push failed. Please check your credentials."
    echo "=========================================="
    exit 1
fi

# Made with Bob
