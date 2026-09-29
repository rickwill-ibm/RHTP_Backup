#!/usr/bin/env bash
# =============================================================================
# pre-push-check.sh — run EVERYTHING that CI would, and push NOTHING.
#
# WHY THIS EXISTS. `npm run check:all` short-circuits on the first failure, so a
# red lint hides whether the build, the gates and the tests would have passed.
# Before a push you want the OPPOSITE: run every check to completion, then read
# one table. This runs each gate independently, records its exit code, and
# prints a verdict at the end.
#
# IT CANNOT PUSH. Every git call here is read-only (status / diff --stat /
# log / rev-parse). There is no push, commit, add, tag or remote write anywhere
# in this file — grep it and confirm before you trust that sentence.
#
# Usage:
#   bash scripts/pre-push-check.sh              # everything (build included)
#   bash scripts/pre-push-check.sh --fast       # skip `next build` (~4 min)
#   bash scripts/pre-push-check.sh --no-tests   # gates + build only
#
# Exit 0 only when every REQUIRED check passed. LINT IS REQUIRED (LINT_BLOCKING
# defaults to 1). It used to default to 0, justified by "pre-existing lint debt in
# src/uhg/** and src/app/uhg-orchestrate/** (register G-031)" — a reason that could
# not have been true, because .eslintignore already excluded those paths so they
# emitted no findings at all. Two suppressions stacked, and this script printed a
# green PASS beside a label admitting it was excluding things.
# Both are gone as of 2026-09-28: the 24 findings are fixed and the zone is linted.
# Set LINT_BLOCKING=0 only with a reason you can defend out loud.
# =============================================================================

cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 2
ROOT="$(pwd)"

FAST=0
RUN_TESTS=1
for a in "$@"; do
  case "$a" in
    --fast) FAST=1 ;;
    --no-tests) RUN_TESTS=0 ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
  esac
done
LINT_BLOCKING="${LINT_BLOCKING:-1}"

G="\033[0;32m"; R="\033[0;31m"; Y="\033[1;33m"; B="\033[1m"; N="\033[0m"
PASS=(); FAIL=(); WARN=()
LOG="$(mktemp -d)"; trap 'rm -rf "$LOG"' EXIT

# Slugify a label for use as a filename. `${label// /_}` alone is not enough: a
# label containing "/" ("file sizes / quality ratchet") becomes a PATH, the
# redirect fails on a directory that does not exist, and the check is reported
# FAILED when it actually passed. Found by running this script against itself.
slug() { printf '%s' "$1" | tr -c 'A-Za-z0-9._-' '_'; }

run() { # run <label> <required:1|0> <command...>
  local label="$1"; shift
  local required="$1"; shift
  local file; file="$LOG/$(slug "$label").log"
  printf "  %-46s" "$label"
  local start; start=$(date +%s)
  if "$@" > "$file" 2>&1; then
    printf "${G}PASS${N}  %ss\n" "$(( $(date +%s) - start ))"
    PASS+=("$label")
  else
    local code=$?
    if [ "$required" = "1" ]; then
      printf "${R}FAIL${N}  %ss  (exit %s)\n" "$(( $(date +%s) - start ))" "$code"
      FAIL+=("$label")
    else
      printf "${Y}WARN${N}  %ss  (exit %s)\n" "$(( $(date +%s) - start ))" "$code"
      WARN+=("$label")
    fi
  fi
}

echo
echo -e "${B}RHTP pre-push check${N}  —  runs every gate, pushes nothing"
echo    "======================================================================"

# ── 1. Where you are, read-only ──────────────────────────────────────────────
echo
echo -e "${B}Repository state${N} (read-only git)"
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '(not a git repo)')"
echo    "  branch             : $BRANCH"
if git rev-parse --git-dir >/dev/null 2>&1; then
  echo  "  last commit        : $(git log --oneline -1 2>/dev/null)"
  echo  "  modified (tracked) : $(git status --porcelain 2>/dev/null | grep -c '^ M')"
  echo  "  deleted  (tracked) : $(git status --porcelain 2>/dev/null | grep -c '^ D')"
  echo  "  untracked          : $(git status --porcelain 2>/dev/null | grep -c '^??')"
  echo  "  staged             : $(git status --porcelain 2>/dev/null | grep -c '^[MADRC]')"
  # A transfer/scratch directory that is NOT ignored would be committed by a
  # careless `git add -A`. Worth knowing before, not after.
  if [ -d _local-only ] && ! git check-ignore -q _local-only 2>/dev/null; then
    echo -e "  ${Y}WARNING${N}          : _local-only/ exists and is NOT gitignored"
  fi
fi

# ── 2. Static + mechanical gates ─────────────────────────────────────────────
echo
echo -e "${B}Type check and quality ratchet${N}"
run "typescript (tsc --noEmit)"            1 npx tsc --noEmit
run "file sizes / quality ratchet"         1 bash check-file-sizes.sh

echo
echo -e "${B}Enforcement kit${N}"
run "data ref resolution"                  1 node docs/build-provenance/check-ref-resolution.mjs
run "adverse-determination gate"           1 node docs/build-provenance/check-adverse-gate.mjs
run "reviewer qualification (438.210)"     1 node docs/build-provenance/check-reviewer-qualification.mjs
run "45 CFR 92.210 fairness lock"          1 node docs/build-provenance/check-92210.mjs
run "authority narrowing ratchet (G-063)"  1 node docs/build-provenance/check-authority-narrowing.mjs
run "page boundaries (E16 shift-left)"     1 node docs/build-provenance/check-page-boundaries.mjs
run "client-bundle builtins (G-066)"       1 node docs/build-provenance/check-client-bundle.mjs
run "ADL byte-identity + mirror"           1 node tools/adl/verify.mjs
run "seam manifest"                        1 node tools/seams/verify.mjs
run "member substitution"                  1 bash scripts/check-member-substitution.sh
run "named-member hardcoding ratchet"      1 bash scripts/check-maria-hardcoding.sh
run "E13 test-link guard"                  1 node docs/build-provenance/check-testlink.mjs src tests \
      --baseline docs/build-provenance/testlink-baseline.json
run "E14 wired-path guard"                 1 node docs/build-provenance/check-wiring.mjs src \
      --baseline docs/build-provenance/wiring-baseline.json

# ── 3. The build — the gate that is NOT in check:all, and the one that bit ───
if [ "$FAST" = "0" ]; then
  echo
  echo -e "${B}E16 production build${N}  (slow, and the gate that caught G-066)"
  run "next build"                         1 npx next build
else
  echo
  echo -e "  ${Y}SKIPPED${N} next build (--fast). This is the gate that catches a"
  echo -e "          Node builtin reaching the browser bundle. Do not skip it"
  echo -e "          on the run you actually push from."
fi

# ── 4. Tests ─────────────────────────────────────────────────────────────────
if [ "$RUN_TESTS" = "1" ]; then
  echo
  echo -e "${B}Unit tests${N}"
  run "vitest (full suite)"                1 npx vitest run --reporter=dot --silent=true
fi

# ── 5. Lint — reported, not blocking by default ─────────────────────────────
echo
echo -e "${B}Lint${N}  (src/uhg/** + uhg-orchestrate/** now IN SCOPE — G-031 closed 2026-09-28)"
run "eslint"                               "$LINT_BLOCKING" npm run lint

# ── 6. Verdict ───────────────────────────────────────────────────────────────
echo
echo    "======================================================================"
printf "  passed: %s   failed: %s   warned: %s\n" "${#PASS[@]}" "${#FAIL[@]}" "${#WARN[@]}"

for w in "${WARN[@]}"; do
  echo -e "  ${Y}WARN${N}  $w  — not blocking; see the note above"
  tail -n 6 "$LOG/$(slug "$w").log" 2>/dev/null | sed 's/^/        /'
done

if [ "${#FAIL[@]}" -gt 0 ]; then
  echo
  for f in "${FAIL[@]}"; do
    echo -e "  ${R}FAIL${N}  $f"
    tail -n 18 "$LOG/$(slug "$f").log" 2>/dev/null | sed 's/^/        /'
    echo
  done
  echo -e "  ${R}NOT READY TO PUSH${N} — ${#FAIL[@]} required check(s) failed."
  exit 1
fi

echo
echo -e "  ${G}ALL REQUIRED CHECKS PASSED${N} — nothing was pushed."
if [ "${#WARN[@]}" -gt 0 ]; then
  echo -e "  ${Y}Note${N}: ${#WARN[@]} non-blocking warning(s) above. If your CI runs"
  echo -e "        \`npm run check:all\`, lint failing there WILL make the pipeline red,"
  echo -e "        because check:all chains with && and stops at the first failure."
fi
echo
echo    "  To push, run the git commands yourself — this script never will."
exit 0
