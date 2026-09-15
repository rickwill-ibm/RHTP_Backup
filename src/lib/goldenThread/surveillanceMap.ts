/**
 * surveillanceMap — honest mapping between the demo's WIRED detectors (the ~7 that carry a scripted
 * narrative + governed ticket) and the 40-entry program-integrity library, plus the persona routing
 * (F5: clinical vs investigative are distinct authorities, and credible-fraud refers OUT to the State
 * Medicaid agency / MFCU under 42 CFR 455.23 — the demo's audience is that state).
 *
 * CLIENT-SAFE: pure data + pure functions.
 */

/** Seed-ticket algorithm → the library id it corresponds to. These are the WIRED narratives. */
export const WIRED_LIBRARY_ID: Record<string, string> = {
  'CALENDAR-IMPOSSIBLE': 'CALENDAR-IMPOSSIBLE',
  'UNDERPAY-CONTRACT': 'UNDERPAY-CARC',
  'DENY-DISPARATE-IMPACT': 'FAIRNESS-GUARD',
  'UPCODE-DRIFT': 'EM-LEVEL-DRIFT',
  'COB-TPL': 'COB-GAP',
  'EXCLUDED-PROVIDER': 'EXCLUSION-SCREEN',
  'GOLDCARD-ANOMALY': 'CRITERIA-DRIFT',
};

/** The set of library ids that are wired with a narrative in this demo (everything else is catalog-only). */
export const WIRED_LIBRARY_IDS = new Set(Object.values(WIRED_LIBRARY_ID));
export const isWiredLibraryId = (id: string): boolean => WIRED_LIBRARY_IDS.has(id);
/** Given a seed algorithm, the library id it maps to (falls back to the same string). */
export const libraryIdForAlgorithm = (algo: string): string => WIRED_LIBRARY_ID[algo] ?? algo;

export interface Routing {
  seat: string; // the analyst persona the detection is triggered to
  authority: string; // what that seat may decide (distinct due-process)
  terminal?: string; // an out-of-MCO referral terminal, when applicable
}

/**
 * Route a detection to the right seat. Clinical (medical-necessity) and investigative (FWA) are
 * DIFFERENT authorities; a credible allegation of fraud is referred OUT to the State/MFCU (455.23 is
 * the State agency's authority; the MCO acts under 438.608(a)), not resolved inside the MCO. A §1557
 * disparate-impact finding is a compliance/governance action, NOT a medical-necessity determination.
 */
export function detectionRoute(role: string, lane: string, algo?: string): Routing {
  if (algo === 'DENY-DISPARATE-IMPACT' || algo === 'FAIRNESS-GUARD') {
    return {
      seat: 'Payer · Medical Director + Compliance',
      authority:
        'civil-rights / governance action — suspend the auto-deny rule, reprocess, issue NABDs, run MHPAEA parity; a human governance decision, not a clinician’s medical-necessity call',
    };
  }
  switch (role) {
    case 'payer-md':
      return {
        seat: 'Payer · Medical Director (UM)',
        authority: 'medical-necessity PEND / deny — clinician decides',
      };
    case 'payer-siu':
      return {
        seat: 'Payer · SIU Investigator',
        authority: 'investigate suspected FWA — no autonomous adverse action',
        terminal:
          'credible allegation → State Medicaid agency / MFCU referral · 455.23 (State) suspension; MCO acts under 438.608(a) — human',
      };
    case 'payer-pi':
      return {
        seat: 'Payer · Program-Integrity Analyst',
        authority: lane === 'adverse' ? 'recovery review — human-gated' : 'monitor / self-correct',
      };
    case 'provider-revint':
      return {
        seat: 'Provider · Revenue-Integrity Analyst',
        authority: 'self-directed — provider corrects its own claims',
      };
    case 'provider-coding':
      return {
        seat: 'Provider · Coding & Compliance',
        authority: 'education path — takeback disallowed',
      };
    case 'arbiter':
      return {
        seat: 'Neutral · State TPL / PI Recovery',
        authority: 'independent attestation / third-party recovery',
      };
    default:
      return { seat: role, authority: 'human review' };
  }
}

/** The disposition lifecycle — honest terminal is "action proposed", never "addressed/resolved" (mock channel). */
export type Disposition = 'detected' | 'routed' | 'assigned' | 'action-proposed' | 'cleared';
export const DISPOSITION_LABEL: Record<Disposition, string> = {
  detected: 'Detected — awaiting routing',
  routed: 'In queue — routed, unassigned',
  assigned: 'Assigned (claimed)',
  'action-proposed': 'Action proposed — pending human release',
  cleared: 'Cleared — not FWA (human)',
};

/** What this console is explicitly NOT claiming (shown in the UI, per the honesty gate). Count-free
 * on purpose — the summary tiles carry the live catalog / scripted numbers so nothing can drift. */
export const NOT_CLAIMING = [
  'Not a bank of live models — a few detectors carry a scripted narrative here; the rest are the reference catalog (mostly rules/edits, no live analysis). See the catalog vs scripted counts above.',
  'Not real-time per-record detection — production runs as scheduled batch / near-real-time analytics; the cadence here is illustrative.',
  'Not executed actions — outbound is proposed and pending a human release on a mock channel; nothing is transmitted.',
  'Not cryptographic non-repudiation — the live seal is an illustrative hash chain (detects naive edits on re-read); production uses HMAC-SHA256 / server-side signing.',
  'Not a conformance assessment — NIST AI-RMF fields show alignment only; NIST does not certify AI systems.',
];
