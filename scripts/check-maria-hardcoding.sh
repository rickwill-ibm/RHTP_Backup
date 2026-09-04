#!/usr/bin/env bash
# Wave 0 — Maria de-hardcoding ratchet.
# Counts golden-persona literals baked into SCREEN code (src/app render layer).
# Data/engine files legitimately carry Maria's record and are excluded. As screens
# convert to member-derived, this count may only SHRINK — never grow. Mirrors the
# existing file-size ratchet discipline.
set -euo pipefail
cd "$(dirname "$0")/.."

# Golden-persona literals that must not be hardcoded into screen render code.
PATTERN="Maria Redhawk|MARIA_SD_001|'Sofia'|'Sophia'|Sophia Redhawk|Elena Redhawk|'Elena'"

# Screen layer only; exclude the data/engine/registry/demo-fixture sources where the
# golden record legitimately lives.
count() {
  grep -rniE "$PATTERN" src/app --include=*.tsx \
    | grep -v "/__" \
    | grep -vc "MemberScopeNotice" || true
}

BASELINE_FILE="scripts/maria-hardcoding-baseline.txt"
CURRENT=$(count)

if [[ ! -f "$BASELINE_FILE" ]]; then
  echo "$CURRENT" > "$BASELINE_FILE"
  echo "[maria-ratchet] froze baseline: $CURRENT hardcoded references across screens"
  exit 0
fi

BASELINE=$(cat "$BASELINE_FILE")
echo "[maria-ratchet] baseline=$BASELINE current=$CURRENT"
if (( CURRENT > BASELINE )); then
  echo "FAIL: Maria hardcoding increased ($BASELINE -> $CURRENT). Screens must derive from the active member."
  exit 1
fi
if (( CURRENT < BASELINE )); then
  echo "PROGRESS: hardcoding reduced ($BASELINE -> $CURRENT). Update baseline to lock the gain:"
  echo "  echo $CURRENT > $BASELINE_FILE"
fi
echo "OK"
