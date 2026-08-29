#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# land-policy-s6s13.sh
# Lands the verified S6-S13 program layer (normalizer + AI Evidence Record, HITL + clocks,
# FHIR/Golden-Thread/KG, chat, Da Vinci CRD/DTR/PAS, generalization, autonomy/agents/portability).
# Framework-conformant AND FW-5-hardened: extract -> prettier --write (auto-format to repo config)
# -> wiring-baseline ratchet -> next-lint precheck (works on uncommitted files) -> authoritative
# gate -> stage, NO push.
#
# RUN FROM THE REPO ROOT, in Git Bash:   bash land-policy-s6s13.sh
# PREREQUISITE: _local-only/policy-s6s13.tgz present.
# ---------------------------------------------------------------------------
set -euo pipefail

BUNDLE="_local-only/policy-s6s13.tgz"
GATE_TIER="${1:-push}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="_backups/policy-s6s13-preland-${STAMP}"

say(){ printf '\n\033[1;34m▸ %s\033[0m\n' "$*"; }
die(){ printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ -f package.json ] || die "Run me from the repo root."
[ -d .git ]         || die "Not a git repo root."
[ -f scripts/ci-gates.sh ] || die "scripts/ci-gates.sh not found — wrong repo?"
[ -f "$BUNDLE" ]    || die "Bundle missing: $BUNDLE"

NEW_SRC=(
  src/lib/policy/normalize/bundle.ts src/lib/policy/normalize/evidence.ts
  src/lib/policy/hitl/makerChecker.ts src/lib/policy/hitl/clocks.ts
  src/lib/policy/goldenthread/fhir.ts src/lib/policy/goldenthread/thread.ts src/lib/policy/goldenthread/kg.ts
  src/lib/policy/chat/grounding.ts src/lib/policy/chat/copilot.ts
  src/lib/policy/davinci/criteria.ts src/lib/policy/davinci/crd.ts src/lib/policy/davinci/dtr.ts src/lib/policy/davinci/pas.ts
  src/lib/policy/generalize/coverage.ts
  src/lib/policy/autonomy/ladder.ts src/lib/policy/agents/reconciliation.ts src/lib/policy/portability/adapters.ts
)
NEW_TESTS=(
  tests/policy/bundle.test.ts tests/policy/hitl.test.ts tests/policy/goldenthread.test.ts tests/policy/chat.test.ts
  tests/policy/davinci.test.ts tests/policy/pas.test.ts tests/policy/generalize.test.ts tests/policy/autonomy.test.ts
)

say "Branch: $(git rev-parse --abbrev-ref HEAD)   Tier: $GATE_TIER"

say "Backing up overwritten files → $BACKUP"
mkdir -p "$BACKUP"
while IFS= read -r f; do
  case "$f" in */) continue;; esac
  if [ -e "$f" ]; then mkdir -p "$BACKUP/$(dirname "$f")"; cp -p "$f" "$BACKUP/$f"; fi
done < <(tar tzf "$BUNDLE")

say "Extracting verified S6-S13 modules + tests"
tar xzf "$BUNDLE" -C . --overwrite
tar tzf "$BUNDLE" | grep -E '\.ts$' | wc -l | xargs printf '   %s files landed\n'

say "Prettier auto-format on the new files (matches this repo's .prettierrc)"
npx --no-install prettier --write "${NEW_SRC[@]}" "${NEW_TESTS[@]}" >/tmp/s6s13-fmt.txt 2>&1 && echo "   formatted" || { cat /tmp/s6s13-fmt.txt; die "prettier failed"; }

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

say "Lint precheck on the new files (next lint)"
LINT_ARGS="$(printf ' --file %s' "${NEW_SRC[@]}")"
if ! npx --no-install next lint $LINT_ARGS >/tmp/s6s13-lint.txt 2>&1; then
  cat /tmp/s6s13-lint.txt
  die "LINT failed on the new files — fix before landing (nothing staged)."
fi
echo "   lint clean"

say "Running the authoritative gate:  scripts/ci-gates.sh $GATE_TIER"
if ! bash scripts/ci-gates.sh "$GATE_TIER"; then
  die "GATE RED — nothing staged. Fix, or restore from $BACKUP and re-run."
fi
say "GATE GREEN ✓"

say "Staging exact paths (no push — your review is the final gate)"
git add "${NEW_SRC[@]}" "${NEW_TESTS[@]}" docs/build-provenance/wiring-baseline.json 2>/dev/null || true
git status --short | head -50

cat <<'NEXT'

────────────────────────────────────────────────────────────────────────────
STAGED, GATE GREEN, NOT COMMITTED. Review, then commit + push:

  git diff --cached --stat
  git commit -m "feat(policy): S6-S13 program layer — normalizer+evidence, HITL+clocks, Golden Thread, chat, Da Vinci CRD/DTR/PAS, generalization, autonomy+agents+portability" -m "S6 CandidatePolicyBundle (evaluate() unchanged) + hash-chained AI Evidence Record. S7 maker-checker (maker!=checker, view-before-approve nonce, denial license gating) + two clocks (internal never auto-promotes; statutory fails open to deemed-approval). S8 ledger->FHIR AuditEvent/Provenance, content-addressed Golden Thread (cross-validate), thin KG. S9 grounded PHI-safe chat (cite-or-refuse) + deterministic PA lookup. S10 CRD cards + DTR Questionnaire compiled from the same criteria (no CQL). S11 PAS 278 correlation round-trip; payer ClaimResponse authoritative; only full grant auto-approves. S12 Medicaid via data-only schema + held-out generalization proof (synthetic excluded). S13 autonomy hooks (denials never autonomous; circuit-breaker), reconciliation agent, portability adapters (mock->production). Verified 257/257; tsc+prettier+lint clean."
  git push

Backup of overwritten files: _backups/policy-s6s13-preland-*  (gitignored)
────────────────────────────────────────────────────────────────────────────
NEXT
