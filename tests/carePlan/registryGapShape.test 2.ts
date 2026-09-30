/**
 * registryGapShape.test.ts — /care-plan-monitor/[patientId] cannot be dead again.
 *
 * The defect: `detectSDoHNeeds` read `gap.measureName`; the patient registry stores the
 * label as `name` (`careGaps: [{ id, domain, name, status, daysOpen, assignedTo }]`). The
 * page laundered the mismatch with `(patient.careGaps || []) as any`, so every patient hit
 * `TypeError: Cannot read properties of undefined (reading 'toLowerCase')` and the route
 * rendered a Next.js error boundary instead of the care manager's plan-tracking surface.
 *
 * Two guards, because the cast is the defect and the crash is only the symptom:
 *   A. the analysis functions read the label DEFENSIVELY, so the real registry shape
 *      flowing through `generateComprehensiveCarePlan` produces a plan instead of throwing;
 *   B. `fromRegistryGaps` is the typed adapter the page now calls, so a future shape change
 *      is caught by tsc at the call site rather than by a user hitting the route.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { generateComprehensiveCarePlan } from '@/lib/carePlan/builder';
import {
  analyzePatientData,
  detectSDoHNeeds,
  identifyUrgentActions,
} from '@/lib/carePlan/analysis';
import { fromRegistryGaps } from '@/lib/carePlan/registryGaps';
import type { CareGap, Patient } from '@/lib/carePlan/types';
import { getVisiblePatients } from '@/lib/patientRegistry';
import type { CareGapEntry } from '@/lib/patientRegistry.types';

/** The registry's own gap shape — `name`, no `measureName`. */
const REGISTRY_GAPS: CareGapEntry[] = [
  {
    id: 'mg-1',
    domain: 'Clinical',
    name: 'HbA1c Lab',
    status: 'Open',
    daysOpen: 38,
    assignedTo: 'Prairie Health Services',
  },
  {
    id: 'mg-2',
    domain: 'Social',
    name: 'Transportation to appointments',
    status: 'Open',
    daysOpen: 92,
    assignedTo: 'CHW Team',
  },
  {
    id: 'mg-3',
    domain: 'Social',
    name: 'WIC food benefit enrollment',
    status: 'Open',
    daysOpen: 12,
    assignedTo: 'CHW Team',
  },
];

/**
 * The gaps AS THE PAGE USED TO PASS THEM — untyped, straight off the registry. The cast
 * stands in for the `as any` the page had; it is what the runtime actually handed the
 * engine, and the engine must survive it.
 */
const UNTYPED_REGISTRY_GAPS = REGISTRY_GAPS as unknown as CareGap[];

const PATIENT: Patient = {
  id: 'MARIA_SD_001',
  name: 'Test Member',
  dob: '1990-04-02',
  age: 36,
  gender: 'female',
  mrn: 'MRN-0006',
  riskTier: 'High',
  rafScore: 1.8,
  rafScoreDelta: 0.2,
  predictedErRisk: 0.3,
  openHCCSuspects: 1,
  hccSuspectValue: 1200,
  openCareGaps: 3,
  lastContactDate: '2026-09-01',
  attributionStatus: 'Confirmed',
  pmpmCost: 900,
  pmpmTarget: 850,
  primaryCareProvider: 'Dr. Test',
  activeAlerts: 0,
  carePlanStatus: 'Active',
  contractId: 'contract-1',
  phone: '555-0100',
  address: '1 Test Way',
  insuranceId: 'INS-1',
  payer: 'Test Payer',
  enrollmentDate: '2024-01-01',
};

describe('A. the analysis survives the real registry gap shape', () => {
  it('detectSDoHNeeds does not throw on a gap that has `name` and no `measureName`', () => {
    expect(() => detectSDoHNeeds(PATIENT, [], UNTYPED_REGISTRY_GAPS)).not.toThrow();
  });

  it('detectSDoHNeeds still detects the social needs from the registry `name` label', () => {
    const needs = detectSDoHNeeds(PATIENT, [], UNTYPED_REGISTRY_GAPS);
    expect(needs.some((n) => n.startsWith('Transportation barrier'))).toBe(true);
    expect(needs.some((n) => n.startsWith('Food security'))).toBe(true);
  });

  it('identifyUrgentActions names an overdue registry gap instead of "undefined overdue"', () => {
    const urgent = identifyUrgentActions([], UNTYPED_REGISTRY_GAPS, []);
    expect(urgent.some((u) => u.includes('Transportation to appointments'))).toBe(true);
    expect(urgent.join(' ')).not.toMatch(/undefined/);
  });

  it('analyzePatientData survives the untyped shape end to end', () => {
    expect(() =>
      analyzePatientData({
        patient: PATIENT,
        hccSuspects: [],
        careGaps: UNTYPED_REGISTRY_GAPS,
        alerts: [],
      })
    ).not.toThrow();
  });

  /**
   * SCOPE NOTE (reported, not swept): five more sites in this domain read
   * `gap.measureName.toLowerCase()` unguarded — templates.ts:82, builder.ts:264/:271,
   * holistic.ts:154/:157, referrals.ts:32 — so the FULL `generateComprehensiveCarePlan`
   * chain still throws on an untyped registry gap. Those files are outside this change's
   * ownership. The app path is nonetheless safe, because the page now goes through
   * `fromRegistryGaps` (proven by the suite below). This test pins the boundary so the
   * finding cannot be quietly forgotten: when the sweep lands, flip it to `.not.toThrow()`.
   */
  it('the wider chain is STILL unguarded outside analysis.ts — documents the open sweep', () => {
    expect(() =>
      generateComprehensiveCarePlan({
        patient: PATIENT,
        hccSuspects: [],
        careGaps: UNTYPED_REGISTRY_GAPS,
        alerts: [],
      })
    ).toThrow(/toLowerCase/);
  });
});

describe('B. fromRegistryGaps is the typed adapter the page calls', () => {
  it('maps the registry `name` onto the domain `measureName`', () => {
    const mapped = fromRegistryGaps(REGISTRY_GAPS, 'MARIA_SD_001');
    expect(mapped.map((g) => g.measureName)).toEqual([
      'HbA1c Lab',
      'Transportation to appointments',
      'WIC food benefit enrollment',
    ]);
    expect(mapped.every((g) => g.patientId === 'MARIA_SD_001')).toBe(true);
  });

  it('carries the registry status and daysOpen through unchanged', () => {
    const mapped = fromRegistryGaps(REGISTRY_GAPS, 'MARIA_SD_001');
    expect(mapped[1].status).toBe('Open');
    expect(mapped[1].daysOpen).toBe(92);
  });

  it('the mapped gaps flow through the generator and detect the same needs', () => {
    const mapped = fromRegistryGaps(REGISTRY_GAPS, 'MARIA_SD_001');
    const needs = detectSDoHNeeds(PATIENT, [], mapped);
    expect(needs.some((n) => n.startsWith('Transportation barrier'))).toBe(true);
  });

  it("a MAPPED plan generates end to end — the route's actual path", () => {
    const plan = generateComprehensiveCarePlan({
      patient: PATIENT,
      hccSuspects: [],
      careGaps: fromRegistryGaps(REGISTRY_GAPS, 'MARIA_SD_001'),
      alerts: [],
    });
    expect(plan.title.length).toBeGreaterThan(0);
    expect(plan.goals.length).toBeGreaterThan(0);
  });

  it('every mock-visible registry patient maps and generates without throwing', () => {
    const patients = getVisiblePatients(true);
    expect(patients.length).toBeGreaterThan(0);
    for (const registryPatient of patients) {
      const gaps = fromRegistryGaps(registryPatient.careGaps, registryPatient.platformId);
      expect(() =>
        generateComprehensiveCarePlan({
          patient: { ...PATIENT, id: registryPatient.platformId },
          hccSuspects: [],
          careGaps: gaps,
          alerts: [],
        })
      ).not.toThrow();
    }
  });
});

describe('C. the page no longer launders the shape with a cast', () => {
  it('the care-plan-monitor route passes careGaps through the typed adapter', () => {
    const rel = 'src/app/care-plan-monitor/[patientId]/page.tsx';
    const src = fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
    expect(src).not.toMatch(/careGaps:\s*\(patient\.careGaps[^)]*\)\s*as\s+any/);
    expect(src).toMatch(/fromRegistryGaps\(/);
  });
});
