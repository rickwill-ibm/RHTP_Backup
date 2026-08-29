/**
 * Patient context for prior authorization — the membership→coverage spine.
 *
 * Prior authorization is never asked in the abstract: a PATIENT is a MEMBER of a PLAN
 * (a `Coverage`), and every downstream question — is the member eligible, who is the
 * payer, does THIS code require PA under THIS plan, what Patient/Coverage does the PAS
 * bundle reference — is answered relative to that membership. This module is the single
 * seeded source of that context for the demo scenario, so the live flow and the portal
 * describe the SAME patients (no "two universes"), and no payer/plan string is hardcoded
 * in CRD/PAS logic — it is read from the patient's own coverage here.
 *
 * Pure. The seeded set is explicitly DEMO fixture data (labeled), not policy logic.
 */

export type CoverageStatus = 'active' | 'inactive' | 'unknown';

/** A patient's plan membership — the Coverage that PA is evaluated against. */
export interface PlanMembership {
  /** Payer/insurer display name (Coverage.payor / Claim.insurer). */
  payer: string;
  /** Stable payer organization identifier (for the bundled Organization). */
  payerId: string;
  /** Benefit plan / product name. */
  plan: string;
  /** Member id printed on the card — becomes Coverage.subscriberId + a Patient identifier. */
  memberId: string;
  /** Subscriber id (self unless a dependent); defaults to memberId. */
  subscriberId: string;
  /** Whether coverage is active — drives the CRD eligibility signal (never assumed). */
  coverageStatus: CoverageStatus;
  /** ISO date the eligibility was last verified; absent ⇒ unverified. */
  eligibilityVerifiedOn?: string;
  /** Network name, when known. */
  network?: string;
  /** Eligibility/benefits (X12 270/271) — shown on the CRD screen for CONTEXT, labeled as such;
   *  NOT part of the CRD coverage-requirements determination. Varies by plan (Medicaid vs commercial). */
  benefits?: PlanBenefits;
}

export interface PlanBenefits {
  /** e.g. "Covered (subject to medical necessity + PA)". */
  planCoverageNote?: string;
  /** Member cost share, e.g. "$0 copay (Medicaid)" or "$125 copay (subject to deductible)". */
  costShare: string;
  /** e.g. "$350 met of $1,500 individual" — omit for plans without a deductible. */
  deductible?: string;
  /** e.g. "$1,240 met of $4,000 individual max". */
  outOfPocket?: string;
}

/**
 * A patient in the context of their coverage. `patientId` is the FHIR Patient resource id
 * and is DISTINCT from `coverage.memberId` — conflating the two is finding H7.
 */
export interface PatientContext {
  patientId: string;
  name: string;
  /** ISO birth date. */
  dob: string;
  coverage: PlanMembership;
}

/**
 * Seeded demo patients — the ONE universe both the live PA flow and the portal read.
 * Each carries its own real membership so CRD/PAS derive payer/eligibility from data,
 * not constants. (Fixture data, clearly labeled — not policy logic.)
 */
export const DEMO_PATIENT_CONTEXTS: readonly PatientContext[] = [
  {
    patientId: 'MARIA_SD_001',
    name: 'Maria Redhawk',
    dob: '1978-04-12',
    coverage: {
      payer: 'South Dakota Medicaid',
      payerId: 'sd-medicaid',
      plan: 'SD Medicaid — Fee-for-Service',
      memberId: 'SDM-4471180',
      subscriberId: 'SDM-4471180',
      coverageStatus: 'active',
      eligibilityVerifiedOn: '2026-07-01',
      network: 'SD Medicaid FFS',
      benefits: {
        planCoverageNote: 'Covered (subject to medical necessity + prior authorization)',
        costShare: '$0 copay (Medicaid)',
      },
    },
  },
  {
    patientId: 'patient-priya-natarajan',
    name: 'Priya Natarajan',
    dob: '1969-11-03',
    coverage: {
      payer: 'Dakota Health Plan',
      payerId: 'dakota-health',
      plan: 'Dakota Commercial PPO',
      memberId: '5518820',
      subscriberId: '5518820',
      coverageStatus: 'active',
      eligibilityVerifiedOn: '2026-07-15',
      network: 'Dakota PPO',
      benefits: {
        planCoverageNote: 'Covered (subject to medical necessity + prior authorization)',
        costShare: '$125 copay (subject to deductible)',
        deductible: '$350 met of $1,500 individual',
        outOfPocket: '$1,240 met of $4,000 individual max',
      },
    },
  },
  {
    patientId: 'patient-marcus-bell',
    name: 'Marcus Bell',
    dob: '1985-02-22',
    coverage: {
      payer: 'Dakota Health Plan',
      payerId: 'dakota-health',
      plan: 'Dakota Commercial HMO',
      memberId: '4471902',
      subscriberId: '4471902',
      coverageStatus: 'active',
      eligibilityVerifiedOn: '2026-07-10',
      network: 'Dakota HMO',
      benefits: {
        planCoverageNote: 'Covered (subject to medical necessity + prior authorization)',
        costShare: '$40 copay (subject to deductible)',
        deductible: '$600 met of $2,000 individual',
        outOfPocket: '$900 met of $5,000 individual max',
      },
    },
  },
  {
    patientId: 'patient-wanda-brooks',
    name: 'Wanda Brooks',
    dob: '1956-08-30',
    coverage: {
      payer: 'South Dakota Medicaid',
      payerId: 'sd-medicaid',
      plan: 'SD Medicaid — Managed Care',
      memberId: '3390117',
      subscriberId: '3390117',
      coverageStatus: 'active',
      eligibilityVerifiedOn: '2026-06-28',
      network: 'SD Medicaid MCO',
      benefits: {
        planCoverageNote: 'Covered (subject to medical necessity + prior authorization)',
        costShare: '$0 copay (Medicaid managed care)',
      },
    },
  },
  {
    patientId: 'patient-thomas-okafor',
    name: 'Thomas Okafor',
    dob: '1991-05-14',
    coverage: {
      payer: 'Dakota Health Plan',
      payerId: 'dakota-health',
      plan: 'Dakota Commercial PPO',
      memberId: '2287744',
      subscriberId: '2287744',
      coverageStatus: 'active',
      eligibilityVerifiedOn: '2026-06-20',
      network: 'Dakota PPO',
      benefits: {
        planCoverageNote: 'Covered (subject to medical necessity + prior authorization)',
        costShare: '$110 copay (subject to deductible)',
        deductible: '$0 met of $1,750 individual',
        outOfPocket: '$300 met of $4,500 individual max',
      },
    },
  },
];

const BY_PATIENT_ID = new Map(DEMO_PATIENT_CONTEXTS.map((c) => [c.patientId, c]));
const BY_MEMBER_ID = new Map(DEMO_PATIENT_CONTEXTS.map((c) => [c.coverage.memberId, c]));

/** Look up a seeded patient context by Patient resource id. */
export function getPatientContext(
  patientId: string | null | undefined
): PatientContext | undefined {
  if (!patientId) return undefined;
  return BY_PATIENT_ID.get(patientId);
}

/** Look up a seeded patient context by member id (portal cases key on member id). */
export function getPatientContextByMemberId(memberId: string): PatientContext | undefined {
  return BY_MEMBER_ID.get(memberId);
}

/**
 * Eligibility as of a date: TRUE only when coverage is active AND (when a verification date
 * is present) that verification is not after the date of service. Fail-honest: an unknown or
 * inactive status is never reported eligible.
 */
export function isCoverageActive(ctx: PatientContext, asOf?: string): boolean {
  if (ctx.coverage.coverageStatus !== 'active') return false;
  if (asOf && ctx.coverage.eligibilityVerifiedOn) {
    // verification must be on/before the service date to count as evidence for it
    return Date.parse(ctx.coverage.eligibilityVerifiedOn) <= Date.parse(asOf);
  }
  return true;
}

/** The banner shape the existing UI expects — derived from context, not hardcoded. */
export function patientBannerFrom(ctx: PatientContext): {
  name: string;
  dob: string;
  memberId: string;
} {
  return { name: ctx.name, dob: ctx.dob, memberId: ctx.coverage.memberId };
}
