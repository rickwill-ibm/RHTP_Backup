#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# land-policy-dtr.sh — land the Policy → DTR authoring workbench.
#
# Upload a payer policy PDF from the filesystem → extract product→procedure→codes
# with confidence + provenance → build a DRAFT DTR → policy-expert review screen.
# Replaces the old paste-text determination console on /policy-engine and retires it.
#
# PREREQUISITE: the base extractor (src/lib/policy/extract/index.ts) must be present
# (land-extract.sh). Installs the `unpdf` dependency for real PDF text extraction.
#
# RUN FROM THE REPO ROOT in Git Bash:   bash land-policy-dtr.sh
# ---------------------------------------------------------------------------
set -euo pipefail

BUNDLE="${1:-_local-only/policy-dtr-bundle.tgz}"
GATE_TIER="${2:-push}"
say(){ printf '\n\033[1;34m▸ %s\033[0m\n' "$*"; }
die(){ printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ -f package.json ] || die "Run me from the repo root."
[ -d .git ] || die "Not a git repo root."
[ -f scripts/ci-gates.sh ] || die "scripts/ci-gates.sh not found — wrong repo?"
[ -f "$BUNDLE" ] || die "Bundle missing: $BUNDLE"
[ -f src/lib/policy/extract/index.ts ] || die "Base extractor missing. Run land-extract.sh FIRST."
[ -f src/lib/dtr/questionnaireResponse.ts ] || die "src/lib/dtr/questionnaireResponse.ts not found — wrong repo?"
[ -f src/components/AppLayout.tsx ] || die "AppLayout.tsx not found — wrong repo?"

STAMP="$(date +%Y%m%d-%H%M%S)"
BK="_backups/policy-dtr-preland-${STAMP}"
say "Backup → $BK"
mkdir -p "$BK"
cp -p "src/app/(reviewer)/policy-engine/page.tsx" "$BK/page.tsx" 2>/dev/null || true

say "Installing unpdf (real PDF text extraction)"
npm install unpdf --save >/tmp/dtr-npm.txt 2>&1 && echo "  unpdf installed" || { tail -8 /tmp/dtr-npm.txt; die "npm install unpdf failed"; }

say "Extracting DTR modules + route + viewer + tests"
tar xzf "$BUNDLE" -C .
tar tzf "$BUNDLE" | grep -cE '\.(ts|tsx)$' | xargs printf '  %s TS files landed\n'

say "Retiring the superseded paste-text determination console (if present)"
git rm -q --ignore-unmatch \
  src/components/policy/PolicyEngineConsole.tsx \
  src/app/api/policy/library/route.ts \
  src/app/api/policy/evaluate/route.ts \
  src/app/api/policy/ingest/route.ts \
  src/lib/policy/console.ts \
  tests/policy/console.test.ts 2>/dev/null || true
# also remove any working-tree copies not tracked
rm -f src/components/policy/PolicyEngineConsole.tsx src/lib/policy/console.ts tests/policy/console.test.ts 2>/dev/null || true
rm -rf src/app/api/policy/library src/app/api/policy/evaluate src/app/api/policy/ingest 2>/dev/null || true

say "Prettier auto-format"
npx --no-install prettier --write \
  "src/lib/policy/extract/structured.ts" src/lib/policy/policyDtr.ts src/lib/policy/server/pdfIntake.ts \
  "src/app/api/policy/dtr/route.ts" src/components/policy/PolicyDtrWorkbench.tsx \
  "src/app/(reviewer)/policy-engine/page.tsx" \
  "tests/policy/structured.test.ts" tests/policy/policyDtr.test.ts tests/policy/pdfIntake.test.ts \
  >/tmp/dtr-fmt.txt 2>&1 && echo "  formatted" || { cat /tmp/dtr-fmt.txt; die "prettier failed"; }

say "Lint precheck (next lint)"
NEWSRC=(
  src/lib/policy/extract/structured.ts src/lib/policy/policyDtr.ts src/lib/policy/server/pdfIntake.ts
  src/app/api/policy/dtr/route.ts src/components/policy/PolicyDtrWorkbench.tsx
  "src/app/(reviewer)/policy-engine/page.tsx"
)
LINT_ARGS=""
for f in "${NEWSRC[@]}"; do LINT_ARGS="$LINT_ARGS --file $f"; done
if ! npx --no-install next lint $LINT_ARGS >/tmp/dtr-lint.txt 2>&1; then
  cat /tmp/dtr-lint.txt; die "LINT failed — fix before landing (nothing staged)."
fi
echo "  lint clean"

say "Authoritative gate: scripts/ci-gates.sh $GATE_TIER"
bash scripts/ci-gates.sh "$GATE_TIER" || die "GATE RED — nothing staged. Restore page from $BK if needed."
say "GATE GREEN ✓"

say "Staging"
git add \
  src/lib/policy/extract/structured.ts src/lib/policy/policyDtr.ts src/lib/policy/server \
  src/app/api/policy/dtr "src/app/(reviewer)/policy-engine" src/components/policy \
  tests/policy/structured.test.ts tests/policy/policyDtr.test.ts tests/policy/pdfIntake.test.ts \
  tests/fixtures/horizon.pdf tests/fixtures/sample-pa.pdf package.json package-lock.json 2>/dev/null || true
git add -u src/components/policy src/app/api/policy src/lib/policy tests/policy 2>/dev/null || true
git status --short | head -60

cat <<'NEXT'

────────────────────────────────────────────────────────────────────────────
STAGED, GATE GREEN, NOT COMMITTED.

Try it:  npm run dev  →  http://localhost:4029/policy-engine
  • "Choose a file from your computer" → pick the Horizon PA PDF → it extracts
    product→procedure→codes with confidence, flags the low-confidence rows,
    shows source provenance, and gates sign-off until reviewed.

Then commit + push:
  git diff --cached --stat
  git commit -m "feat(policy): Policy→DTR authoring workbench (upload PDF → extract → expert review)" \
             -m "Structured extractor (product/procedure/code+confidence, generalized; gated vs real Horizon + a synthetic non-Horizon policy). unpdf PDF intake. buildPolicyDtr → draft DTR. /api/policy/dtr upload route. PolicyDtrWorkbench review screen (confidence flags, provenance, accept/remove, sign-off gate). Retires the paste-text determination console."
  git push

Backup: _backups/policy-dtr-preland-*
────────────────────────────────────────────────────────────────────────────
NEXT
