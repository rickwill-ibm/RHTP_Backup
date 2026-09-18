/**
 * canonicalJson.ts — deterministic, dependency-free canonical JSON.
 *
 * Object keys are sorted recursively so key ORDER never changes the produced
 * bytes; array order is PRESERVED (a list's order is meaningful). The single
 * source of the sort-deep/stringify algorithm shared by the demo-preservation
 * fingerprints (lib/demoPreservation/fingerprint.ts) and the ledger hash-chain /
 * signing seam (lib/evidence/ledgerIntegrity.ts), so a value hashes/signs to the
 * SAME bytes everywhere. No dependencies.
 */

/** Canonical JSON: object keys sorted recursively, array order preserved. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}
