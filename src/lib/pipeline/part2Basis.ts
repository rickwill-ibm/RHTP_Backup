// CONTRACT: C9  // CONTRACT: C10
/**
 * 42 CFR Part 2 segmentation BASIS (register F2 closure). This is the rule that
 * decides whether a record is Part 2-protected, and it is deliberately NOT a
 * single magic code.
 *
 * Part 2 protects information that would identify a person as having a substance
 * use disorder AND that originates from a "part 2 program": a federally-assisted
 * program (or identified unit) that holds itself out as providing SUD diagnosis,
 * treatment, or referral for treatment (42 CFR 2.11, 2.12). The protection is a
 * property of BOTH the SOURCE and the CONTENT, so the basis is two facts, never
 * one HL7 service code or one CSV column:
 *
 *   (1) PROGRAM CONTEXT  — the record comes from a federally-assisted SUD program;
 *   (2) SUD CONTENT      — the diagnosis / service is substance-use-disorder related.
 *
 * A SUD diagnosis recorded by a general acute hospital is NOT Part 2 data; an
 * intake diagnosis from an opioid treatment program IS. The old pipeline dropped
 * on a single code guess (ADT PV1-10 = 'CD', a CSV program column) which both
 * over- and under-restricts. Encoding the two-factor test on data tables is the
 * F2 fix: new program types / code ranges extend the tables, never the logic.
 *
 * FAIL-SAFE (E9): the Part 2 decision needs the program provenance to be KNOWN.
 * "Not a recognized SUD program" and "provenance unknown" are DIFFERENT states.
 * Only an affirmatively-recognized general-medical setting (or a SUD program
 * explicitly flagged NOT federally-assisted) clears SUD content to disclosable;
 * a missing, empty, unrecognized, or unknown-federal-assistance program context
 * on SUD content is AMBIGUOUS and restricts. A missing segmentation signal never
 * defaults to disclosable.
 *
 * Tables are DATA (conventions v2 data-is-not-code). Pure + deterministic.
 */

/**
 * Facility / program types that are federally-assisted SUD programs under Part 2.
 * A record only earns the Part 2 label when its program context is one of these
 * AND the program is flagged federally-assisted (both parts of the 2.11 test).
 */
export const FEDERALLY_ASSISTED_SUD_PROGRAM_TYPES: ReadonlySet<string> = new Set([
  'opioid-treatment-program', // OTP / methadone or buprenorphine clinic
  'sud-treatment-facility', // residential or outpatient SUD treatment
  'sud-detox-unit', // identified detox unit within a general facility
  'part2-program', // a program that has explicitly held itself out as Part 2
]);

/**
 * Program / facility settings that are AFFIRMATIVELY recognized as NOT part 2
 * programs: general medical settings that do not hold themselves out as providing
 * SUD diagnosis, treatment, or referral. A SUD diagnosis recorded in one of these
 * is genuinely outside Part 2 (2.12(e)(3) — the general-medical-care exception),
 * so disclosing it is correct, not a fail-open.
 *
 * This set exists so that a SUD diagnosis from an UNKNOWN or UNRECOGNIZED setting
 * is NOT silently treated the same as one from a recognized general-medical
 * setting. Only an affirmatively-recognized non-SUD setting clears the fail-safe;
 * anything else is ambiguous and restricts (see `classifyProgram`).
 */
export const RECOGNIZED_NON_PART2_PROGRAM_TYPES: ReadonlySet<string> = new Set([
  'general-acute',
  'general-acute-hospital',
  'inpatient-hospital',
  'emergency-department',
  'urgent-care',
  'primary-care',
  'primary-care-clinic',
  'retail-pharmacy',
  'laboratory',
  'imaging-center',
]);

/**
 * Three-state program classification (the F2 fail-safe core). A Part 2 decision on
 * SUD content depends on knowing the program provenance; when we do NOT know it,
 * the safe answer is to RESTRICT, never to disclose on an absent signal (E9).
 *
 *  - `federally-assisted-sud-program`: a SUD program type affirmatively flagged
 *    federally-assisted -> Part 2 attaches.
 *  - `recognized-non-part2`: an affirmatively-recognized general-medical setting,
 *    OR a SUD program type explicitly flagged NOT federally-assisted -> not Part 2.
 *  - `ambiguous`: the program context is missing, empty, unrecognized, OR a SUD
 *    program whose federal-assistance status is unknown -> FAIL SAFE (restrict).
 */
export type ProgramClass = 'federally-assisted-sud-program' | 'recognized-non-part2' | 'ambiguous';

export function classifyProgram(facilityType: string, federallyAssisted?: boolean): ProgramClass {
  const type = facilityType.trim();
  if (FEDERALLY_ASSISTED_SUD_PROGRAM_TYPES.has(type)) {
    if (federallyAssisted === true) return 'federally-assisted-sud-program';
    if (federallyAssisted === false) return 'recognized-non-part2'; // affirmatively not federally-assisted
    return 'ambiguous'; // SUD program, federal-assistance status unknown -> fail safe
  }
  if (RECOGNIZED_NON_PART2_PROGRAM_TYPES.has(type)) return 'recognized-non-part2';
  return 'ambiguous'; // empty or unrecognized program context -> fail safe
}

/** Normalize a diagnosis code for range tests (trim, upper-case, no surrounding ws). */
function norm(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * SUD content test. ICD-10-CM F10-F19 = "mental and behavioral disorders due to
 * psychoactive substance use" (alcohol, opioids, cannabis, sedatives, cocaine,
 * other stimulants, hallucinogens, nicotine, volatile solvents, other). That is
 * the SUD range; anything outside it is not treated as SUD content here.
 */
export function isSudDiagnosis(code: string, system?: string): boolean {
  if (system && !isIcd10(system)) return false;
  return /^F1[0-9]/.test(norm(code));
}

/**
 * SNOMED CT substance-use-disorder concepts. A CURATED starter allowlist — in
 * production this must be bound to a governed SNOMED SUD reference set / value set,
 * not a hand-list. It exists because SUD content on an `Encounter.type` /
 * `Encounter.reasonCode` / `Flag` is routinely coded in SNOMED rather than ICD-10,
 * and `isSudDiagnosis` (ICD-10 F10–F19 only) would miss it — projecting a Part 2
 * encounter/flag UNRESTRICTED (a 42 CFR Part 2 disclosure). Extend as the governed
 * set grows; every id here is a substance dependence/abuse concept.
 */
const SNOMED_SUD_CONCEPTS: ReadonlySet<string> = new Set([
  '7200002', // Alcoholism (alcohol dependence)
  '66590003', // Alcohol dependence syndrome
  '15167005', // Alcohol abuse
  '191816009', // Opioid dependence
  '5602001', // Opioid abuse
  '26416006', // Drug abuse
  '191840005', // Drug dependence
  '78267003', // Combined drug dependence
  '85005007', // Cocaine dependence
  '75544000', // Cannabis dependence
]);

function isSnomed(system: string): boolean {
  return /snomed/i.test(system) || system.includes('snomed.info/sct');
}

/**
 * SUD CONTENT test across coding systems (the segmentation seam for resources whose
 * SUD signal may be ICD-10 OR SNOMED — Encounter, Flag). True for ICD-10-CM F10–F19
 * OR a governed SNOMED SUD concept. Use THIS (not `isSudDiagnosis`, which is ICD-only)
 * wherever a resource can carry SNOMED-coded SUD content, so Part 2 restriction is
 * never bypassed by the coding system in use.
 */
export function isSudCoding(code: string, system?: string): boolean {
  if (isSudDiagnosis(code, system)) return true;
  if (system && isSnomed(system) && SNOMED_SUD_CONCEPTS.has(norm(code))) return true;
  return false;
}

/**
 * Behavioral-health content test. ICD-10-CM F01-F99 = "mental, behavioral and
 * neurodevelopmental disorders". SUD (F10-F19) is the sensitive subset of this;
 * the rest (mood, anxiety, psychotic, etc.) is behavioral health but NOT Part 2.
 */
export function isBehavioralHealthDiagnosis(code: string, system?: string): boolean {
  if (system && !isIcd10(system)) return false;
  return /^F[0-9]{2}/.test(norm(code));
}

function isIcd10(system: string): boolean {
  return /icd-?10/i.test(system) || system.includes('sid.hl7.org/CodeSystem/icd-10');
}

/** True when the program context is a federally-assisted SUD program (both facts). */
export function isFederallyAssistedSudProgram(
  facilityType: string,
  federallyAssisted: boolean
): boolean {
  return federallyAssisted && FEDERALLY_ASSISTED_SUD_PROGRAM_TYPES.has(facilityType.trim());
}

/** The two facts a Part 2 basis decision is made from. All PHI-safe (codes only). */
export interface Part2BasisContext {
  /** The source facility / program type token (e.g. 'opioid-treatment-program'). */
  facilityType: string;
  /**
   * Whether that program is federally-assisted (grant, license, tax-exempt, etc.).
   * TRI-STATE and OPTIONAL on purpose: `true`/`false` are affirmative signals;
   * `undefined` means the source did not state it. For SUD content, an unknown
   * federal-assistance status on a SUD program is treated as AMBIGUOUS and fails
   * safe to restricted (never disclosed on an absent signal).
   */
  federallyAssisted?: boolean;
  /** The diagnosis / service code (e.g. an ICD-10-CM code). */
  code: string;
  /** The code system, when known (guards the range test to ICD-10). */
  system?: string;
}

/** The full, auditable basis decision: the label to apply + WHY (PHI-safe reason). */
export interface Part2BasisResult {
  /** True only when BOTH the program-context and SUD-content facts hold. */
  part2: boolean;
  /** True when the content is behavioral health (the F-code superset). */
  behavioralHealth: boolean;
  /** A PHI-safe explanation of the basis, for the audit trail. */
  reason: string;
}

/**
 * Decide the Part 2 basis for one record. Returns the label decision plus a
 * PHI-safe reason string naming which of the two facts held. The adapter turns
 * `part2` into the `part2-sud` segmentation hint; the shared transform maps that
 * hint to the durable 42-CFR-Part-2 label carried on the envelope and the node.
 */
export function evaluatePart2Basis(ctx: Part2BasisContext): Part2BasisResult {
  // SUD content is recognized across ICD-10 (F10–F19) AND governed SNOMED SUD
  // concepts, so a SNOMED-coded SUD encounter/flag/condition cannot bypass the Part 2
  // basis by coding system (the red-team leak: SNOMED SUD projected UNRESTRICTED).
  const sudContent = isSudCoding(ctx.code, ctx.system);
  const behavioralHealth = isBehavioralHealthDiagnosis(ctx.code, ctx.system);

  // Non-SUD content is never Part 2, whatever the program context.
  if (!sudContent) {
    return {
      part2: false,
      behavioralHealth,
      reason: behavioralHealth
        ? 'not-part2: behavioral-health content, not SUD'
        : 'not-part2: neither SUD program nor SUD content',
    };
  }

  // SUD content: the Part 2 decision hinges on KNOWING the program provenance.
  const cls = classifyProgram(ctx.facilityType, ctx.federallyAssisted);
  if (cls === 'federally-assisted-sud-program') {
    return {
      part2: true,
      behavioralHealth,
      reason: 'part2: SUD content from a federally-assisted SUD program',
    };
  }
  if (cls === 'ambiguous') {
    // E9 FAIL-SAFE: SUD content whose program provenance is missing, empty,
    // unrecognized, or a SUD program with unknown federal-assistance status is
    // RESTRICTED. A missing/ambiguous segmentation signal must never default to
    // disclosable; we cannot prove the source is outside Part 2, so we protect it.
    return {
      part2: true,
      behavioralHealth,
      reason:
        'part2 (fail-safe): SUD content with missing or ambiguous program context - restricted on ambiguity',
    };
  }
  return {
    part2: false,
    behavioralHealth,
    reason: 'not-part2: SUD content from an affirmatively-recognized non-Part-2 setting',
  };
}

/** Convenience: just the boolean, for call sites that only need the decision. */
export function part2Applies(ctx: Part2BasisContext): boolean {
  return evaluatePart2Basis(ctx).part2;
}
