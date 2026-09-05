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
#   fast      : format(changed), types, sizes+ratchet, lint(changed), test-link E13, page-boundaries, skill-mirror (~seconds)
#               (format runs FIRST — same as the pre-commit — so size/lint see the committed form; no drift.)
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

# g_format (v1.8 §2): format changed files with the repo .prettierrc FIRST — exactly what the
# pre-commit hook (tools/hooks/pre-commit) does before it checks sizes. Without this, ci-gates.sh
# measured the on-disk (possibly hand-compacted) line count and PASSED, while the pre-commit
# reformatted-then-checked and FAILED — the precise "gate said green, commit blocked on size" drift
# this single-source-of-truth file exists to prevent. A file's size is its FORMATTED size, always.
g_format()   { local f; f="$(changed_src | tr '\n' ' ')"; [ -z "$f" ] && { echo "(no changed source files)"; return 0; }; npx --no-install prettier --write --ignore-unknown $f && echo "formatted changed files with the repo .prettierrc"; }
g_types()    { npm run --silent check:types; }
g_sizes()    { npm run --silent check:sizes; }
# g_lint: lint the changed source files. Exclude src/uhg/ — .eslintignore intentionally
# excludes that legacy demo/presentation layer, and `next lint --file <ignored>` treats an
# ignored file as a failure. Aligning the lint set with .eslintignore keeps the gate honest.
g_lint()     { local f; f="$(changed_src | grep -vE '^src/uhg/|^src/app/uhg-orchestrate/' | sed 's/^/--file /')"; if [ -z "$f" ]; then echo "(no changed lintable source files)"; return 0; fi; npx --no-install next lint $f; }
g_testlink() { local f; f="$(changed_src | tr '\n' ' ')"; node docs/build-provenance/check-testlink.mjs src tests $f --baseline docs/build-provenance/testlink-baseline.json; }
g_unit()     { npx --no-install vitest run; }
g_wiring()   { node docs/build-provenance/check-wiring.mjs src --baseline docs/build-provenance/wiring-baseline.json; }
g_prov()     { bash docs/build-provenance/check-provenance.sh; }
g_mutation() { node docs/build-provenance/check-mutation.mjs --config docs/build-provenance/mutation-targets.json; }
g_shuffle()  { npx --no-install vitest run --sequence.shuffle; }
g_build()    { npx --no-install next build; }
g_pageboundary() { node docs/build-provenance/check-page-boundaries.mjs; }
g_skillmirror()  { node tools/gen/genSkillMirror.mjs --check; }
# g_coalition (v1.7 §13.6): a core-logic change MUST carry a logged architect+SWE+adversarial
# coalition. Mechanical teeth for the Coalition Trigger Protocol (AGENTS.md). It cannot verify an
# agent ran, but it BLOCKS landing a core change with no coalition-log entry — making a skip visible.
CORE_RE='^src/lib/(policy|identity|consent|goldenThread|networkAdequacy)/'
g_coalition() {
  local core; core="$(changed_src | grep -E "$CORE_RE" || true)"
  [ -z "$core" ] && { echo "(no core-logic changes — coalition not required)"; return 0; }
  local logf='docs/build-provenance/coalition-log.md' all
  all="$( { have_base && git diff --name-only "$BASE"...HEAD 2>/dev/null; git diff --cached --name-only 2>/dev/null; git diff --name-only 2>/dev/null; git ls-files --others --exclude-standard 2>/dev/null; } | sort -u )"
  if printf '%s\n' "$all" | grep -qx "$logf"; then echo "core-logic change + coalition log updated"; return 0; fi
  echo "CORE-LOGIC CHANGE without a coalition-log entry:"; printf '%s\n' "$core" | sed 's/^/  /'
  echo "  -> run architect + SWE design + adversarial (before & after); append an entry to $logf."
  echo "  -> see AGENTS.md 'Coalition Trigger' + docs/framework/coalition-protocol.md."
  return 1
}

run "format (prettier, changed files)" g_format
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
  run "coalition (core-logic design+adversarial)" g_coalition
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
