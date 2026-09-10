#!/bin/bash

# RHTP Auto Backup to GitHub Script
# This script automatically commits and pushes changes to GitHub

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REPO_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
GITHUB_REPO="https://github.com/rickwill-ibm/RHTP-Code-Base.git"
BRANCH="main"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}RHTP Auto Backup to GitHub${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Navigate to repository directory
cd "$REPO_DIR"
echo -e "${YELLOW}📁 Working directory: $REPO_DIR${NC}"
echo ""

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo -e "${RED}❌ Error: Not a git repository${NC}"
    echo -e "${YELLOW}Run: git init${NC}"
    exit 1
fi

# Check for uncommitted changes
if [[ -z $(git status -s) ]]; then
    echo -e "${GREEN}✅ No changes to commit${NC}"
    echo -e "${YELLOW}Repository is up to date${NC}"
    exit 0
fi

# Show status
echo -e "${YELLOW}📊 Current status:${NC}"
git status --short
echo ""

# Add all changes
echo -e "${YELLOW}➕ Adding all changes...${NC}"
git add -A

# Generate commit message with timestamp
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
COMMIT_MSG="Auto backup: $TIMESTAMP"

# Allow custom commit message as first argument
if [ ! -z "$1" ]; then
    COMMIT_MSG="$1"
fi

echo -e "${YELLOW}💾 Committing changes...${NC}"
echo -e "${BLUE}Message: $COMMIT_MSG${NC}"
git commit -m "$COMMIT_MSG"
echo ""

# Check if remote exists
if ! git remote | grep -q "origin"; then
    echo -e "${YELLOW}🔗 Adding remote origin...${NC}"
    git remote add origin "$GITHUB_REPO"
fi

# Verify remote
CURRENT_REMOTE=$(git remote get-url origin 2>/dev/null || echo "none")
if [ "$CURRENT_REMOTE" != "$GITHUB_REPO" ]; then
    echo -e "${YELLOW}🔄 Updating remote URL...${NC}"
    git remote set-url origin "$GITHUB_REPO"
fi

echo -e "${YELLOW}🚀 Pushing to GitHub...${NC}"
echo -e "${BLUE}Remote: $GITHUB_REPO${NC}"
echo -e "${BLUE}Branch: $BRANCH${NC}"
echo ""

# Try to push
if git push -u origin "$BRANCH" 2>&1; then
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}✅ SUCCESS! Backup pushed to GitHub${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "${BLUE}Repository: $GITHUB_REPO${NC}"
    echo -e "${BLUE}Branch: $BRANCH${NC}"
    echo -e "${BLUE}Commit: $COMMIT_MSG${NC}"
    echo ""
else
    echo ""
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}❌ PUSH FAILED${NC}"
    echo -e "${RED}========================================${NC}"
    echo ""
    echo -e "${YELLOW}Common solutions:${NC}"
    echo ""
    echo -e "${YELLOW}1. Authentication Required:${NC}"
    echo -e "   Run: ${BLUE}gh auth login${NC}"
    echo -e "   Or set up SSH keys"
    echo ""
    echo -e "${YELLOW}2. Use Personal Access Token:${NC}"
    echo -e "   ${BLUE}git remote set-url origin https://YOUR_TOKEN@github.com/rickwill-ibm/RHTP-Code-Base.git${NC}"
    echo ""
    echo -e "${YELLOW}3. Manual Push:${NC}"
    echo -e "   ${BLUE}git push -u origin main${NC}"
    echo ""
    exit 1
fi

# Made with Bob
