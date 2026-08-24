// CONTRACT: C1  // DP-1  // WPC-01 Phase 3
/**
 * Pure section mappers for the projected-graph holistic aggregator. Each turns
 * consent-filtered lens output (nodes + edges) into one HolisticPatientContext
 * section. No store, no I/O, no globals — trivially unit-testable, and split out
 * of projectedAggregator.ts to keep both modules under the size cap.
 *
 * Graph-driven sections (patient, clinicalProfile, barriers) read real nodes;
 * the neutral* builders return honest null-objects for sections without a domain
 * mapper yet — the aggregator declares which is which in `contextProvenance`.
 */
import type { GraphNodeRecord, PropVal } from '@/lib/graph/types';
import type { LensResult } from '@/lib/graph/lens/types';
import type {
  AccessProfile,
  BarrierDetail,
  BarrierProfile,
  CareGap,
  CaregiverStatus,
  ChronicCondition,
  ClinicalProfile,
  DigitalProfile,
  FinancialProfile,
  Medication,
  PatientBasicInfo,
  PsychosocialProfile,
} from '@/lib/services/holisticContextEngine.types';

/** Sections built from the real projected graph. */
export const PROJECTED_SECTIONS = ['patient', 'clinicalProfile', 'barriers'];
/** Sections filled with neutral null-objects (no domain mapper yet). */
export const NEUTRAL_SECTIONS = [
  'caregiverStatus',
  'financialProfile',
  'accessProfile',
  'digitalProfile',
  'psychosocialProfile',
];

// ─── helpers ────────────────────────────────────────────────────────────────

function s(v: PropVal | undefined, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function nodesOfKind(nodes: GraphNodeRecord[], kind: string): GraphNodeRecord[] {
  return nodes.filter((n) => n.kind === kind);
}
/** target-node key -> earliest edge validity.start, for dating derived facts. */
function edgeStartByTarget(edges: LensResult['edges'], types: string[]): Map<string, string> {
  const want = new Set(types);
  const out = new Map<string, string>();
  for (const e of edges) {
    if (!want.has(e.type)) continue;
    const prev = out.get(e.to.key);
    if (prev === undefined || e.validity.start < prev) out.set(e.to.key, e.validity.start);
  }
  return out;
}

// ─── patient ────────────────────────────────────────────────────────────────

export function mapPatient(member: GraphNodeRecord): PatientBasicInfo {
  const p = member.properties;
  return {
    id: member.key,
    name: s(p.name) || member.key,
    age: typeof p.age === 'number' ? p.age : 0,
    gender: s(p.gender) || 'unknown',
    mrn: s(p.mrn) || undefined,
  };
}

// ─── barriers ───────────────────────────────────────────────────────────────

type BarrierKey = keyof BarrierProfile;

function barrierKeyForDomain(domain: string): BarrierKey | null {
  const d = domain.toLowerCase();
  if (d.includes('transport')) return 'transportation';
  if (d.includes('food') || d.includes('nutrition') || d.includes('hunger')) return 'food';
  if (d.includes('hous') || d.includes('homeless') || d.includes('shelter')) return 'housing';
  if (
    d.includes('financ') ||
    d.includes('income') ||
    d.includes('employ') ||
    d.includes('material') ||
    d.includes('utilit')
  )
    return 'financial';
  if (
    d.includes('digital') ||
    d.includes('technolog') ||
    d.includes('broadband') ||
    d.includes('internet') ||
    d.includes('device')
  )
    return 'technology';
  if (d.includes('language') || d.includes('interpret') || d.includes('literac')) return 'language';
  return null;
}

function neutralBarrier(): BarrierDetail {
  return { severity: 'none', status: 'not-screened' };
}
function emptyBarrierProfile(): BarrierProfile {
  return {
    transportation: neutralBarrier(),
    financial: neutralBarrier(),
    housing: neutralBarrier(),
    food: neutralBarrier(),
    technology: neutralBarrier(),
    language: neutralBarrier(),
  };
}

/** SDOH lens (SdohScreening + SocialNeed nodes) -> the six-barrier profile. */
export function mapBarriers(sdoh: LensResult): BarrierProfile {
  const out = emptyBarrierProfile();
  const dated = edgeStartByTarget(sdoh.edges, ['SCREENED_FOR', 'HAS_UNMET_NEED']);

  // Screenings first: a negative screen RESOLVES a barrier, a positive one flags it.
  for (const n of nodesOfKind(sdoh.nodes, 'SdohScreening')) {
    const key = barrierKeyForDomain(s(n.properties.domain));
    if (!key) continue;
    const domain = s(n.properties.domain);
    const date = dated.get(n.key);
    out[key] =
      n.properties.positive === true
        ? {
            severity: 'high',
            status: 'identified',
            description: `Positive ${domain} screen`,
            screeningDate: date,
          }
        : {
            severity: 'low',
            status: 'resolved',
            description: `Negative ${domain} screen`,
            screeningDate: date,
          };
  }
  // Unmet needs are authoritative: an asserted unmet need is always identified/high.
  for (const n of nodesOfKind(sdoh.nodes, 'SocialNeed')) {
    const key = barrierKeyForDomain(s(n.properties.domain));
    if (!key) continue;
    const domain = s(n.properties.domain);
    out[key] = {
      severity: 'high',
      status: 'identified',
      description: `Unmet need: ${domain}`,
      screeningDate: dated.get(n.key) ?? out[key].screeningDate,
    };
  }
  return out;
}

// ─── clinical ───────────────────────────────────────────────────────────────

function mapCareGaps(careGap: LensResult): CareGap[] {
  const gaps: CareGap[] = [];
  for (const n of careGap.nodes) {
    if (n.kind === 'SocialNeed') {
      gaps.push({
        id: n.key,
        type: `SDOH_${s(n.properties.domain, 'unknown')}`,
        description: `Unmet social need: ${s(n.properties.domain, 'unknown')}`,
        priority: 'high',
      });
    } else if (n.kind === 'Encounter') {
      gaps.push({
        id: n.key,
        type: 'OPEN_ENCOUNTER',
        description: `Open ${s(n.properties.encounterClass, 'encounter')} encounter`,
        priority: 'high',
      });
    }
  }
  return gaps;
}

/** Whole-person (superset) + care-gap lens -> the clinical profile. */
export function mapClinical(whole: LensResult, careGap: LensResult): ClinicalProfile {
  const dxDate = edgeStartByTarget(whole.edges, ['HAS_PROBLEM']);

  const chronicConditions: ChronicCondition[] = nodesOfKind(whole.nodes, 'Condition').map((n) => {
    const code = s(n.properties.code) || 'unknown';
    const active = s(n.properties.clinicalStatus, 'active') === 'active';
    return {
      name: code,
      icdCode: code === 'unknown' ? undefined : code,
      // HCC-relevant conditions carry risk-adjustment weight; others default moderate.
      severity: n.properties.hccRelevant === true ? 'high' : 'moderate',
      controlled: !active,
      diagnosisDate: dxDate.get(n.key),
    };
  });

  const medications: Medication[] = nodesOfKind(whole.nodes, 'Medication').map((n) => ({
    name: s(n.properties.rxNorm) || 'unknown',
  }));

  const openCareGaps = mapCareGaps(careGap);
  const encounters = nodesOfKind(whole.nodes, 'Encounter');

  const conditionCount = chronicConditions.length;
  // Transparent, formulaic proxy — NOT a clinical score. Documented as derived.
  const complexityScore = Math.min(
    100,
    conditionCount * 12 + openCareGaps.length * 8 + medications.length * 2
  );
  const riskLevel: ClinicalProfile['riskLevel'] =
    complexityScore >= 75
      ? 'critical'
      : complexityScore >= 50
        ? 'high'
        : complexityScore >= 25
          ? 'moderate'
          : 'low';

  return {
    chronicConditions,
    conditionCount,
    complexityScore,
    riskLevel,
    openCareGaps,
    medications,
    recentHospitalizations: encounters.filter((n) => s(n.properties.encounterClass) === 'IMP')
      .length,
    erVisits: encounters.filter((n) => ['EMER', 'ER'].includes(s(n.properties.encounterClass)))
      .length,
  };
}

// ─── neutral null-objects (no projected source yet) ──────────────────────────

export function neutralCaregiver(): CaregiverStatus {
  return {
    isCaregiverForOthers: false,
    dependents: [],
    caregiverBurdenScore: 0,
    timeAvailability: {
      weekdayMorning: 'available',
      weekdayAfternoon: 'available',
      weekdayEvening: 'available',
      weekend: 'available',
    },
    respiteCareAvailable: false,
    supportSystem: { familyNearby: false, friendSupport: false, communityResources: [] },
  };
}
export function neutralFinancial(): FinancialProfile {
  return {
    householdIncome: 'moderate',
    insuranceCoverage: { type: 'Uninsured', copays: false, deductible: 0, hasSupplemental: false },
    outOfPocketBurden: 0,
    employmentStatus: 'unemployed',
    financialStressScore: 0,
  };
}
export function neutralAccess(): AccessProfile {
  return {
    ruralStatus: 'urban',
    distanceToProvider: 0,
    publicTransitAvailable: false,
    broadbandAccess: false,
    cellularCoverage: 'none',
    nearestPharmacy: 0,
    nearestER: 0,
  };
}
export function neutralDigital(): DigitalProfile {
  return {
    hasSmartphone: false,
    hasComputer: false,
    hasInternet: false,
    videoCapable: false,
    digitalLiteracy: 'low',
    preferredContactMethod: 'phone',
  };
}
export function neutralPsychosocial(): PsychosocialProfile {
  return {
    healthLiteracy: 'moderate',
    motivationLevel: 'moderate',
    socialIsolation: false,
    stressLevel: 'low',
  };
}
