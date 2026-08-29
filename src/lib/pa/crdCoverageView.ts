/**
 * CRD coverage-view model — assembles everything the CRD screen renders, from the member's context,
 * the CRD determination, and the published rule. Pure + data-driven: the SAME builder serves any
 * patient/plan/order (production mode), so the screen is a template over data, not a one-patient page.
 *
 * Da Vinci altitude (kept honest here): this carries coverage + PA determination + documentation
 * NEEDED + the questionnaire pointer + eligibility/benefits (labeled 270/271). It deliberately does
 * NOT carry per-criterion "Met/Partially-met" — that is DTR pre-population, produced after launch.
 */
import type { CrdCheckResult } from './pa-types';
import type { PatientContext } from './patientContext';
import type { CrdCoverageRule, CrdDocRequirement } from './publishedCoverage';

export type CellTone = 'ok' | 'warn' | 'bad' | 'plain';

export interface CrdDeterminationCell {
  label: string;
  value: string;
  tone: CellTone;
  sub?: string;
}

export interface CrdBenefitRow {
  label: string;
  value: string;
}

export interface CrdCoverageViewModel {
  patient: { name: string; initials: string; memberId: string; dob: string };
  provider: string;
  order: { desc: string; cpt: string; dxCode?: string; dxLabel?: string; orderedOn: string };
  payer: string;
  plan: string;
  network?: string;
  site: string;
  coverageFound: boolean;
  paRequired: boolean;
  determination: CrdDeterminationCell[];
  benefits: { source: string; rows: CrdBenefitRow[] };
  docNeeded: CrdDocRequirement[];
  criteriaNames: string[];
  clinicalGuideline?: string;
  referenceId: string;
  questionnaireCanonical?: string;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}

export interface BuildCrdViewInput {
  ctx: PatientContext;
  determination: CrdCheckResult;
  rule: CrdCoverageRule;
  order: { desc: string; cpt: string; orderedOn: string; provider: string };
  referenceId: string;
  site?: string;
}

export function buildCrdCoverageViewModel(input: BuildCrdViewInput): CrdCoverageViewModel {
  const { ctx, determination, rule, order } = input;
  const cov = ctx.coverage;
  const site = input.site ?? 'Outpatient';
  const paRequired = determination.paRequired.required;
  const docNeeded = rule.docNeeded ?? [];

  const determinationCells: CrdDeterminationCell[] = [
    {
      label: 'Coverage',
      value: determination.patientEnrolled.pass ? 'Active' : 'Inactive',
      tone: determination.patientEnrolled.pass ? 'ok' : 'bad',
      sub: determination.patientEligible.pass
        ? 'Eligible for date of service'
        : 'Eligibility unverified',
    },
    {
      label: 'Network',
      value: determination.providerInNetwork.pass ? 'In-network' : 'Unverified',
      tone: determination.providerInNetwork.pass ? 'ok' : 'plain',
      sub: cov.network ?? cov.plan,
    },
    {
      label: 'Prior auth',
      value: paRequired ? 'Required' : 'Not required',
      tone: paRequired ? 'warn' : 'plain',
      sub: 'Determination',
    },
    {
      label: 'Documentation',
      value: docNeeded.length > 0 ? 'Clinical' : 'None required',
      tone: docNeeded.length > 0 ? 'warn' : 'plain',
      sub: docNeeded.length > 0 ? 'Complete in DTR' : undefined,
    },
    { label: 'Site of service', value: site, tone: 'ok', sub: 'Hospital / ASC' },
  ];

  const rows: CrdBenefitRow[] = [{ label: 'Plan', value: `${cov.payer} — ${cov.plan}` }];
  const b = cov.benefits;
  if (b?.planCoverageNote) rows.push({ label: 'Benefit', value: b.planCoverageNote });
  if (b?.costShare) rows.push({ label: 'Member cost share', value: b.costShare });
  if (b?.deductible) rows.push({ label: 'Deductible', value: b.deductible });
  if (b?.outOfPocket) rows.push({ label: 'Out-of-pocket', value: b.outOfPocket });
  if (rule.clinicalGuideline)
    rows.push({ label: 'Clinical guideline', value: rule.clinicalGuideline });
  rows.push({ label: 'Reference ID', value: input.referenceId });

  return {
    patient: {
      name: ctx.name,
      initials: initialsOf(ctx.name),
      memberId: cov.memberId,
      dob: ctx.dob,
    },
    provider: order.provider,
    order: {
      desc: order.desc,
      cpt: order.cpt,
      dxCode: rule.primaryDx?.code,
      dxLabel: rule.primaryDx?.label,
      orderedOn: order.orderedOn,
    },
    payer: cov.payer,
    plan: cov.plan,
    network: cov.network,
    site,
    coverageFound: determination.patientEnrolled.pass,
    paRequired,
    determination: determinationCells,
    benefits: { source: 'X12 270/271 eligibility', rows },
    docNeeded,
    criteriaNames: rule.criteriaNames ?? [],
    clinicalGuideline: rule.clinicalGuideline,
    referenceId: input.referenceId,
    questionnaireCanonical: rule.questionnaireCanonical,
  };
}
