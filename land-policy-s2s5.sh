#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# land-policy-s2s5.sh
# Lands the verified S2-S5 extraction pipeline (gold sets, segmenter, extractor,
# validator+SLO gate) into the repo and runs the authoritative gate.
# Framework-conformant: lands code -> ratchets E14 wiring baseline for the new modules
# -> LINT-PRECHECKS the new files (g_lint is blind to uncommitted work, so we check here)
# -> runs scripts/ci-gates.sh and STOPS on red -> stages, does NOT push.
#
# RUN FROM THE REPO ROOT, in Git Bash:   bash land-policy-s2s5.sh
# PREREQUISITE: _local-only/policy-s2s5.tgz present.
# ---------------------------------------------------------------------------
set -euo pipefail

BUNDLE="_local-only/policy-s2s5.tgz"
GATE_TIER="${1:-push}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="_backups/policy-s2s5-preland-${STAMP}"

say(){ printf '\n\033[1;34m▸ %s\033[0m\n' "$*"; }
die(){ printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ -f package.json ] || die "Run me from the repo root."
[ -d .git ]         || die "Not a git repo root."
[ -f scripts/ci-gates.sh ] || die "scripts/ci-gates.sh not found — wrong repo?"
[ -f "$BUNDLE" ]    || die "Bundle missing: $BUNDLE"

NEW_SRC=(
  src/lib/policy/gold/access.ts src/lib/policy/gold/adjudicate.ts src/lib/policy/gold/annotate.ts
  src/lib/policy/gold/model.ts src/lib/policy/gold/partition.ts src/lib/policy/gold/score.ts
  src/lib/policy/segment/adjudicate.ts src/lib/policy/segment/blocks.ts src/lib/policy/segment/llmBackend.ts
  src/lib/policy/segment/route.ts src/lib/policy/segment/segmenter.ts
  src/lib/policy/extract/codesystem.ts src/lib/policy/extract/ensemble.ts src/lib/policy/extract/extractor.ts
  src/lib/policy/extract/llmBackend.ts src/lib/policy/extract/prober.ts src/lib/policy/extract/schemas.ts
  src/lib/policy/validate/calibrate.ts src/lib/policy/validate/codesystem.ts src/lib/policy/validate/entailment.ts
  src/lib/policy/validate/gate.ts src/lib/policy/validate/validator.ts
)
NEW_TESTS=(
  tests/policy/gold.test.ts tests/policy/segment.test.ts tests/policy/extract.test.ts
  tests/policy/validate.test.ts tests/policy/redteam.test.ts
)

say "Branch: $(git rev-parse --abbrev-ref HEAD)   Tier: $GATE_TIER"

# --- 1. back up overwritten files ------------------------------------------
say "Backing up overwritten files → $BACKUP"
mkdir -p "$BACKUP"
while IFS= read -r f; do
  case "$f" in */) continue;; esac
  if [ -e "$f" ]; then mkdir -p "$BACKUP/$(dirname "$f")"; cp -p "$f" "$BACKUP/$f"; fi
done < <(tar tzf "$BUNDLE")

# --- 2. land ---------------------------------------------------------------
say "Extracting verified S2-S5 modules + tests"
tar xzf "$BUNDLE" -C . --overwrite
tar tzf "$BUNDLE" | grep -E '\.ts$' | wc -l | xargs printf '   %s files landed\n'

# --- 3. ratchet the E14 wiring baseline for the new (unwired) modules ------
say "Ratcheting wiring baseline for new modules (idempotent)"
node - "${NEW_SRC[@]}" <<'NODE'
const fs = require('fs');
const path = 'docs/build-provenance/wiring-baseline.json';
const NEW = process.argv.slice(2);
if (!fs.existsSync(path)) { console.log('   (no wiring-baseline.json — skipping)'); process.exit(0); }
const j = JSON.parse(fs.readFileSync(path, 'utf8'));
const arr = Array.isArray(j) ? j : (Array.isArray(j.orphans) ? j.orphans : (Array.isArray(j.allow) ? j.allow : null));
if (!arr) { console.log('   Unrecognized baseline shape — if E14 flags them, add by hand.'); process.exit(0); }
let added = 0;
for (const m of NEW) if (!arr.includes(m)) { arr.push(m); added++; }
arr.sort();
fs.writeFileSync(path, JSON.stringify(j, null, 2) + '\n');
console.log(`   ${added} added, ${NEW.length - added} already present`);
NODE

# --- 4. LINT PRECHECK (g_lint only sees COMMITTED diffs; check the new files now) ---
say "Lint precheck on the new files (next lint)"
LINT_ARGS="$(printf ' --file %s' "${NEW_SRC[@]}")"
if ! npx --no-install next lint $LINT_ARGS >/tmp/s2s5-lint.txt 2>&1; then
  cat /tmp/s2s5-lint.txt
  die "LINT failed on the new files — fix before landing (nothing staged)."
fi
echo "   lint clean"

# --- 5. THE AUTHORITATIVE GATE (green or not at all) -----------------------
say "Running the authoritative gate:  scripts/ci-gates.sh $GATE_TIER"
if ! bash scripts/ci-gates.sh "$GATE_TIER"; then
  die "GATE RED — nothing staged. Fix, or restore from $BACKUP and re-run."
fi
say "GATE GREEN ✓"

# --- 6. stage a DoD-shaped commit — DO NOT push ----------------------------
say "Staging exact paths (no push — your review is the final gate)"
git add "${NEW_SRC[@]}" "${NEW_TESTS[@]}" docs/build-provenance/wiring-baseline.json 2>/dev/null || true
git status --short | head -40

cat <<'NEXT'

────────────────────────────────────────────────────────────────────────────
STAGED, GATE GREEN, NOT COMMITTED. Review, then commit + push:

  git diff --cached --stat
  git commit -m "feat(policy): S2-S5 extraction pipeline — gold sets, segmenter, extractor, validator+SLO gate" -m "S2 gold sets (byte-anchored labels, double-blind adjudication, held-out partitioning, regression-slice access guard). S3 segmenter: a pure blocker OWNS every offset (spans tile [0,len), round-trip verifyAnchor); the model only relabels via the single audited path and reverts on PHI. S4 extractor: 3 distinct passes + pure ensemble (agree+anchored or needs-review, never guessed), one code-system registry (unknown => review), DLP at the model boundary. S5 validator: value<->span entailment + force-fit ban catch real-but-wrong citations, worst-severity-wins, calibration+ECE, an SLO gate that refuses below target/thin-holdout/high-ECE, and a loadPromoted bridge that keeps smeReviewed FALSE (a human must sign). Verified 207/207; gate green without optional deps; red-teamed across the pre-registered target list."
  git push

Backup of overwritten files: _backups/policy-s2s5-preland-*  (gitignored)
────────────────────────────────────────────────────────────────────────────
NEXT
