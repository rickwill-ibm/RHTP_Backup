#!/bin/bash

# RHTP Push to GitHub Script
# This script commits and pushes local changes to GitHub
# Author: Bob (AI Assistant)
# Created: June 19, 2026

set -e  # Exit on any error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="$HOME/Desktop/RHTP_V2.0_FINAL_BACKUP_061726_MariaRedhawk 2"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         RHTP Push to GitHub Script                        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Navigate to project directory
echo -e "${YELLOW}[1/5] Navigating to project directory...${NC}"
cd "$PROJECT_DIR"
echo -e "${GREEN}✓ In directory: $(pwd)${NC}"
echo ""

# Check for changes
echo -e "${YELLOW}[2/5] Checking for changes...${NC}"
if git diff --quiet && git diff --cached --quiet; then
    echo -e "${YELLOW}⚠ No changes to commit${NC}"
    echo ""
    echo -e "${BLUE}Current status:${NC}"
    git status
    exit 0
fi

echo -e "${GREEN}✓ Changes detected${NC}"
echo ""
echo -e "${BLUE}Changed files:${NC}"
git status --short
echo ""

# Get commit message from user
echo -e "${YELLOW}[3/5] Enter commit message (or press Enter for default):${NC}"
read -p "Commit message: " COMMIT_MSG

if [ -z "$COMMIT_MSG" ]; then
    COMMIT_MSG="Update RHTP - $(date '+%Y-%m-%d %H:%M:%S')"
    echo -e "${BLUE}Using default message: $COMMIT_MSG${NC}"
fi
echo ""

# Stage all changes
echo -e "${YELLOW}[4/5] Staging all changes...${NC}"
git add -A
echo -e "${GREEN}✓ All changes staged${NC}"
echo ""

# Commit and push
echo -e "${YELLOW}[5/5] Committing and pushing to GitHub...${NC}"
git commit -m "$COMMIT_MSG"
git push origin main
echo -e "${GREEN}✓ Successfully pushed to GitHub!${NC}"
echo ""

echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✓ Changes Pushed to GitHub Successfully!                 ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Repository: ${GREEN}https://github.com/rickwill-ibm/RHTP-Code-Base.git${NC}"
echo -e "${BLUE}Branch: ${GREEN}main${NC}"
echo ""

# Made with Bob
