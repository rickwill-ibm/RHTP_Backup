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
# Guarded cd (v1.8 §13.6 hardening). `git rev-parse` exits 128 in a NON-git tree (an
# exported/portable copy of this repo, which is exactly what the WPCO landing machine was),
# and `cd ""` in bash SILENTLY SUCCEEDS and stays put. The script then ran, every
# changed-file gate saw an EMPTY change set, and each printed PASS — green by vacuity on a
# 57-file landing. Two things are needed, and the regex fix alone is NOT one of them:
#   (a) refuse to run anywhere that is not recognisably this repo root, and
#   (b) record GIT_OK so a gate whose input is a CHANGE SET can fail CLOSED on an
#       indeterminate one rather than PASS on an empty one (E9 fail-closed doctrine).
GIT_OK=1
GATE_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -n "$GATE_ROOT" ]; then cd "$GATE_ROOT"; else GIT_OK=0; fi
if [ ! -f package.json ] || [ ! -f scripts/ci-gates.sh ]; then
  echo "FATAL: ci-gates.sh must run from the repo root; cwd=$(pwd) has no package.json + scripts/ci-gates.sh." >&2
  exit 2
fi
if [ "$GIT_OK" -ne 1 ]; then
  echo "WARNING: not a git work tree — the changed-file gates cannot compute a change set."
  echo "         format/lint/test-link degrade to '(no changed files)'; g_coalition fails CLOSED."
fi

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
  } | sort -u | while IFS= read -r __f; do [ -f "$__f" ] && printf '%s\n' "$__f"; done
  # EXISTENCE FILTER (2026-09-29). The BASE...HEAD leg lists files added or modified IN
  # COMMITS, including ones since deleted from the working tree - e.g. the
  # md-smart-launch.backup/ tree and DorothyStatusBanner.tsx. Handing a path that is not
  # there to prettier / eslint / check-testlink makes them error on the missing file, so the
  # rung reports a FAILURE IT NEVER MEASURED. 15 of 692 paths on 2026-09-29; g_format went
  # red while every file it could actually format came back "(unchanged)".
}

# g_format (v1.8 §2): format changed files with the repo .prettierrc FIRST — exactly what the
# pre-commit hook (tools/hooks/pre-commit) does before it checks sizes. Without this, ci-gates.sh
# measured the on-disk (possibly hand-compacted) line count and PASSED, while the pre-commit
# reformatted-then-checked and FAILED — the precise "gate said green, commit blocked on size" drift
# this single-source-of-truth file exists to prevent. A file's size is its FORMATTED size, always.
# NOTE (Windows portability, v1.8 §2.1): feed the changed files to prettier via NUL-delimited
# xargs batching instead of one giant argv. `npx` shells through cmd.exe on Windows, whose command
# line caps at ~8191 chars; a large landing (hundreds of changed files) overflowed it ("The command
# line is too long"). xargs runs prettier over as many batches as needed — prettier --write is
# idempotent and per-file, so the formatted result is byte-identical to the single-invocation form.
# NUL delimiting also makes paths with spaces safe. Any batch failing propagates (pipefail) → gate FAIL.
g_format()   { local files; files="$(changed_src)"; [ -z "$files" ] && { echo "(no changed source files)"; return 0; }; printf '%s\n' "$files" | tr '\n' '\0' | xargs -0 -r -n 50 -s 6000 npx --no-install prettier --write --ignore-unknown && echo "formatted changed files with the repo .prettierrc"; }
g_types()    { npm run --silent check:types; }
g_sizes()    { npm run --silent check:sizes; }
# g_lint: lint the changed source files.
#
# G-031 IS CLOSED (2026-09-28). This rung no longer excludes anything.
#
# History, because it is the reason the guard below exists. src/uhg/ and
# src/app/uhg-orchestrate/ were excluded from lint in TWO places — .eslintignore, and a
# hardcoded mirror of it that used to sit in this function. That was how 24 error-level
# findings stopped failing `npm run check:all`: commit f7c99b9 (2026-09-05), whose message
# read "fix(lint): resolve every error-level lint finding across the changed set", resolved
# none of them — its entire diff added the exclusion. The comment that sat here then claimed
# the product stayed "fully linted" while 35 product files imported from src/uhg/.
#
# On 2026-09-28 at 02:32 an overnight run edited four files inside that zone and no gate said
# a word. The 24 findings were then fixed for real (20 react/no-unescaped-entities,
# 2 prefer-const, 2 no-empty-pattern), both exclusions were removed, and the zone verified
# clean: tsc clean, eslint 0 errors across src/uhg and src/app/uhg-orchestrate.
#
# The guard at the top of g_lint() fails closed if either path is ever re-added.
#
# Windows portability (v1.8 §2.1): `next lint` runs through `npx` (→ npx.cmd → cmd.exe, ~8191-char
# cap), so the whole changed set can't go on one command line. We batch 40 files per invocation. We do
# it with an explicit bash loop rather than xargs: on MSYS2/Git Bash, xargs exec'ing npx.cmd does NOT
# reliably propagate the child's exit code — next lint reported "✔ No ESLint warnings or errors" yet
# the rung failed. Running next lint directly from bash and OR-ing each batch's real exit code makes
# pass/fail honest, and it names any batch that fails so a lint break is never silent.
g_lint() {
  # G-031 ANTI-REGRESSION GUARD (2026-09-28).
  # The 24 findings under src/uhg/ and src/app/uhg-orchestrate/ were once "resolved" by
  # excluding those paths from lint in TWO places — .eslintignore, and a hardcoded mirror of
  # it that used to sit right here. Both are gone and the findings are fixed. This guard
  # FAILS CLOSED if either path is re-added, because the cheapest way to make a lint gate
  # green has always been to stop it looking.
  if grep -qE '^[[:space:]]*(src/uhg/|src/app/uhg-orchestrate/)[[:space:]]*$' .eslintignore 2>/dev/null; then
    echo "  [g_lint] FAIL — .eslintignore has re-excluded src/uhg/ or src/app/uhg-orchestrate/."
    echo "  [g_lint] That is how G-031 was 'closed' the first time. Fix the findings instead."
    return 1
  fi
  local files; files="$(changed_src)"
  [ -z "$files" ] && { echo "(no changed lintable source files)"; return 0; }
  local rc=0 n=0 b=0 f; local -a batch=()
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    batch+=(--file "$f"); n=$((n + 1))
    if [ "${#batch[@]}" -ge 40 ]; then
      b=$((b + 1))
      npx --no-install next lint "${batch[@]}" || { echo "  [g_lint] batch #$b exited non-zero (real lint failure)"; rc=1; }
      batch=()
    fi
  done <<< "$files"
  if [ "${#batch[@]}" -gt 0 ]; then
    b=$((b + 1))
    npx --no-install next lint "${batch[@]}" || { echo "  [g_lint] batch #$b exited non-zero (real lint failure)"; rc=1; }
  fi
  echo "  [g_lint] linted $n changed file(s) in $b batch(es); rc=$rc"
  return $rc
}
g_testlink() { local f; f="$(changed_src | tr '\n' ' ')"; node docs/build-provenance/check-testlink.mjs src tests $f --baseline docs/build-provenance/testlink-baseline.json; }
g_unit()     { npx --no-install vitest run; }
g_wiring()   { node docs/build-provenance/check-wiring.mjs src --baseline docs/build-provenance/wiring-baseline.json; }
g_prov()     { bash docs/build-provenance/check-provenance.sh; }
g_mutation() { node docs/build-provenance/check-mutation.mjs --config docs/build-provenance/mutation-targets.json; }
g_shuffle()  { npx --no-install vitest run --sequence.shuffle; }
g_build()    { npx --no-install next build; }
g_pageboundary() { node docs/build-provenance/check-page-boundaries.mjs; }
# g_refresolution: a REFERENCE field in one data file must resolve to a DEFINED key in
# another. Every hand validator in the repo refuses loudly on a malformed BLOB and not one
# can see across two files, so a ref naming a key nothing defines is well-formed everywhere
# and resolves nowhere. It ran in the FAST tier from the start because it is a millisecond
# JSON read, and because the class it catches throws inside a governed runtime path.
g_refresolution() { node docs/build-provenance/check-ref-resolution.mjs; }
# g_membersub: ZERO fallbacks may substitute a named real member on the render path. Distinct
# from the Maria COUNT RATCHET, which is green at 80 literals and scans src/app only — the
# root cause of the wrong-member record sat in src/lib, one directory outside its scan.
g_membersub() { bash scripts/check-member-substitution.sh; }
# g_adversegate: E14-class WIRED-PATH check on the adverse-determination plane. ZERO, not a ratchet
# — a ratchet on a safety claim is green while the claim is false, which is the state this gate was
# written to end. Masks comments before looking for a CALL: the first cut was satisfied by the
# route's own comment naming the function.
g_adversegate() { node docs/build-provenance/check-adverse-gate.mjs; }
g_revqual()     { node docs/build-provenance/check-reviewer-qualification.mjs; }
g_fairness()    { node docs/build-provenance/check-92210.mjs; }
# g_narrowing (register G-063): the authority lock was bootstrapped FROM the definitions it
# governs, so assertWithinAuthorityLock cannot fail on the shipped set. This measures the one
# property that makes the lock a control — that something is narrower than something else — and
# ratchets it, so the tautology is visible in CI output rather than findable only by hand-diffing.
g_narrowing()   { node docs/build-provenance/check-authority-narrowing.mjs; }
# g_clientbundle (register G-066): a 'use client' page reaching a Node builtin THROUGH the import
# graph. check-page-boundaries' class C sees DIRECT imports in src/app only, so it reported 0
# findings while `next build` was failing on node:crypto three hops away behind a src/lib barrel.
g_clientbundle(){ node docs/build-provenance/check-client-bundle.mjs; }
# g_gateregistry: THE GATE THAT WATCHES THE GATES. The repo's own register (G-024) records that
# nothing asserts the enforcement kit is wired — "deleting `run \"data ref resolution\"` from
# ci-gates.sh is invisible; E14's own doctrine is not applied to the enforcement kit". Two gates
# landed in W7.5c/d were added to package.json's `check:all` chain and NOT here, which is exactly
# that. This refuses when a check-*.mjs exists and this file does not run it.
#
# TWO DEFECTS OF ITS OWN, FOUND BY W8'S ADVERSARIAL-AFTER ROUND AND FIXED HERE. The first cut ran
# `grep -q "$base" "$0"` over the WHOLE file, comments included — so a check named only in a comment
# satisfied it, and deleting the gate's `run` line left it green. That is verbatim the defect
# `g_adversegate` was written to fix and documents four lines above itself ("the first cut was
# satisfied by the route's own comment naming the function"). The gate that watches the gates carried
# the bug it was watching for. Second, it never checked that a `g_*` function is INVOKED: a gate
# defined and never run was invisible to it.
#
# Both legs now read executable lines only, and the second is derived from the `run` invocations —
# the thing that actually decides whether a gate executes — not from a name appearing somewhere.
g_gateregistry() {
  local missing=0 f base body
  # Strip comments and blank lines. Everything below is matched against CODE, never prose.
  body=$(grep -v '^[[:space:]]*#' "$0" | grep -v '^[[:space:]]*$')
  for f in docs/build-provenance/check-*.mjs; do
    base=$(basename "$f")
    if ! printf '%s\n' "$body" | grep -q -- "$base"; then
      echo "  gate registry: $base exists and no executable line in ci-gates.sh names it."
      missing=1
    fi
  done
  # Every g_* defined must be invoked by at least one `run` line. A defined-but-never-run gate is a
  # gate that does not gate.
  local fn name
  while IFS= read -r fn; do
    name=${fn%%(*}
    name=${name// /}
    [ -z "$name" ] && continue
    if ! printf '%s\n' "$body" | grep -q "run .*${name}"; then
      echo "  gate registry: ${name} is defined and never invoked by a run line."
      missing=1
    fi
  done <<< "$(printf '%s\n' "$body" | grep -o '^g_[A-Za-z0-9_]*[[:space:]]*(')"
  [ "$missing" -eq 0 ]
}

# SELF-TEST: the masker must actually mask. A gate whose comment-stripping silently stopped working
# would pass everything, which is how this gate's own first cut failed.
g_gateregistry_selftest() {
  local probe
  probe=$(printf '# check-nonexistent-xyz.mjs\nrun "x" g_real\n' | grep -v '^[[:space:]]*#')
  if printf '%s' "$probe" | grep -q -- 'check-nonexistent-xyz.mjs'; then
    echo "  gate registry self-test: comment masking is NOT working; every result above is void."
    return 1
  fi
  return 0
}
g_skillmirror()  { node tools/gen/genSkillMirror.mjs --check; }
# g_coalition (v1.7 §13.6): a core-logic change MUST carry a logged architect+SWE+adversarial
# coalition. Mechanical teeth for the Coalition Trigger Protocol (AGENTS.md). It cannot verify an
# agent ran, but it BLOCKS landing a core change with no coalition-log entry — making a skip visible.
# --- The core-logic surface. AUDITED 2026-09-27; see the WPCO entry in coalition-log.md. ---
# WHAT WAS WRONG. The old filter was a five-directory ALLOWLIST —
#   ^src/lib/(policy|identity|consent|goldenThread|networkAdequacy)/
# — frozen from when those five WERE the whole of src/lib. src/lib now holds 54 directories.
# A 57-file rewrite of the 42 CFR Part 2 / NY MHL §33.13 disclosure decision plane, the
# consent gate, the authority-lock parser and the model-taint gate landed entirely under
# src/lib/{agents,sde,config,deploy}/** and matched NONE of them, so this gate printed
# "(no core-logic changes — coalition not required)" and returned 0 on the highest-stakes
# change in the repo. Sharpest case: src/lib/sde/consentGate.ts IS consent logic, and
# `consent` is in the allowlist — but the file lives under sde/, so it was invisible.
#
# WHY NOT JUST A LONGER LIST. A hand-kept path list drifts every time a module is added,
# split or renamed, and it always rots in the direction of PASSING. So the filter is
# inverted: the core surface is now ALL of src/lib/** — which is exactly what
# coalition-protocol.md §2 row 1 declares the trigger to be ("Change under src/lib/**
# domain logic") — MINUS a short, named, reviewable exemption. A NEW domain directory is
# core BY DEFAULT; exempting one is a deliberate edit to the line below, not an omission.
CORE_RE='^src/lib/'
# The exemption is the NON-DECISION layer only, and each clause has a reason:
#   (a) ^src/lib/.*\.tsx$ — AGENTS.md's repo map defines src/lib/<domain>/ as "pure domain
#       logic (no React/Next imports)", so a .tsx under src/lib IS the presentation glue
#       (appContext.tsx, patientContext*.tsx, workflowMachine.tsx).
#   (b) hooks|stores|context|client — UI plumbing, no decision.
#   (c) the top-level seed/mock corpora and *.data<N>.ts payloads — the same data-only class
#       that check-testlink.mjs and check-wiring.mjs already exempt.
#   (d) demoPreservation/ — the CI gate HARNESS itself (E14/E15 golden), not product logic.
#   (e) *.md under src/lib — the feature READMEs, prose not logic.
# Note what is deliberately NOT exempt: config/ (it holds the E1 seam-disposition manifest),
# deploy/ (fail-closed preflight + schema), server/ (audit, sessions, the trust boundary),
# authz/, security/, evidence/ (the ledger) — every one of them a control surface.
# And NOT a blanket `data/` exemption, deliberately: under a DECISION domain, src/lib/**/data/
# holds the decision content itself, not presentation seed rows —
# agents/authority/data/authority-lock.json IS the authority lock, agents/adl/data/*.agent.json
# ARE the agent regime grants, and sde/data/signal-taxonomy.json carries the dataClassFloor
# values. Granting an agent a new regime is a one-line edit to one of those files. (Nothing is
# lost by dropping the clause: there are zero .ts files under any src/lib/**/data/.)
CORE_EXEMPT_RE='^src/lib/.*\.(tsx|md)$|^src/lib/(hooks|stores|context|client|demoPreservation)/|^src/lib/(mockData|socialMockData|smartFhirMockData|sdResourceData|patientRegistry|fhirCareTeamData|wholePersonGraphData)[.A-Za-z0-9]*\.ts$|\.data[0-9]*\.ts$'
# PATH-INDEPENDENT predicate (the drift-proof half, and the one that cannot be defeated by a
# rename). Any changed file carrying the safety marker the conventions ALREADY require —
# `INVARIANT:` or `CONTRACT: C-` (AGENTS.md "Grep anchors") — triggers the coalition wherever
# it lives, including outside src/lib. This is keyed on the safety claim, not on a directory
# name. Receipt that it is load-bearing: all four new src/app/api/ops/agents/*/route.ts files
# carry `INVARIANT:`, so this predicate alone catches the WPCO tranche even with src/lib
# exempted entirely. Cost: ONE `grep -l` over the changed-file list — never over the tree.
MARKER_RE='INVARIANT:|CONTRACT: C-'
g_coalition() {
  local logf='docs/build-provenance/coalition-log.md'
  # (1) An INDETERMINATE change set must FAIL, not pass. A coalition gate whose whole input
  # is "what changed" has nothing to say when it cannot see what changed — and "nothing to
  # say" printed as PASS is precisely how this tranche landed green. Fail closed instead.
  if [ "$GIT_OK" -ne 1 ]; then
    echo "INDETERMINATE change set: not a git work tree, so this gate cannot see what changed."
    echo "  -> a coalition gate that cannot compute its input must not report PASS (E9 fail-closed)."
    echo "  -> run it inside the git work tree, or in CI where the PR base sha is passed as GATE_BASE."
    return 1
  fi
  local all
  all="$( { have_base && git diff --name-only "$BASE"...HEAD 2>/dev/null; git diff --cached --name-only 2>/dev/null; git diff --name-only 2>/dev/null; git ls-files --others --exclude-standard 2>/dev/null; } | sort -u )"
  if ! have_base && [ -z "$all" ]; then
    echo "INDETERMINATE change set: '$BASE' does not resolve and the work tree is clean, so an"
    echo "  already-committed landing is indistinguishable from no landing at all."
    echo "  -> pass the base explicitly: GATE_BASE=<merge-base sha> bash scripts/ci-gates.sh $TIER"
    return 1
  fi
  # (2) Path predicate — all of src/lib minus the named non-decision layer. It reads the FULL
  # change set, not changed_src(): changed_src globs only *.ts/tsx/js/jsx, so the repo's most
  # consequential files would otherwise be invisible to this gate —
  # agents/authority/data/authority-lock.json, agents/adl/data/*.agent.json (an agent's regime
  # grant and escalation policy) and sde/data/signal-taxonomy.json (the dataClassFloor values)
  # are all JSON. Granting an agent substance-use authority is a one-line JSON edit, and under
  # changed_src it triggered no gate at all.
  local core
  core="$(printf '%s\n' "$all" | grep -E "$CORE_RE" | grep -vE "$CORE_EXEMPT_RE" || true)"
  # (3) Marker predicate — cheap grep over the CHANGED FILES ONLY (skip deleted paths).
  local marked='' f
  local -a probe=()
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    case "$f" in *.ts | *.tsx | *.mts | *.cts | *.js | *.jsx | *.mjs | *.cjs | *.sh) ;; *) continue ;; esac
    [ -f "$f" ] && probe+=("$f")
  done <<< "$all"
  if [ "${#probe[@]}" -gt 0 ]; then
    marked="$(grep -lE "$MARKER_RE" -- "${probe[@]}" 2>/dev/null || true)"
  fi
  if [ -z "$core" ] && [ -z "$marked" ]; then
    echo "(no core-logic path and no INVARIANT:/CONTRACT: C- marker in the change set — coalition not required)"
    return 0
  fi
  if printf '%s\n' "$all" | grep -qx "$logf"; then
    echo "coalition triggered + coalition log updated"
    [ -n "$core" ] && { echo "  core-logic paths ($(printf '%s\n' "$core" | grep -c .)):"; printf '%s\n' "$core" | sed 's/^/    /'; }
    [ -n "$marked" ] && { echo "  safety-marker files ($(printf '%s\n' "$marked" | grep -c .)):"; printf '%s\n' "$marked" | sed 's/^/    /'; }
    return 0
  fi
  echo "COALITION-TRIGGERING CHANGE without a coalition-log entry:"
  [ -n "$core" ] && { echo "  core-logic paths (src/lib/**, non-presentational):"; printf '%s\n' "$core" | sed 's/^/    /'; }
  [ -n "$marked" ] && { echo "  files carrying INVARIANT: / CONTRACT: C- (path-independent trigger):"; printf '%s\n' "$marked" | sed 's/^/    /'; }
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
run "data ref resolution"       g_refresolution
run "member substitution (zero)" g_membersub
run "adverse-path gate wired"   g_adversegate
run "reviewer qualification (C-REVQUAL)" g_revqual
run "92.210 identification (unlisted = refuse)" g_fairness
run "authority narrowing ratchet (G-063)" g_narrowing
run "client-bundle builtin reachability (G-066)" g_clientbundle
run "gate registry self-test (comment masking works)" g_gateregistry_selftest
run "gate registry (every check-*.mjs is run here)" g_gateregistry
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
