#!/usr/bin/env bash
# =============================================================================
# check-file-sizes.sh
# AI-CODING-CONVENTIONS §2 + §3 enforcement — file size caps with quality ratchet.
#
# Exits 0 when no NEW violations exist and no baselined file has GROWN.
# Legacy violations recorded in quality-baseline.json are frozen, not failed.
#
# Usage
#   bash check-file-sizes.sh                    # gate: fail on new/grown only
#   bash check-file-sizes.sh --write-baseline   # (re)generate quality-baseline.json
#   bash check-file-sizes.sh src/lib            # gate a specific directory
#
# Limits (mirrors AI-CODING-CONVENTIONS.md §2):
#   Production code (src/**): 400 lines | Tests (tests/**, e2e/**): 500 lines
#   Generated / seed / reviewed-exempt files: see EXEMPT_PATTERNS
#
# Ratchet rules (AI-CODING-CONVENTIONS.md §3):
#   - quality-baseline.json lists known-over-cap legacy files with their counts
#   - a file NOT in the baseline that breaches the cap  -> FAIL (new violation)
#   - a baselined file whose count EXCEEDS its baseline -> FAIL (ratchet moved back)
#   - a baselined file at or under its baseline         -> reported, not failed
#   - regenerate the baseline ONLY in refactor-only PRs; the count may only shrink
# =============================================================================

set -euo pipefail

PROD_LIMIT=400
TEST_LIMIT=500
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASELINE_FILE="$SCRIPT_DIR/quality-baseline.json"

WRITE_BASELINE=0
SCAN_DIRS=()
for arg in "$@"; do
  if [[ "$arg" == "--write-baseline" ]]; then
    WRITE_BASELINE=1
  else
    SCAN_DIRS+=("$arg")
  fi
done
if [[ ${#SCAN_DIRS[@]} -eq 0 ]]; then
  # `tools`, `scripts` and `docs/build-provenance` were OUTSIDE this scan (register G-062), and
  # `.mjs`/`.sh` were outside EXTENSIONS. So every enforcement gate this repo runs — the plain-node
  # ADL mirror that `adl:check` executes, `ci-gates.sh` itself, and all nine `check-*.mjs` — was the
  # one part of the codebase with no size cap and no ratchet. The files that police the ratchet were
  # the files the ratchet could not see.
  SCAN_DIRS=("src" "tests" "e2e" "tools" "scripts" "docs/build-provenance")
fi

EXTENSIONS=("ts" "tsx" "js" "jsx" "mjs" "sh")

# Genuinely exempt: data, generated artefacts, template/copy generators.
# Reviewed-monolith page exemptions from v1 have been MIGRATED to the baseline —
# the ratchet also catches growth in those files, which patterns never could.
EXEMPT_PATTERNS=(
  "*/data/*.json"
  "*/data/*.yaml"
  "tools/seed/*"
  "*.generated.ts"
  "*.generated.tsx"
  "*.seed.json"
  "*/generateDetailedScreenPDF*.ts"
  "*/generateTalkTrackPDF*.ts"
  "*/AppLayout.nav.ts"
)

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
RESET='\033[0m'

line_count() {
  wc -l < "$1" 2>/dev/null || true
}

is_exempt() {
  local file="$1"
  for pattern in "${EXEMPT_PATTERNS[@]}"; do
    # shellcheck disable=SC2053
    [[ "$file" == $pattern ]] && return 0
  done
  return 1
}

is_test_file() {
  local file="$1"
  [[ "$file" == tests/* || "$file" == e2e/* || "$file" =~ \.test\.(ts|tsx|js|jsx)$ || "$file" =~ \.spec\.(ts|tsx|js|jsx)$ ]]
}

limit_for() {
  is_test_file "$1" && echo "$TEST_LIMIT" || echo "$PROD_LIMIT"
}

baseline_count() {
  # Returns the baselined line count for a file, or empty if not baselined.
  local file="$1"
  [[ -f "$BASELINE_FILE" ]] || return 0
  grep -F "\"$file\":" "$BASELINE_FILE" 2>/dev/null | head -1 | sed -E 's/.*:[[:space:]]*([0-9]+),?[[:space:]]*$/\1/' || true
}

violations=()
legacy=()
warnings=()
over_entries=()
checked=0

for dir in "${SCAN_DIRS[@]}"; do
  [[ -d "$dir" ]] || continue
  for ext in "${EXTENSIONS[@]}"; do
    while IFS= read -r -d '' file; do
      is_exempt "$file" && continue
      limit=$(limit_for "$file")
      count=$(line_count "$file")
      ((checked++)) || true

      if (( count > limit )); then
        over_entries+=("    \"$file\": $count")
        base="$(baseline_count "$file")"
        if [[ -z "$base" ]]; then
          violations+=("$(printf "%-78s %5d / %d lines  <- NEW violation" "$file" "$count" "$limit")")
        elif (( count > base )); then
          violations+=("$(printf "%-78s %5d lines  <- GREW past baseline (%d)" "$file" "$count" "$base")")
        else
          legacy+=("$file ($count)")
        fi
      elif (( count > limit * 85 / 100 )); then
        warnings+=("$(printf "%-78s %5d / %d lines  <- approaching cap" "$file" "$count" "$limit")")
      fi
    done < <(find "$dir" -name "*.$ext" -print0 2>/dev/null)
  done
done

if [[ $WRITE_BASELINE -eq 1 ]]; then
  {
    echo "{"
    echo "  \"_comment\": \"Quality ratchet baseline (AI-CODING-CONVENTIONS §3). Frozen legacy over-cap files with their line counts. May only shrink. Regenerate ONLY in a refactor-only PR: bash check-file-sizes.sh --write-baseline\","
    echo "  \"files\": {"
    total=${#over_entries[@]}
    for i in "${!over_entries[@]}"; do
      if (( i < total - 1 )); then echo "${over_entries[$i]},"; else echo "${over_entries[$i]}"; fi
    done
    echo "  }"
    echo "}"
  } > "$BASELINE_FILE"
  echo -e "${CYAN}Baseline written: $BASELINE_FILE (${#over_entries[@]} legacy over-cap files frozen).${RESET}"
  exit 0
fi

echo ""
echo "=================================================================="
echo "  AI-CODING-CONVENTIONS v2 - File Size Gate + Quality Ratchet"
echo "  Production cap: ${PROD_LIMIT} | Test cap: ${TEST_LIMIT} | Files checked: ${checked}"
echo "  Baselined legacy files (frozen): ${#legacy[@]}"
echo "=================================================================="

if [[ ${#warnings[@]} -gt 0 ]]; then
  echo ""
  echo -e "${YELLOW}  Approaching the cap (> 85% of limit):${RESET}"
  for w in "${warnings[@]}"; do echo -e "${YELLOW}     $w${RESET}"; done
fi

if [[ ${#violations[@]} -gt 0 ]]; then
  echo ""
  echo -e "${RED}  RATCHET FAILURES - new violations or growth in frozen files:${RESET}"
  for v in "${violations[@]}"; do echo -e "${RED}     $v${RESET}"; done
  echo ""
  echo -e "${RED}  FAILED - ${#violations[@]} ratchet breach(es).${RESET}"
  echo ""
  echo "  Remediation (AI-CODING-CONVENTIONS.md v2 sec 2-3):"
  echo "   1. New file over cap: split by responsibility before merging."
  echo "   2. Baselined file grew: move your addition into a new compliant module"
  echo "      and call it from the legacy file. Never grow a frozen file."
  echo "   3. Data goes to data/*.json; domain logic to src/lib/<domain>/."
  echo "   4. Then: npx tsc --noEmit && npx vitest run"
  echo ""
  exit 1
fi

echo ""
echo -e "${GREEN}  PASS - no new violations; ratchet intact (${#legacy[@]} frozen legacy files unchanged or smaller).${RESET}"
echo ""
exit 0
