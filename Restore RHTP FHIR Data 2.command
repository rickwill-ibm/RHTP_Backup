#!/bin/bash
# Restores RHTP's canonical patient data on the HAPI FHIR server
# (fixes records overwritten by the MD SmartApp seed), then re-applies
# the SmartApp's clinical demo resources non-destructively.
cd "$(dirname "$0")"
echo "════════════════════════════════════════════════"
echo "  RHTP — FHIR Data Restore"
echo "════════════════════════════════════════════════"

if ! curl -sf http://localhost:8080/fhir/metadata >/dev/null 2>&1; then
  echo "✗ FHIR server not reachable on localhost:8080 — start it first (Start RHTP.command)"
  read -r -p "Press Enter to close…"
  exit 1
fi

echo "→ Restoring RHTP patients (migrate-patients.mjs)…"
node fhir/migrate-patients.mjs

echo "→ Re-applying MD SmartApp demo resources (non-destructive)…"
node fhir/seed.mjs

echo ""
echo "✓ Done. Maria (patient-maria-001) is RHTP's canonical record again;"
echo "  the SmartApp's added clinical resources remain available."
read -r -p "Press Enter to close…"
