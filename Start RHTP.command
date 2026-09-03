#!/bin/bash
# One-click launcher — starts the RHTP platform (with the Cerner MD SmartApp).
cd "$(dirname "$0")"
echo "════════════════════════════════════════════"
echo "  RHTP — Total Cost of Care Clinical Platform"
echo "════════════════════════════════════════════"

# 1 — Docker / FHIR server (reuse one already on :8080)
if curl -sf http://localhost:8080/fhir/metadata >/dev/null 2>&1; then
  echo "✓ FHIR server already running on localhost:8080"
else
  if ! docker info >/dev/null 2>&1; then
    echo "→ Starting Docker Desktop…"
    open -a Docker
    until docker info >/dev/null 2>&1; do sleep 2; printf "."; done
    echo ""
  fi
  echo "→ Starting HAPI FHIR server…"
  docker compose -f fhir/docker-compose.yml up -d
  until curl -sf http://localhost:8080/fhir/metadata >/dev/null 2>&1; do sleep 3; printf "."; done
  echo ""
  echo "✓ HAPI FHIR ready"
fi

# 2 — Seed the MD SmartApp demo bundle (idempotent)
if [ -f fhir/seed.mjs ]; then
  echo "→ Seeding MD SmartApp FHIR bundle…"
  node fhir/seed.mjs
fi

# 3 — Dependencies
if [ ! -d node_modules ]; then
  echo "→ Installing npm dependencies (first run only)…"
  npm install
fi

# 4 — App on port 4032
if lsof -ti :4032 >/dev/null 2>&1; then
  echo "→ Port 4032 in use — stopping the existing dev server…"
  lsof -ti :4032 | xargs kill 2>/dev/null
  sleep 2
fi
# Clear the Next.js build cache — prevents stale-chunk hydration failures
echo "→ Clearing .next build cache…"
rm -rf .next
echo "→ Starting RHTP dev server on http://localhost:4032 …"
(sleep 8 && open "http://localhost:4032/md-smart-launch") &
npm run dev
