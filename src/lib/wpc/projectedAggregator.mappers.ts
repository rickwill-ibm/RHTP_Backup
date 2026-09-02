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
import type { ConsentScope, LensResult } from '@/lib/graph/lens/types';
import { MEMBER_KIND } from '@/lib/graph/mapping/spec';
import { ACCESS_CONTEXT_KIND } from '@/lib/graph/mapping/access';
import type {
  AccessProfile,
  BarrierDetail,
  BarrierProfile,
  CareGap,
  CaregiverStatus,
  CareTeamSummary,
  ChronicCondition,
  ClinicalProfile,
  DigitalProfile,
  FinancialProfile,
  Medication,
  PatientBasicInfo,
  Part2RestrictionSummary,
  PsychosocialProfile,
} from '@/lib/services/holisticContextEngine.types';

/** Sections built from the real projected graph. */
export const PROJECTED_SECTIONS = [
  'patient',
  'clinicalProfile',
  'barriers',
  'careTeam',
  'part2Restricted',
  'accessProfile',
  // ── WPC payer dimensions (projected-graph path only).
  'riskProfile',
  'coverage',
  'utilization',
  'alerts',
];
/** Sections filled with neutral null-objects (no domain mapper yet). */
export const NEUTRAL_SECTIONS = [
  'caregiverStatus',
  'financialProfile',
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
const RURAL_STATUS = new Set(['urban', 'suburban', 'rural', 'frontier']);
const CELL_COVERAGE = new Set(['excellent', 'good', 'fair', 'poor', 'none']);

function strOrU(v: PropVal | undefined): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}
function numOrU(v: PropVal | undefined): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
function boolOrU(v: PropVal | undefined): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

/** Honest fail-closed access profile — no access data resolved for this member. */
export function unknownAccess(): AccessProfile {
  return { ruralStatus: 'unknown', dataAvailability: 'unknown' };
}

/**
 * Access dimension from the whole-person lens (the AccessContext node rides the
 * superset lens off the member — no dedicated lens needed). EVERY field fails
 * closed: an absent/unknown value is OMITTED or 'unknown', NEVER a fabricated
 * 'urban'/0/false. An unrecognised enum value also fails closed to unknown.
 */
export function mapAccess(whole: LensResult): AccessProfile {
  const node = nodesOfKind(whole.nodes, ACCESS_CONTEXT_KIND)[0];
  if (!node) return unknownAccess(); // no access node at all
  const p = node.properties;
  const rural = strOrU(p.ruralStatus);
  const cell = strOrU(p.cellularCoverage);
  const knownRural = !!(rural && RURAL_STATUS.has(rural));
  const out: AccessProfile = {
    ruralStatus: knownRural ? (rural as AccessProfile['ruralStatus']) : 'unknown',
  };
  let resolved = knownRural ? 1 : 0;
  const set = <K extends keyof AccessProfile>(k: K, v: AccessProfile[K] | undefined) => {
    if (v !== undefined) {
      out[k] = v;
      resolved += 1;
    }
  };
  set('distanceToProvider', numOrU(p.distanceToProviderMiles));
  set('publicTransitAvailable', boolOrU(p.publicTransitAvailable));
  set('broadbandAccess', boolOrU(p.broadbandAvailable));
  set(
    'cellularCoverage',
    cell && CELL_COVERAGE.has(cell) ? (cell as AccessProfile['cellularCoverage']) : undefined
  );
  set('nearestPharmacy', numOrU(p.nearestPharmacyMiles));
  set('nearestER', numOrU(p.nearestERMiles));
  set('distanceToNearestFacility', numOrU(p.nearestFacilityMiles));
  set('nearestLabLocation', strOrU(p.nearestLabLocation));
  // Honest availability: a present-but-empty node is NOT 'reported'. 'reported'
  // requires a known rural status plus at least one more resolved field.
  out.dataAvailability =
    resolved === 0 ? 'unknown' : knownRural && resolved >= 2 ? 'reported' : 'partial';
  return out;
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

// ─── care-team + Part 2 (previously computed by the lens bundle, then dropped) ──

/**
 * Care-team composition from the care-team lens. The lens returns every participant
 * reached via HAS_CARE_TEAM — a participant may be a CareTeamMember, a Practitioner,
 * or an NPI-converged ProviderIdentity node (the treating physician), so we count
 * everything that is NOT the member node rather than a single kind (which would drop
 * the physician). Role travels as a node property on every participant kind. Roles
 * are de-duped, order-stable.
 */
export function mapCareTeam(careTeam: LensResult): CareTeamSummary {
  const members = careTeam.nodes.filter((n) => n.kind !== MEMBER_KIND);
  const roles: string[] = [];
  for (const m of members) {
    const role = s(m.properties.role);
    if (role && !roles.includes(role)) roles.push(role);
  }
  return { memberCount: members.length, roles };
}

/**
 * 42 CFR Part 2 restriction status. The lens already consent-filters, so a scope
 * without Part 2 yields zero restricted nodes; `disclosed` records the scope grant
 * so an enforced restriction is distinguishable from a genuine absence of data.
 */
export function mapPart2(part2: LensResult, scope: ConsentScope): Part2RestrictionSummary {
  const disclosed = scope.part2 === true;
  // The lens consent-filters: without a Part 2 grant it returns ZERO restricted nodes
  // even when restricted data exists and is being WITHHELD. Reporting 0 there would
  // read as "no Part 2 data" — the opposite of the truth. So the count is authoritative
  // ONLY when disclosed; otherwise it is null (unknown), never asserted as zero.
  const restrictedNodeCount = disclosed ? part2.nodes.filter((n) => n.restricted).length : null;
  return { restrictedNodeCount, disclosed };
}
