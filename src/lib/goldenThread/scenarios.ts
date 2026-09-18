/**
 * scenarios.ts — the operating-book SCENARIO descriptor. A scenario is a property of the WHOLE book (member,
 * payer, provider, and the regulatory vocabulary), not a label on one thread. The engine and every view read
 * the active scenario's strings from here, so switching scenarios re-grounds the demo consistently.
 *
 * Two scenarios today:
 *  • 'wa-medicaid' — the default WA Medicaid managed-care book (existing behavior; strings match what shipped).
 *  • 'diane-ma'    — Diane Novak's Medicare Advantage (Part C) showcase. Cleveland Clinic + Elevance/Anthem are
 *                    REAL organization names used ILLUSTRATIVELY (internal/design-partner) — no affiliation,
 *                    endorsement, or real case implied; every gap is a fictional, payer-owned administrative seed.
 *
 * CLIENT-SAFE: pure data + pure selectors. No engine import (flowSim imports THIS), no `@/lib/evidence` barrel.
 */
export type ScenarioId = 'wa-medicaid' | 'diane-ma';

export interface Scenario {
  id: ScenarioId;
  label: string; // switcher label
  program: string; // program framing shown in the header badge
  fictionalOrgBanner?: string; // shown when the scenario names real orgs illustratively
  member?: { name: string; note: string };
  payer: string;
  provider: string;
  // regulatory vocabulary — the strings the engine seals / the views render
  clockCite: string; // the expedited decision clock
  timeoutCite: string; // untimely-decision rule
  adverseNotice: string; // the member-facing adverse notice name (NABD vs IDN)
  denyAppeal: string; // appeal rights appended to a clinical denial
  deemedAdverseDecision: string; // the sealed decision string when a clock expires (deemed-adverse)
  exemptionProgram: string; // Beat 3 streamlined-review / gold-card framing
  // certification-gap pend (administrative, non-clinical) — payer-owned framing
  certPendReason: string;
  certKickbackSeal: string; // what the sealed kickback record says (credentialing/attestation, NOT clinical records)
  // whether the WA-Medicaid seeded Operations/Surveillance TICKETS mint under this scenario
  seedMedicaidTickets: boolean;
}

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  'wa-medicaid': {
    id: 'wa-medicaid',
    label: 'WA Medicaid MCO',
    program: 'Medicaid managed care · WA HCA',
    payer: 'UnitedHealthcare Community Plan',
    provider: 'Cascadia Integrated Health System (illustrative)',
    clockCite: '42 CFR 438.210(d)(2) — 72h expedited / 7-day standard',
    timeoutCite: '42 CFR 438.404(c)(5)',
    adverseNotice: 'Notice of Adverse Benefit Determination (NABD)',
    denyAppeal: 'NABD, appeal + State fair-hearing rights',
    deemedAdverseDecision:
      'DEEMED-ADVERSE (438.404(c)(5); 438.210(d) clock expired: 72h expedited / 7-day standard) → human-issued NABD, appeal + State fair-hearing rights',
    exemptionProgram: 'Gold-card program (state-statute construct, applied via MCO policy)',
    certPendReason: 'additional clinical records requested (277-RFAI)',
    certKickbackSeal: '277-RFAI OUT',
    seedMedicaidTickets: true,
  },
  'diane-ma': {
    id: 'diane-ma',
    label: 'Diane Novak · Medicare Advantage',
    program: 'Medicare Advantage (Part C) · Ohio',
    fictionalOrgBanner:
      'Fictional scenario — Cleveland Clinic and Elevance Health/Anthem are real organization names used illustratively. No affiliation, endorsement, or real case is implied; every gap shown is a fictional, payer-owned administrative seed.',
    member: {
      name: 'Diane Novak (illustrative)',
      note: 'Medicare beneficiary · Cleveland, OH · Part C',
    },
    payer: 'Elevance Health / Anthem BCBS Ohio (illustrative)',
    provider: 'Cleveland Clinic (illustrative)',
    clockCite: '42 CFR 422.572 — 72h expedited organization determination',
    timeoutCite: '42 CFR 422.572(f)',
    adverseNotice: 'Integrated Denial Notice (IDN/NDMCP, CMS-10003)',
    denyAppeal: 'IDN, reconsideration → CMS Independent Review Entity (422.590/422.592)',
    deemedAdverseDecision:
      'DEEMED-ADVERSE (422.572(f); 422.572 expedited 72h clock expired) → human-issued Integrated Denial Notice (CMS-10003); reconsideration → CMS Independent Review Entity (422.590/422.592)',
    exemptionProgram:
      'Elevance streamlined-review (payer program; state gold-carding preempted for MA plans, 42 CFR 422.402)',
    certPendReason:
      'provider certification not on file — payer has no current attestation (administrative, non-clinical)',
    certKickbackSeal:
      'CERT-ATTESTATION lookup (credentialing/PractitionerRole · DocumentReference) — not a clinical records request',
    seedMedicaidTickets: false,
  },
};

export const scenarioOf = (s: { scenario: ScenarioId }): Scenario =>
  SCENARIOS[s.scenario] ?? SCENARIOS['wa-medicaid'];
export const scenarioList: ReadonlyArray<{ id: ScenarioId; label: string }> = (
  Object.keys(SCENARIOS) as ScenarioId[]
).map((id) => ({ id, label: SCENARIOS[id].label }));
