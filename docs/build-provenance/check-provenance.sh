#!/usr/bin/env bash
# E11 - Provenance completeness + maintenance check.
# Fails (non-zero) when the master prompt log has drifted from its generator,
# or when a captured verbatim file is orphaned. Run at every iteration close
# and in CI. This is the mechanical half of E11: the log cannot silently go
# stale or be hand-edited without this turning red.
set -uo pipefail
cd "$(dirname "$0")"

FAIL=0
say(){ printf '%s\n' "$*"; }

# --- 1. Single-source-of-truth: regenerating must reproduce the committed CSV ---
# (Detects hand-edits to the CSV and iterations whose rows were never generated.)
if [ ! -f build_log.py ]; then
  say "FAIL E11.1: no build_log.py generator found - the log has no single source of truth."
  FAIL=1
else
  TMP_COMMITTED="$(mktemp)"; trap 'rm -f "$TMP_COMMITTED"' EXIT
  cp -f PROMPT_MASTER_LOG.csv "$TMP_COMMITTED" 2>/dev/null || true
  python3 build_log.py >/dev/null 2>&1 || { say "FAIL E11.1: build_log.py did not run cleanly."; FAIL=1; }
  if [ -f "$TMP_COMMITTED" ]; then
    if ! diff -q "$TMP_COMMITTED" PROMPT_MASTER_LOG.csv >/dev/null 2>&1; then
      say "FAIL E11.1: committed PROMPT_MASTER_LOG.csv does not match generator output."
      say "           -> the CSV was hand-edited, or the generator was changed without re-syncing."
      say "           -> fix: edit build_log.py (never the CSV), re-run it, and commit the output."
      FAIL=1
    else
      say "ok E11.1: CSV matches its generator (single source of truth, no hand-edits)."
    fi
    rm -f "$TMP_COMMITTED"
  fi
fi

# --- 2. Every verbatim/ file is referenced by at least one log row ---
if [ -d verbatim ]; then
  for vf in verbatim/*.md; do
    [ -e "$vf" ] || continue
    base="$(basename "$vf")"
    case "$base" in README.md) continue;; esac
    if ! grep -q "$base" PROMPT_MASTER_LOG.csv 2>/dev/null; then
      say "FAIL E11.2: verbatim file '$base' is orphaned - no log row points to it."
      FAIL=1
    fi
  done
  [ "$FAIL" -eq 0 ] && say "ok E11.2: every verbatim file is referenced by the log."
fi

# --- 3. No 'pending' rows left once an iteration is declared closed (advisory) ---
PENDING=$(grep -c '"pending"' PROMPT_MASTER_LOG.csv 2>/dev/null); PENDING=${PENDING:-0}
if [ "$PENDING" -gt 0 ]; then
  say "note E11.3: $PENDING row(s) marked fidelity=pending - fine mid-iteration, but must be run (or dropped) before that iteration is declared closed."
fi

# --- 4. Wave-report coverage (optional; runs when the repo root is reachable) ---
# For each ITER*_REPORT.md in the tree, the matching iteration should have rows.
ROOT="${1:-}"
if [ -n "$ROOT" ] && [ -d "$ROOT" ]; then
  while IFS= read -r rep; do
    it=$(printf '%s' "$rep" | grep -oiE 'ITER([0-9]+[A-Za-z-]*)' | head -1 | sed -E 's/ITER//I')
    [ -z "$it" ] && continue
    if ! grep -qi "\"$it\"" PROMPT_MASTER_LOG.csv 2>/dev/null; then
      say "FAIL E11.4: wave report '$rep' has no rows for iteration $it in the log."
      FAIL=1
    fi
  done < <(find "$ROOT" -maxdepth 3 -iname 'ITER*REPORT*.md' 2>/dev/null)
fi

if [ "$FAIL" -eq 0 ]; then
  say "PASS: provenance is complete and current (E11)."
else
  say "PROVENANCE CHECK FAILED (E11) - treat like a failing test: fix before closing the iteration."
fi
exit $FAIL
