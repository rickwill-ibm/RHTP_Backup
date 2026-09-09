#!/bin/bash
# ══════════════════════════════════════════════════════════════════
#  TCOC Auto-Sync with GitHub (Mac/Linux)
#  Bidirectional: pulls remote changes + pushes local changes
#  Also imports FHIR state after every pull
#  Runs every 5 seconds — keep this terminal window open
# ══════════════════════════════════════════════════════════════════

# Find project dir (wherever this script lives)
PROJECT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$PROJECT_DIR" || exit 1

echo "========================================"
echo "  Auto-Sync with GitHub (Bidirectional)"
echo "========================================"
echo ""
echo "Project : $PROJECT_DIR"
echo "Repo    : https://github.com/rickwill-ibm/RHTP-Code-Base"
echo ""
echo "This script will:"
echo "  - Pull changes from GitHub every 5 seconds"
echo "  - Auto-import FHIR state after every pull"
echo "  - Push your changes to GitHub automatically"
echo ""
echo "Press Ctrl+C to stop"
echo "========================================"
echo ""

while true; do
  TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

  # Fetch remote
  git fetch origin main --quiet 2>/dev/null

  # Check for remote changes
  LOCAL=$(git rev-parse HEAD 2>/dev/null)
  REMOTE=$(git rev-parse origin/main 2>/dev/null)

  if [ "$LOCAL" != "$REMOTE" ]; then
    echo "[$TIMESTAMP] Remote changes detected! Pulling..."
    git pull origin main --no-edit --quiet 2>/dev/null
    echo "[$TIMESTAMP] Pull completed - importing FHIR state..."
    node fhir/sync-fhir-state.mjs import > /dev/null 2>&1 \
      && echo "[$TIMESTAMP] FHIR state synced from GitHub!" \
      || echo "[$TIMESTAMP] FHIR import skipped (server may be offline)"
    echo ""
  fi

  # Export FHIR state before checking for local changes
  node fhir/sync-fhir-state.mjs export > /dev/null 2>&1

  # Check for local changes
  git add -A
  if ! git diff-index --quiet HEAD 2>/dev/null; then
    echo "[$TIMESTAMP] Local changes detected! Committing and pushing..."
    git commit -m "Auto-sync: $TIMESTAMP" --quiet 2>/dev/null
    if git push origin main --quiet 2>/dev/null; then
      echo "[$TIMESTAMP] Push completed - team can now see your changes!"
    else
      echo "[$TIMESTAMP] ERROR: Push failed! Check network/permissions."
    fi
    echo ""
  fi

  # Check for unpushed commits
  AHEAD=$(git rev-list --count HEAD ^origin/main 2>/dev/null || echo "0")
  if [ "$AHEAD" -gt "0" ] 2>/dev/null; then
    echo "[$TIMESTAMP] Found $AHEAD unpushed commit(s)! Pushing..."
    git push origin main --quiet 2>/dev/null
    echo "[$TIMESTAMP] Push completed!"
    echo ""
  fi

  echo "[$TIMESTAMP] Monitoring... (next check in 5 seconds)"
  sleep 5
done
