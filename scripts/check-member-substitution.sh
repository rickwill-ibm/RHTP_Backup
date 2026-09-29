#!/usr/bin/env bash
# ZERO-TOLERANCE guard: no fallback may substitute a NAMED REAL MEMBER on the render path.
#
# WHY A SECOND SCRIPT, next to check-maria-hardcoding.sh. That one is a COUNT RATCHET over
# src/app/**/*.tsx. Both properties made it blind to the defect it was written for:
#   1. a ratchet at 80 is green while 80 literals sit in the tree, so it measures direction,
#      not safety;
#   2. src/app only — the root cause was `return defaultMariaState` in
#      src/lib/patientContext.tsx, one directory outside its scan, and a wrong-member record
#      was two clicks into the demo with that gate green.
# This one asks a different, binary question: does any `??`/`||` fallback hand a named real
# member's identity to code that renders it? That must be ZERO, not shrinking.
#
# The rule, stated so it stays gateable: a fallback may report that a value is UNRESOLVED; it
# may never supply a plausible value for a field whose meaning is member-specific — identity,
# program enrolment, risk stratification, clinical or financial. "Unknown Member" is honest;
# "Maria Redhawk" asserts something false about the member on screen.
set -euo pipefail
cd "$(dirname "$0")/.."

PERSONAS="Maria Redhawk|MARIA_SD_001|Sophia Redhawk|Elena Redhawk|Dorothy Simmons|Margaret Okonkwo|Patricia Nguyen"

# EXCLUSIONS, each named so a future reader can judge them rather than trust them:
#  - MemberScopeNotice          the fail-closed notice itself
#  - src/lib/server/devStubs.*  dev-only API stubs whose own docstring documents
#                               `patientId ?? 'MARIA_SD_001'` as the intended demo default;
#                               that contract is a separate decision — see register G-033
#  - src/lib/config/demoDefaults.ts  the ONE declaration of which member is the demo default,
#                               env-overridable. Naming it in exactly one config constant is
#                               the fix, not the defect — every other site reads DEMO_MEMBER_ID
#  - lines that are comments    a comment describing a removed fallback is not a fallback
hits() {
  grep -rnE "(\?\?|\|\|)[[:space:]]*'($PERSONAS)'" src --include=*.ts --include=*.tsx \
    | grep -v "MemberScopeNotice" \
    | grep -v "src/lib/server/devStubs" \
    | grep -v "src/lib/config/demoDefaults.ts" \
    | grep -vE ':[0-9]+:[[:space:]]*(//|\*|/\*)' \
    || true
}

FOUND="$(hits)"
COUNT="$(printf '%s' "$FOUND" | grep -c . || true)"

if [[ "$COUNT" -eq 0 ]]; then
  echo "[member-substitution] OK — 0 fallbacks substituting a named real member on the render path"
  exit 0
fi
echo "[member-substitution] FAIL — $COUNT fallback(s) substitute a named real member:"
printf '%s\n' "$FOUND" | sed 's/^/  /'
echo
echo "A fallback may say UNRESOLVED. It may not name a real member — that asserts an identity,"
echo "program, risk or clinical fact about whoever is actually on screen. Render the unresolved"
echo "identifier instead, or fail closed via MemberScopeNotice."
exit 1
