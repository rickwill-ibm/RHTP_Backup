import * as clock from '@/lib/clock'; // deterministic time/rng seam (test setters: setClock/setRng)
import { getAllPatients, getVisiblePatients } from '../patientRegistry';
import { getFhirMockMode } from '../services/fhirClient';
import { CARE_TEAM_MEMBERS, type Specialty } from './members';
import {
  attributePatient,
  specialtyForMeasure,
  type AttributablePatient,
  type AttributionResult,
  type PrimaryDomain,
} from './attribution';
import { toAttributable } from './identity';
import { samplePanel, panelPersonToAttributable } from './population';

export type MeasureProgram = 'STARS' | 'HEDIS' | 'BH' | 'Social';

export interface MeasureDescriptor {
  measureKey: string;
  measureName: string;
  contractName: string;
  program: MeasureProgram;
  openGapCount: number;
}

export interface Cohort {
  id: string;
  measureKey: string;
  measureName: string;
  contractName: string;
  program: MeasureProgram;
  specialty: Specialty;
  denominator: number;
  patientIds: string[];
  patients: AttributablePatient[];
  assignments: Record<string, AttributionResult>;
  distribution: Record<string, number>;
  createdAt: string;
  status: 'active' | 'closed';
}

const SOCIAL_WORK_CAP = 60;

function domainForSpecialty(s: Specialty): PrimaryDomain {
  if (s === 'Behavioral Health') return 'BH';
  if (s === 'Social/SDOH') return 'Social';
  return 'Clinical';
}

function matchingRealPatients(specialty: Specialty): AttributablePatient[] {
  return getVisiblePatients(getFhirMockMode())
    .map(toAttributable)
    .filter((p) => p.specialtyNeed === specialty);
}

export function buildCohort(m: MeasureDescriptor): Cohort {
  const specialty = specialtyForMeasure(m.measureKey);
  const domain = domainForSpecialty(specialty);

  const isSocial = m.program === 'Social';
  const workSize = isSocial ? Math.min(m.openGapCount, SOCIAL_WORK_CAP) : m.openGapCount;

  const reals = matchingRealPatients(specialty).slice(0, workSize);

  const remaining = Math.max(0, workSize - reals.length);
  const stubs = samplePanel(m.measureKey, remaining).map((person) =>
    panelPersonToAttributable(person, domain, specialty, m.contractName)
  );

  const patients = [...reals, ...stubs];

  const liveLoad: Record<string, number> = {};
  const assignments: Record<string, AttributionResult> = {};
  const distribution: Record<string, number> = {};
  for (const p of patients) {
    const res = attributePatient(p, CARE_TEAM_MEMBERS, liveLoad);
    assignments[p.platformId] = res;
    distribution[res.memberId] = (distribution[res.memberId] ?? 0) + 1;
  }

  return {
    id: `cohort-${m.measureKey}-${clock.now()}`,
    measureKey: m.measureKey,
    measureName: m.measureName,
    contractName: m.contractName,
    program: m.program,
    specialty,
    denominator: m.openGapCount,
    patientIds: patients.map((p) => p.platformId),
    patients,
    assignments,
    distribution,
    createdAt: clock.nowIso(),
    status: 'active',
  };
}
