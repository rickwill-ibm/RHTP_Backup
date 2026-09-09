#!/usr/bin/env bash
set -euo pipefail
: "${GITHUB_TOKEN:?Set your token first:  export GITHUB_TOKEN=ghp_xxx}"
BASE="${PR_BASE:-chore/framework-hardening-v1.6}"
REPO="rickwill-ibm/RHTP-Code-Base"
HEAD="feat/wpc-graph-population"

BODY_FILE="$(mktemp)"
cat > "$BODY_FILE" <<'EOF'
## What
Closes the WPC runtime-population gap: the projected whole-person graph was rich but reached no runtime read path. This wires it end-to-end behind the dataMode/`wpcRecord` seam, with the mock demo unchanged.

## Phases
- **Phase 1** — process-shared projection stores (composition root); the graph accumulates across drains instead of being rebuilt per tick.
- **Phase 2** — dev ingestion seeds the shared graph via the REAL pipeline (SDOH drop -> outbox -> projection); ops route seeds before drain.
- **Phase 3** — projected-graph holistic aggregator behind the `wpcRecord` seam: composes the five consent-scoped lenses into `HolisticPatientContext`; async; fail-closed (absent member throws) and fail-honest (`contextProvenance` marks projected vs neutral sections); registered at the composition root.
- **Phase 4** — reads routed through the seam: `/api/wpc/context` is async/server-side/member-in-context (404/503 fail-closed); the care-plan holistic path routes through the seam (mock = authored, demo intact; production = fails over to the comprehensive plan, no silent authored data).

## Design captured
- `docs/production-plan/JOB_DRIVER_SEAM.md` — the Airflow job-driver seam (Phase 5, production batch orchestration).

## Backlog logged (not blockers)
- **WPC-CD1** (client-delivery): server-side, member-in-context care-plan generation.
- Consent-scope-from-principal in the context route (defaults to `NO_CONSENT` today).

## Testing
- All gates green on push tier (types, sizes, lint, E13, unit, E14, E11); full suite 1632 passing.
- New tests: `projectionRuntime`, `devIngestion`, `projectedAggregator` (+ mappers), care-plan holistic seam. Mock-demo behavior preserved.

## Note
Stacked on `chore/framework-hardening-v1.6` (PR base); merge after v1.6.
EOF

PAYLOAD="$(mktemp)"
BODY_FILE="$BODY_FILE" BASE="$BASE" HEAD="$HEAD" node -e '
const fs=require("fs");
const body=fs.readFileSync(process.env.BODY_FILE,"utf8");
process.stdout.write(JSON.stringify({
  title:"feat(wpc): graph-population runtime wiring - Phases 1-4",
  head:process.env.HEAD, base:process.env.BASE, body
}));' > "$PAYLOAD"

echo "Creating PR: $HEAD -> $BASE on $REPO"
curl -sS -X POST \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$REPO/pulls" \
  -d @"$PAYLOAD" | grep -E '"html_url"|"message"' | head
rm -f "$BODY_FILE" "$PAYLOAD"
