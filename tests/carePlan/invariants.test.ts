/**
 * Care Plan property invariants (DP-4, g5-careplan.md section 3.2) run over
 * a deterministic generated context matrix (48 combinations) plus the six
 * golden fixtures:
 *   P1 no goal without at least one intervention
 *   P3 every clinical recommendation carries >=1 citation (reference-level,
 *      honestly marked not-SME-reviewed)
 *   P4 every SDOH barrier in input is addressed or explicitly deferred
 *   P5 determinism: same context twice => identical plan
 *   P6 the plan maps to FHIR CarePlan/Goal shapes without throwing
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setClock } from '@/lib/clock';
import {
  generateComprehensiveCarePlan,
  generateHolisticCarePlan,
  detectSDoHNeeds,
  checkGoalsHaveInterventions,
  checkCitationCoverage,
  checkSdohDisposition,
  toFhirCarePlan,
  type ComprehensivePlanInput,
  type Patient,
  type CareGap,
  type HCCSuspect,
  type UtilizationAlert,
} from '@/lib/carePlan';

import diabetesTransportation from './fixtures/diabetes-transportation.json';
import bhPart2 from './fixtures/bh-part2.json';
import polypharmacyElder from './fixtures/polypharmacy-elder.json';
import pregnancy from './fixtures/pregnancy.json';
import pediatricCaregiver from './fixtures/pediatric-caregiver.json';
import minimalData from './fixtures/minimal-data.json';

const FIXED_TIME = new Date('2026-08-22T12:00:00Z').getTime();
beforeAll(() => setClock(() => FIXED_TIME));
afterAll(() => setClock(null));

// ── Deterministic context generator (property-style matrix, no RNG) ────────

function mkPatient(id: string, riskTier: Patient['riskTier'], openHCCSuspects: number): Patient {
  return {
    id,
    name: `Gen Member ${id}`,
    dob: '1980-01-01',
    age: 46,
    gender: 'Female',
    mrn: `MRN-${id}`,
    riskTier,
    rafScore: 1.0,
    rafScoreDelta: 0,
    predictedErRisk: 10,
    openHCCSuspects,
    hccSuspectValue: 0,
    openCareGaps: 0,
    lastContactDate: '2026-08-01',
    attributionStatus: 'Confirmed',
    pmpmCost: 500,
    pmpmTarget: 500,
    primaryCareProvider: 'Dr. Gen PCP',
    activeAlerts: 0,
    carePlanStatus: 'None',
    contractId: 'contract-gen',
    phone: '555-0000',
    address: '1 Gen St',
    insuranceId: 'INS-GEN',
    payer: 'Gen Plan',
    enrollmentDate: '2024-01-01',
  };
}

function mkGap(id: string, measureName: string, notes: string): CareGap {
  return {
    id,
    patientId: 'gen',
    measureId: `M-${id}`,
    measureName,
    program: 'HEDIS',
    status: 'Open',
    dueDate: '2026-10-01',
    daysOpen: 30,
    lastActionDate: '2026-08-01',
    assignedTo: 'Care Manager',
    notes,
    closureRequirement: `${measureName} completed`,
  };
}

function mkHcc(id: string, hccDescription: string): HCCSuspect {
  return {
    id,
    patientId: 'gen',
    hccCode: `HCC-${id}`,
    hccDescription,
    icdCode: 'E11.9',
    icdDescription: hccDescription,
    estimatedRafDelta: 0.2,
    estimatedRevenueDelta: 2600,
    status: 'Surfaced',
    evidenceSources: ['Claims'],
    lastEncounterDate: '2026-06-01',
    suspectConfidence: 80,
    assignedPhysician: 'Dr. Gen PCP',
    submissionDeadline: '2026-12-31',
    dataSource: 'Claims',
    freshnessDate: '2026-08-01',
  };
}

function mkAlert(
  id: string,
  tier: UtilizationAlert['tier'],
  type: UtilizationAlert['type'],
  description: string
): UtilizationAlert {
  return {
    id,
    patientId: 'gen',
    tier,
    type,
    description,
    riskScore: 60,
    estimatedCost: 5000,
    createdDate: '2026-08-01',
    source: 'Claims',
    status: 'Active',
    freshnessDate: '2026-08-10',
  };
}

const GAP_SETS: CareGap[][] = [
  [],
  [mkGap('g1', 'HbA1c Lab Test', 'lab overdue')],
  [mkGap('g2', 'Depression Screening (PHQ-9)', 'screening due')],
  [
    mkGap('g3', 'Well-Child Visit (3-11 years)', 'visit overdue'),
    mkGap('g4', 'Transportation Needs Assessment', 'no ride to clinic'),
  ],
];
const HCC_SETS: HCCSuspect[][] = [[], [mkHcc('h1', 'Diabetes with Chronic Complications')]];
const ALERT_SETS: UtilizationAlert[][] = [
  [],
  [mkAlert('a1', 'Important', 'Poly-Pharmacy', 'Many active medications with interaction risk')],
  [mkAlert('a2', 'Critical', 'Predicted ER Risk', 'High predicted ER utilization risk')],
];
const TIERS: Patient['riskTier'][] = ['Low', 'High'];

function contextMatrix(): ComprehensivePlanInput[] {
  const contexts: ComprehensivePlanInput[] = [];
  let n = 0;
  for (const gaps of GAP_SETS) {
    for (const hccs of HCC_SETS) {
      for (const alerts of ALERT_SETS) {
        for (const tier of TIERS) {
          n += 1;
          contexts.push({
            patient: mkPatient(`gen-${n}`, tier, hccs.length),
            hccSuspects: hccs,
            careGaps: gaps,
            alerts,
          });
        }
      }
    }
  }
  return contexts;
}

const FIXTURE_INPUTS = (
  [
    diabetesTransportation,
    bhPart2,
    polypharmacyElder,
    pregnancy,
    pediatricCaregiver,
    minimalData,
  ] as unknown as Array<{
    input: ComprehensivePlanInput;
  }>
).map((f) => f.input);

const ALL_CONTEXTS: ComprehensivePlanInput[] = [...FIXTURE_INPUTS, ...contextMatrix()];

describe('care plan property invariants (fixtures + 48-context matrix)', () => {
  it('P1: no goal is ever left without at least one intervention', () => {
    for (const input of ALL_CONTEXTS) {
      const plan = generateComprehensiveCarePlan(input);
      expect(checkGoalsHaveInterventions(plan)).toEqual([]);
    }
  });

  it('P3: every goal and intervention carries at least one citation, honestly marked', () => {
    for (const input of ALL_CONTEXTS) {
      const plan = generateComprehensiveCarePlan(input);
      expect(checkCitationCoverage(plan)).toEqual([]);
      // Honesty markers on every citation
      for (const cites of [
        ...Object.values(plan.citations?.goals ?? {}),
        ...Object.values(plan.citations?.interventions ?? {}),
      ]) {
        for (const cite of cites) {
          expect(cite.reviewLevel).toBe('reference-level');
          expect(cite.smeReviewed).toBe(false);
          expect(cite.sourceId.length).toBeGreaterThan(0);
          expect(cite.title.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('P4: every detected SDOH barrier is addressed or explicitly deferred, never dropped', () => {
    for (const input of ALL_CONTEXTS) {
      const plan = generateComprehensiveCarePlan(input);
      const needs = detectSDoHNeeds(input.patient, input.alerts, input.careGaps);
      expect(checkSdohDisposition(plan, needs)).toEqual([]);
    }
  });

  it('P5: same context twice yields an identical plan (determinism under a pinned clock)', () => {
    for (const input of ALL_CONTEXTS) {
      const first = generateComprehensiveCarePlan(input);
      const second = generateComprehensiveCarePlan(input);
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    }
  });

  it('P6: every generated plan maps to FHIR CarePlan/Goal shapes without throwing', () => {
    for (const input of ALL_CONTEXTS) {
      const plan = generateComprehensiveCarePlan(input);
      const projection = toFhirCarePlan(plan, input.patient.id);
      expect(projection.carePlan.resourceType).toBe('CarePlan');
      expect(projection.carePlan.status).toBe('draft');
      expect(projection.carePlan.intent).toBe('plan');
      expect(projection.carePlan.subject?.reference).toBe(`Patient/${input.patient.id}`);
      expect(projection.goals.length).toBe(plan.goals.length);
      for (const goal of projection.goals) {
        expect(goal.resourceType).toBe('Goal');
        expect(goal.lifecycleStatus).toBeTruthy();
        expect(goal.description?.text).toBeTruthy();
      }
    }
  });
});

describe('holistic path invariants', () => {
  it('holistic generation returns a plan with citations and SDOH disposition, deterministically', () => {
    const input = FIXTURE_INPUTS[0];
    const first = generateHolisticCarePlan(input);
    const second = generateHolisticCarePlan(input);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(first.citations).toBeTruthy();
    expect(first.sdohSummary).toBeTruthy();
    expect(checkCitationCoverage(first)).toEqual([]);
    const needs = detectSDoHNeeds(input.patient, input.alerts, input.careGaps);
    expect(checkSdohDisposition(first, needs)).toEqual([]);
    // Maps to FHIR without throwing
    expect(toFhirCarePlan(first, input.patient.id).carePlan.resourceType).toBe('CarePlan');
  });
});
