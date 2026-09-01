// ─── devStubs.cds.ts ──────────────────────────────────────────────────────────
// CRD (Coverage Requirements Discovery) card stubs for the /api/cds CLIENT mock.
//
// Card content/shape comes from the SHARED producer (src/lib/policy/crd/
// coverageRequirementCards.ts) so this demo path and the hosted /api/cds-hooks/
// order-select service can never drift (E15 parity). This demo path may resolve a
// default scenario (Maria) — that default is intentionally confined to the mock and
// is NOT reachable from the hosted service (which fails closed on an unknown patient).

import { profileFor } from './devStubs.profiles';
import { buildCrdCards, type CrdCoverageCard } from '@/lib/policy/crd/coverageRequirementCards';

/** CRD cards — patient-aware; defaults to Maria's lumbar MRI for the demo client path. */
export function devCrdCards(patientId?: string): CrdCoverageCard[] {
  const p = profileFor(patientId ?? 'MARIA_SD_001');
  return buildCrdCards({
    procedureName: p.paScenario.procedureName,
    cptCode: p.paScenario.cptCode,
  });
}
