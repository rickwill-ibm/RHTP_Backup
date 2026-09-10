#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# land-extract.sh — land the policy document extractor onto the existing ingest seam.
#
# Adds src/lib/policy/extract/* + tests, wires policyLibrary.ingestDocuments, and
# guards aetnaCpb.canIngest against PA-list mis-routing. Idempotent patches (safe to
# re-run). Formats -> next lint precheck -> authoritative gate -> stage. NO commit, NO push.
#
# RUN FROM THE REPO ROOT in Git Bash:   bash land-extract.sh
# PREREQUISITE: _local-only/extract-bundle.tgz present (delivered alongside this script).
# ---------------------------------------------------------------------------
set -euo pipefail

BUNDLE="${1:-_local-only/extract-bundle.tgz}"
GATE_TIER="${2:-push}"
say(){ printf '\n\033[1;34m▸ %s\033[0m\n' "$*"; }
die(){ printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ -f package.json ] || die "Run me from the repo root."
[ -d .git ] || die "Not a git repo root."
[ -f scripts/ci-gates.sh ] || die "scripts/ci-gates.sh not found — wrong repo?"
[ -f "$BUNDLE" ] || die "Bundle missing: $BUNDLE"
[ -f src/lib/policy/policyLibrary.ts ] || die "policyLibrary.ts missing — wrong repo?"
[ -f src/lib/policy/ingest/aetnaCpb.ts ] || die "ingest/aetnaCpb.ts missing — wrong repo?"

STAMP="$(date +%Y%m%d-%H%M%S)"
BK="_backups/extract-preland-${STAMP}"
say "Backing up the two files I patch → $BK"
mkdir -p "$BK/src/lib/policy/ingest"
cp -p src/lib/policy/policyLibrary.ts "$BK/src/lib/policy/policyLibrary.ts"
cp -p src/lib/policy/ingest/aetnaCpb.ts "$BK/src/lib/policy/ingest/aetnaCpb.ts"

say "Extracting new extract/ modules + tests"
tar xzf "$BUNDLE" -C .
tar tzf "$BUNDLE" | grep -c '\.ts$' | xargs printf '  %s TS files landed\n'

say "Patching policyLibrary.ts + aetnaCpb.ts (idempotent; dies on missing anchor)"
python - <<'PY'
import io, sys

p = 'src/lib/policy/policyLibrary.ts'
s = io.open(p, encoding='utf-8').read()
if 'ingestDocuments' not in s:
    imp = "import { ingestRecords, type RawPolicyRecord } from './ingest';"
    add = "import { extractAndIngest, type TextSource, type FieldProvenance } from './extract';"
    if imp not in s: sys.exit('ANCHOR MISSING: ingest import in policyLibrary.ts')
    s = s.replace(imp, imp + "\n" + add, 1)
    anchor = ("  const { policies, skipped } = ingestRecords(records);\n"
              "  return { library: index(policies), skipped };\n}")
    if anchor not in s: sys.exit('ANCHOR MISSING: ingestLibrary body in policyLibrary.ts')
    block = '''

export interface IngestDocumentsResult {
  library: LoadedLibrary;
  skipped: number;
  provenance: FieldProvenance[];
  warnings: string[];
}

/**
 * Build a library directly from policy DOCUMENTS (already read into text) — the
 * runtime path that turns an uploaded Aetna CPB or payer/agency PA list into
 * governing policies. Extraction runs through the same ingestion adapters as the
 * seed, so a document-sourced policy evaluates identically to a seed-sourced one.
 * Provenance is returned so a reviewer can trace every code back to source text.
 */
export function ingestDocuments(sources: readonly TextSource[]): IngestDocumentsResult {
  const { policies, skipped, provenance, warnings } = extractAndIngest(sources);
  return { library: index(policies), skipped, provenance, warnings };
}'''
    s = s.replace(anchor, anchor + block, 1)
    io.open(p, 'w', encoding='utf-8').write(s)
    print('  policyLibrary.ts patched')
else:
    print('  policyLibrary.ts already has ingestDocuments — skipped')

p = 'src/lib/policy/ingest/aetnaCpb.ts'
s = io.open(p, encoding='utf-8').read()
if 'prior-authorization-requirements-list' not in s:
    anchor = "  canIngest(raw: RawPolicyRecord): boolean {\n    return ("
    if anchor not in s: sys.exit('ANCHOR MISSING: aetnaCpb canIngest')
    guard = ("  canIngest(raw: RawPolicyRecord): boolean {\n"
             "    // A record explicitly typed as a PA-requirement list belongs to the PA-list\n"
             "    // adapters, even when its source is Aetna — otherwise an Aetna PA list would be\n"
             "    // mis-normalized as a bulletin with no codes and requiresPA=false.\n"
             "    if (raw?.sourceType === 'prior-authorization-requirements-list') return false;\n"
             "    return (")
    s = s.replace(anchor, guard, 1)
    io.open(p, 'w', encoding='utf-8').write(s)
    print('  aetnaCpb.ts patched')
else:
    print('  aetnaCpb.ts already guarded — skipped')
PY

say "Prettier auto-format (repo .prettierrc)"
npx --no-install prettier --write \
  "src/lib/policy/extract/**/*.ts" \
  src/lib/policy/policyLibrary.ts \
  src/lib/policy/ingest/aetnaCpb.ts \
  "tests/policy/extract*.ts" >/tmp/x-fmt.txt 2>&1 && echo "  formatted" || { cat /tmp/x-fmt.txt; die "prettier failed"; }

say "Lint precheck on the new/changed files (next lint)"
NEWSRC=(
  src/lib/policy/extract/types.ts src/lib/policy/extract/provenance.ts
  src/lib/policy/extract/codes.ts src/lib/policy/extract/readers.ts
  src/lib/policy/extract/segment.ts src/lib/policy/extract/fields.ts
  src/lib/policy/extract/index.ts
  src/lib/policy/policyLibrary.ts src/lib/policy/ingest/aetnaCpb.ts
)
LINT_ARGS="$(printf ' --file %s' "${NEWSRC[@]}")"
if ! npx --no-install next lint $LINT_ARGS >/tmp/x-lint.txt 2>&1; then
  cat /tmp/x-lint.txt
  die "LINT failed on the new files — fix before landing (nothing staged)."
fi
echo "  lint clean"

say "Authoritative gate: scripts/ci-gates.sh $GATE_TIER"
if ! bash scripts/ci-gates.sh "$GATE_TIER"; then
  die "GATE RED — nothing staged. Restore from $BK if you want to reset the two patched files."
fi
say "GATE GREEN ✓"

say "Staging exact paths (no commit, no push — your review is the final gate)"
git add src/lib/policy/extract tests/policy/extract*.test.ts \
        src/lib/policy/policyLibrary.ts src/lib/policy/ingest/aetnaCpb.ts
git status --short | head -60

cat <<'NEXT'

────────────────────────────────────────────────────────────────────────────
STAGED, GATE GREEN, NOT COMMITTED. Review, then commit + push:

  git diff --cached --stat
  git commit -m "feat(policy): document->NormalizedPolicy extractor on the ingest seam" \
             -m "extract/: readers seam (real plain-text reader; PDF/XLSX/OCR seams+fakes), CPT/HCPCS/ICD-10 recognizer with bare-CPT/ZIP noise guard, structural segmenter, field extractor to the two adapter shapes, byte-anchored provenance. Wired via policyLibrary.ingestDocuments. Guards aetnaCpb.canIngest so an Aetna PA list no longer mis-routes to the CPB adapter. 38 tests: hand-authored gold, adversarial no-hallucination corpus, provenance falsification, round-trip through real adapters + policyEngine.evaluate."
  git push

Backup of the two patched files: _backups/extract-preland-*  (gitignored)
────────────────────────────────────────────────────────────────────────────
NEXT
