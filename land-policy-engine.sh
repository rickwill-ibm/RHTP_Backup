#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# land-policy-engine.sh — land the Intelligent Policy Engine screen.
#
# Adds the console core + 3 BFF routes + the reviewer page + the client console,
# and registers the screen in the sidebar nav. Idempotent nav patch. Formats ->
# next lint precheck -> authoritative gate -> stage. NO commit, NO push.
#
# PREREQUISITE: the extractor unit must already be landed (run land-extract.sh first) —
# this screen imports src/lib/policy/extract and policyLibrary.ingestDocuments.
#
# RUN FROM THE REPO ROOT in Git Bash:   bash land-policy-engine.sh
# ---------------------------------------------------------------------------
set -euo pipefail

BUNDLE="${1:-_local-only/policy-engine-bundle.tgz}"
GATE_TIER="${2:-push}"
say(){ printf '\n\033[1;34m▸ %s\033[0m\n' "$*"; }
die(){ printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ -f package.json ] || die "Run me from the repo root."
[ -d .git ] || die "Not a git repo root."
[ -f scripts/ci-gates.sh ] || die "scripts/ci-gates.sh not found — wrong repo?"
[ -f "$BUNDLE" ] || die "Bundle missing: $BUNDLE"
[ -f src/components/AppLayout.nav.ts ] || die "AppLayout.nav.ts missing — wrong repo?"

# --- prerequisite: extractor unit must be present ---
[ -f src/lib/policy/extract/index.ts ] || die "Extractor unit not found. Run land-extract.sh FIRST (this screen builds on src/lib/policy/extract)."
grep -q 'ingestDocuments' src/lib/policy/policyLibrary.ts || die "policyLibrary.ingestDocuments not found. Run land-extract.sh (and commit) FIRST."

STAMP="$(date +%Y%m%d-%H%M%S)"
BK="_backups/policy-engine-preland-${STAMP}"
say "Backing up the file I patch → $BK"
mkdir -p "$BK/src/components"
cp -p src/components/AppLayout.nav.ts "$BK/src/components/AppLayout.nav.ts"

say "Extracting new files (console core + routes + page + component + test)"
tar xzf "$BUNDLE" -C .
tar tzf "$BUNDLE" | grep -cE '\.(ts|tsx)$' | xargs printf '  %s files landed\n'

say "Registering the screen in the sidebar nav (idempotent)"
python - <<'PY'
import io, sys
p = 'src/components/AppLayout.nav.ts'
s = io.open(p, encoding='utf-8').read()
if "nav-policy-engine" in s:
    print('  nav already has the Policy Engine entry — skipped')
else:
    import re
    # anchor: the CMS-0057-F nav line; insert our entry right after it.
    m = re.search(r"^(\s*)\{ key: 'nav-cms0057f',.*\},\s*$", s, re.M)
    if not m:
        sys.exit('ANCHOR MISSING: nav-cms0057f line in AppLayout.nav.ts (add the nav item by hand)')
    indent = m.group(1)
    item = (indent + "{ key: 'nav-policy-engine', label: 'Policy Engine', "
            "icon: 'CpuChipIcon', href: '/policy-engine', group: 'CMS-0057-F' },")
    s = s[:m.end()] + "\n" + item + s[m.end():]
    io.open(p, 'w', encoding='utf-8').write(s)
    print('  nav entry added (group CMS-0057-F)')
PY

say "Prettier auto-format (repo .prettierrc)"
npx --no-install prettier --write \
  src/lib/policy/console.ts \
  "src/app/api/policy/**/*.ts" \
  "src/app/(reviewer)/policy-engine/page.tsx" \
  src/components/policy/PolicyEngineConsole.tsx \
  src/components/AppLayout.nav.ts \
  tests/policy/console.test.ts >/tmp/pe-fmt.txt 2>&1 && echo "  formatted" || { cat /tmp/pe-fmt.txt; die "prettier failed"; }

say "Lint precheck on the new/changed files (next lint)"
NEWSRC=(
  src/lib/policy/console.ts
  src/app/api/policy/library/route.ts src/app/api/policy/evaluate/route.ts src/app/api/policy/ingest/route.ts
  "src/app/(reviewer)/policy-engine/page.tsx"
  src/components/policy/PolicyEngineConsole.tsx
  src/components/AppLayout.nav.ts
)
LINT_ARGS=""
for f in "${NEWSRC[@]}"; do LINT_ARGS="$LINT_ARGS --file $f"; done
if ! npx --no-install next lint $LINT_ARGS >/tmp/pe-lint.txt 2>&1; then
  cat /tmp/pe-lint.txt
  die "LINT failed on the new files — fix before landing (nothing staged)."
fi
echo "  lint clean"

say "Authoritative gate: scripts/ci-gates.sh $GATE_TIER"
if ! bash scripts/ci-gates.sh "$GATE_TIER"; then
  die "GATE RED — nothing staged. Restore nav from $BK if needed."
fi
say "GATE GREEN ✓"

say "Staging exact paths (no commit, no push — your review is the final gate)"
git add \
  src/lib/policy/console.ts \
  src/app/api/policy \
  "src/app/(reviewer)/policy-engine" \
  src/components/policy/PolicyEngineConsole.tsx \
  src/components/AppLayout.nav.ts \
  tests/policy/console.test.ts
git status --short | head -40

cat <<'NEXT'

────────────────────────────────────────────────────────────────────────────
STAGED, GATE GREEN, NOT COMMITTED.

Eyeball it before committing (the gate can't render a screen):
  npm run dev   →   open http://localhost:3000/policy-engine
  • Run determination: code 72148 → "PA required — on the payer PA list"
  • Ingest: click "Load sample PA list" → Extract → see codes + provenance table
  • Library: lookup 72148 → governing policies

Then commit + push:
  git diff --cached --stat
  git commit -m "feat(policy): Intelligent Policy Engine reviewer screen" \
             -m "New /policy-engine screen (in AppLayout, under CMS-0057-F nav): browse library, look up a code, run a coverage determination, and ingest a policy document to see extracted codes with byte-anchored provenance. Pure view-model core in lib/policy/console.ts (unit-tested) behind 3 BFF routes (/api/policy/{library,evaluate,ingest}); client console calls them via the BFF. Builds on the document extractor."
  git push

Backup of the patched nav file: _backups/policy-engine-preland-*  (gitignored)
────────────────────────────────────────────────────────────────────────────
NEXT
