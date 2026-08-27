#!/usr/bin/env bash
# =============================================================================
# ci-gates.sh - the SINGLE canonical definition of "green" for this repo.
# Agentic Build Framework v1.6 §1 (gate parity: local == CI).
#
# CI runs:            bash scripts/ci-gates.sh ci
# pre-push hook runs: bash scripts/ci-gates.sh push
# pre-commit runs the fast rungs inline (tools/hooks/pre-commit).
# Because CI and local invoke the SAME script, the two can never drift - every
# "passed locally, failed CI" surprise this file exists to prevent.
#
# Tiers (each a superset of the previous):
#   fast      : types, sizes+ratchet, lint(changed), test-link E13, page-boundaries, skill-mirror (~seconds)
#   push      : + unit tests, wiring E14, provenance E11                      (~1 min)
#   pre-merge : + unit tests shuffled (isolation)                          (~1-2 min)
#   ci        : + mutation E13 (full) + build/bundle-resolution E16          (minutes)
#
# Changed-file gates diff against $GATE_BASE (default origin/main; CI passes the
# PR base sha). Integration/testcontainers suites are a SEPARATE lane
# (npm run test:integration) and never run here - they need provisioned services.
# =============================================================================
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

TIER="${1:-ci}"
BASE="${GATE_BASE:-origin/main}"
fail=0
declare -a RESULTS

run() { # run <name> <cmd...>
  local name="$1"; shift
  printf '\n===== %s =====\n' "$name"
  if "$@"; then echo "PASS"; RESULTS+=("PASS  $name"); else echo "FAIL"; RESULTS+=("FAIL  $name"); fail=1; fi
}

have_base() { git rev-parse --verify --quiet "$BASE" >/dev/null 2>&1; }
changed_src() {
  # Union of everything about to land: committed-vs-base, staged, unstaged, AND untracked.
  # (Previously only committed vs BASE, so a landing's uncommitted/new files escaped lint
  #  until after commit — the gap FW-5 closes. See docs/framework/FRAMEWORK_HARDENING.md.)
  local globs=('src/**/*.ts' 'src/**/*.tsx' 'src/**/*.js' 'src/**/*.jsx')
  {
    have_base && git diff --name-only --diff-filter=AM "$BASE"...HEAD -- "${globs[@]}" 2>/dev/null
    git diff --cached --name-only --diff-filter=AM -- "${globs[@]}" 2>/dev/null
    git diff --name-only --diff-filter=AM -- "${globs[@]}" 2>/dev/null
    git ls-files --others --exclude-standard -- "${globs[@]}" 2>/dev/null
  } | sort -u
}

g_types()    { npm run --silent check:types; }
g_sizes()    { npm run --silent check:sizes; }
g_lint()     { local f; f="$(changed_src | sed 's/^/--file /')"; if [ -z "$f" ]; then echo "(no changed source files)"; return 0; fi; npx --no-install next lint $f; }
g_testlink() { local f; f="$(changed_src | tr '\n' ' ')"; node docs/build-provenance/check-testlink.mjs src tests $f --baseline docs/build-provenance/testlink-baseline.json; }
g_unit()     { npx --no-install vitest run; }
g_wiring()   { node docs/build-provenance/check-wiring.mjs src --baseline docs/build-provenance/wiring-baseline.json; }
g_prov()     { bash docs/build-provenance/check-provenance.sh; }
g_mutation() { node docs/build-provenance/check-mutation.mjs --config docs/build-provenance/mutation-targets.json; }
g_shuffle()  { npx --no-install vitest run --sequence.shuffle; }
g_build()    { npx --no-install next build; }
g_pageboundary() { node docs/build-provenance/check-page-boundaries.mjs; }
g_skillmirror()  { node tools/gen/genSkillMirror.mjs --check; }

run "types (tsc --noEmit)"      g_types
run "file sizes + ratchet"      g_sizes
run "lint (changed files)"      g_lint
run "test-link E13 (changed)"   g_testlink
run "page boundaries (E16 shift-left)" g_pageboundary
run "skill mirror in sync"      g_skillmirror
if [ "$TIER" = "push" ] || [ "$TIER" = "pre-merge" ] || [ "$TIER" = "ci" ]; then
  run "unit tests (vitest)"     g_unit
  run "wired-path E14"          g_wiring
  run "provenance E11"          g_prov
fi
if [ "$TIER" = "pre-merge" ] || [ "$TIER" = "ci" ]; then
  run "unit tests (shuffled order - isolation)" g_shuffle
fi
if [ "$TIER" = "ci" ]; then
  run "build/bundle-resolution E16 (next build)" g_build
  run "mutation E13 (full)"     g_mutation
fi

printf '\n############ GATE SUMMARY (tier=%s) ############\n' "$TIER"
printf '  %s\n' "${RESULTS[@]}"
if [ "$fail" -eq 0 ]; then echo "  ALL GATES PASS ($TIER) - safe to commit/push"; else echo "  GATES FAILED ($TIER) - fix before pushing"; fi
exit $fail
