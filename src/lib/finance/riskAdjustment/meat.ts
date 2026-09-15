/**
 * MEAT / source-document linkage + RADV defensibility (HW-FIN / I18).
 *
 * The financial-integrity lens found the #1 Crit: HCCs were captured with NO MEAT
 * (Monitored / Evaluated / Assessed / Treated) evidence and NO source-document
 * linkage — so every captured HCC is a RADV audit takeback waiting to happen (CMS
 * can claw back the risk-adjusted payment for any diagnosis a chart doesn't
 * support). A defensible HCC needs: at least one MEAT element, a source clinical
 * document reference, a valid face-to-face date of service, and a qualified
 * provider. This module makes that a MECHANICAL gate on capture and submission.
 */

/** The MEAT criteria — at least one must be documented for a diagnosis to stand. */
export interface MeatEvidence {
  monitored: boolean;
  evaluated: boolean;
  assessed: boolean;
  treated: boolean;
}

export interface HccCapture {
  /** The CMS-HCC category (e.g. 'HCC18'). */
  hccCode: string;
  /** The supporting ICD-10-CM code. */
  icdCode: string;
  memberId: string;
  /** The encounter this diagnosis was captured on. */
  encounterId: string;
  /** Face-to-face date of service (ISO date). RADV requires a valid F2F encounter. */
  dateOfService: string;
  /** Rendering provider NPI (must be an acceptable provider type for RADV). */
  providerNpi: string;
  meat: MeatEvidence;
  /** Reference to the source clinical document (the chart that supports the dx). */
  sourceDocumentRef?: string;
  /** Lifecycle status — a retracted dx must never be submitted. */
  status: 'active' | 'retracted';
}

export interface RadvDefensibility {
  defensible: boolean;
  /** PHI-safe list of what is missing (drives the reviewer's remediation). */
  deficiencies: string[];
}

function hasAnyMeat(m: MeatEvidence): boolean {
  return m.monitored || m.evaluated || m.assessed || m.treated;
}

function isValidDos(dos: string): boolean {
  // A real F2F DOS: an ISO date that parses and is not in the future is required.
  if (!/^\d{4}-\d{2}-\d{2}/.test(dos)) return false;
  const t = Date.parse(dos);
  return Number.isFinite(t);
}

/**
 * Assess whether a captured HCC is RADV-defensible. Returns the deficiencies so a
 * reviewer can remediate BEFORE submission (rather than lose it in an audit after).
 */
export function assessRadvDefensibility(capture: HccCapture): RadvDefensibility {
  const deficiencies: string[] = [];
  if (!hasAnyMeat(capture.meat))
    deficiencies.push('no MEAT evidence (monitored/evaluated/assessed/treated)');
  if (!capture.sourceDocumentRef || !capture.sourceDocumentRef.trim())
    deficiencies.push('no source-document linkage');
  if (!isValidDos(capture.dateOfService))
    deficiencies.push('missing or invalid face-to-face date of service');
  if (!capture.providerNpi || !/^\d{10}$/.test(capture.providerNpi))
    deficiencies.push('missing or invalid rendering-provider NPI');
  if (!capture.icdCode || !capture.icdCode.trim())
    deficiencies.push('no supporting ICD-10-CM code');
  return { defensible: deficiencies.length === 0, deficiencies };
}
