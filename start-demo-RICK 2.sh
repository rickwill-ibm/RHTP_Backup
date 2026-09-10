#!/bin/bash
# ══════════════════════════════════════════════════════════════════
#  RICK - TCOC Demo Launcher (Mac/Linux)
#
#  FIRST TIME SETUP (do this once):
#  1. Install Git:       https://git-scm.com
#  2. Install Node.js:   https://nodejs.org  (v18 or higher)
#  3. Install Docker:    https://www.docker.com/products/docker-desktop
#  4. Clone the repo:
#       git clone https://github.com/rickwill-ibm/RHTP-Code-Base.git
#  5. Edit the PROJECT_DIR line below to point to the tcoc folder
#
#  Example:
#    PROJECT_DIR="/Users/rick/Documents/RHTP-Code-Base/tcoc"
#
#  6. Make this script executable (one time):
#       chmod +x start-demo-RICK.sh
#
#  EVERY SESSION: just double-click or run:
#       ./start-demo-RICK.sh
# ══════════════════════════════════════════════════════════════════
PROJECT_DIR="/EDIT_THIS_PATH/RHTP-Code-Base/tcoc"
# ══════════════════════════════════════════════════════════════════

echo "========================================"
echo "  TCOC Demo Startup with Auto-Sync"
echo "  For: Rick"
echo "========================================"
echo ""
echo "Project : $PROJECT_DIR"
echo "App URL : http://localhost:4029"
echo "Repo    : https://github.com/rickwill-ibm/RHTP-Code-Base"
echo ""

# Verify project folder exists
if [ ! -f "$PROJECT_DIR/package.json" ]; then
  echo "-------------------------------------------------------"
  echo " ERROR: Project not found at:"
  echo "   $PROJECT_DIR"
  echo ""
  echo " Open this file in a text editor and update the"
  echo " PROJECT_DIR line near the top to point to your"
  echo " cloned repo folder."
  echo ""
  echo " Example:"
  echo '   PROJECT_DIR="/Users/rick/Documents/RHTP-Code-Base/tcoc"'
  echo "-------------------------------------------------------"
  read -p "Press Enter to exit..."
  exit 1
fi

# Move into project folder
cd "$PROJECT_DIR" || exit 1

# Install node_modules if missing
if [ ! -d "$PROJECT_DIR/node_modules" ]; then
  echo "[0/3] node_modules not found - installing dependencies..."
  npm install
  echo "    Dependencies installed"
  echo ""
fi

# Kill anything on port 4029
echo "Checking port 4029..."
lsof -ti:4029 | xargs kill -9 2>/dev/null && echo "    Stopped existing server on port 4029" || echo "    Port 4029 is free"
echo ""

# Start auto-sync in a new terminal tab
echo "[1/3] Starting auto-sync with GitHub..."
osascript -e "tell application \"Terminal\" to do script \"cd '$PROJECT_DIR' && bash auto-sync-github.sh\"" 2>/dev/null \
  || (bash auto-sync-github.sh &)
sleep 2
echo "    Auto-sync running (push/pull every 5 seconds)"
echo ""

# Start Next.js dev server in a new terminal tab
echo "[2/3] Starting Next.js dev server..."
osascript -e "tell application \"Terminal\" to do script \"cd '$PROJECT_DIR' && npm run dev\"" 2>/dev/null \
  || (npm run dev &)
echo "    Dev server starting..."
echo ""

# Wait then open browser
echo "[3/3] Waiting for server to be ready..."
sleep 10
echo "    Opening browser..."
open http://localhost:4029 2>/dev/null || xdg-open http://localhost:4029 2>/dev/null

echo ""
echo "========================================"
echo "  All systems running!"
echo "========================================"
echo ""
echo "  Auto-sync : Terminal window (push/pull every 5s)"
echo "  Dev server: Terminal window (http://localhost:4029)"
echo "  Changes from Jon will appear within ~10-15 seconds"
echo ""
echo "To stop: close the Terminal windows that opened"
