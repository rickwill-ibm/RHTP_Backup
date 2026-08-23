// CONTRACT: C10  // F5 claims integrity
/**
 * Route CARC / RARC adjustment codes through the STAGE-4 terminology gate.
 *
 * CARC (claim-adjustment-reason) and RARC (remittance-advice-remark) are X12 code
 * systems. Rather than trusting whatever code a payer 835 carried, we run each one
 * through the SAME TerminologyService the stage-4 semantic gate uses, so an
 * adjustment code is checked, not assumed. This REUSES the terminology gate (its
 * `validateCode` seam); it does not reimplement validation.
 *
 * X12 is not (yet) a governed value set in the terminology registry, so the gate
 * answers `unsupported-system` for these systems. That is the FAIL-SAFE outcome, in
 * the spirit of E9: an ungoverned adjustment code is reported as `ungoverned`
 * (seen, routed, not-yet-validatable) and NEVER fabricated into a valid code. When
 * X12 value sets are later wired into the registry, the exact same routing begins
 * returning real `valid` / `unrecognized` findings with no change here.
 *
 * Every finding is PHI-safe: category + system + code + status only.
 */
import type { TerminologyService } from '@/lib/terminology';
import { selectTerminologyService } from '@/lib/terminology';

/** Canonical X12 system URIs for the two adjustment-code families (PHI-safe metadata). */
export const CARC_SYSTEM_URI = 'https://x12.org/codes/claim-adjustment-reason-codes';
export const RARC_SYSTEM_URI = 'https://x12.org/codes/remittance-advice-remark-codes';

/** The disposition the gate returned for one adjustment code. */
export type AdjustmentCodeStatus =
  | 'valid' //        governed and a member of the bound version
  | 'unrecognized' // governed but not a member (or retired)
  | 'ungoverned'; //  system not governed here yet (X12) -> routed, fail-safe

/** One routed adjustment-code finding (PHI-safe: category + system + code + status). */
export interface AdjustmentCodeFinding {
  category: 'CARC' | 'RARC';
  system: string;
  code: string;
  status: AdjustmentCodeStatus;
}

function statusFor(valid: boolean, rawStatus: string): AdjustmentCodeStatus {
  if (valid) return 'valid';
  return rawStatus === 'unsupported-system' ? 'ungoverned' : 'unrecognized';
}

/**
 * Route CARC + RARC code lists through the terminology gate, returning one PHI-safe
 * finding per code. Empty in -> empty out. Uses the configured terminology service
 * (the stage-4 gate) unless one is injected for a test.
 */
export function routeAdjustmentCodes(
  carcCodes: readonly string[],
  rarcCodes: readonly string[],
  service: TerminologyService = selectTerminologyService(),
): AdjustmentCodeFinding[] {
  const out: AdjustmentCodeFinding[] = [];
  for (const code of carcCodes) {
    const r = service.validateCode(CARC_SYSTEM_URI, code);
    out.push({ category: 'CARC', system: CARC_SYSTEM_URI, code, status: statusFor(r.valid, r.status) });
  }
  for (const code of rarcCodes) {
    const r = service.validateCode(RARC_SYSTEM_URI, code);
    out.push({ category: 'RARC', system: RARC_SYSTEM_URI, code, status: statusFor(r.valid, r.status) });
  }
  return out;
}
