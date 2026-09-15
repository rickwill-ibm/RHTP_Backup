// careTeam/attribution.ts — Deterministic, explainable case-manager attribution.
// Same input always yields the same output (no Math.random at assignment time).

import { CARE_TEAM_MEMBERS, cohortOwnerPool, type CareTeamMember, type Specialty } from './members';

// Re-export Specialty so identity.ts / population.ts can import it from here
export type { Specialty };

// ─── Patient shape the algorithm reasons over ─────────────────────────────────
export type RiskTier = 'Critical' | 'High' | 'Moderate' | 'Low';
export type PrimaryDomain = 'Clinical' | 'BH' | 'Social';

export interface AttributablePatient {
  platformId: string;
  name: string;
  riskTier: RiskTier;
  rafScore: number;
  primaryDomain: PrimaryDomain;
  specialtyNeed: Specialty;
  pcpOrganization?: string;
  existingMemberId?: string; // for continuity (already-assigned CM)
  language?: string;
  region?: string;
  tribal?: boolean;
  contract?: string;
  synthetic?: boolean;
}

export interface AttributionResult {
  patientId: string;
  memberId: string;
  score: number;
  confidence: 'High' | 'Medium' | 'Low';
  rationale: string;
  alternates: { memberId: string; score: number }[];
  overCapacityException?: boolean;
}

// ─── Measure → specialty map ──────────────────────────────────────────────────
export const MEASURE_SPECIALTY_MAP: Record<string, Specialty> = {
  // STARS
  D01: 'Diabetes',
  C12: 'Cardiometabolic',
  D08: 'Diabetes',
  B09: 'Preventive',
  // HEDIS
  'CDC-HbA1c': 'Diabetes',
  CBP: 'Cardiometabolic',
  BCS: 'Preventive',
  COL: 'Preventive',
  // BH
  FUH: 'Behavioral Health',
  FUM: 'Behavioral Health',
  AMM: 'Behavioral Health',
  SAA: 'Behavioral Health',
  // Social
  PRAPARE: 'Social/SDOH',
  'SNAP-ENR': 'Social/SDOH',
  'HOUS-REF': 'Social/SDOH',
  'CHW-VISIT': 'Social/SDOH',
  'DUAL-NEED': 'Social/SDOH',
};

export function specialtyForMeasure(measureKey: string): Specialty {
  return MEASURE_SPECIALTY_MAP[measureKey] ?? 'Complex/Geriatric';
}

function domainForSpecialty(s: Specialty): PrimaryDomain {
  if (s === 'Behavioral Health') return 'BH';
  if (s === 'Social/SDOH') return 'Social';
  return 'Clinical';
}

// ─── Adjacent specialty graph (partial match credit) ──────────────────────────
const ADJACENT: Record<Specialty, Specialty[]> = {
  Diabetes: ['Cardiometabolic', 'Renal', 'Preventive'],
  Cardiometabolic: ['Diabetes', 'Renal', 'Preventive'],
  Respiratory: ['Complex/Geriatric', 'Preventive'],
  Renal: ['Cardiometabolic', 'Diabetes', 'Complex/Geriatric'],
  'Behavioral Health': [],
  'Maternal/Postpartum': ['Preventive'],
  'Complex/Geriatric': ['Respiratory', 'Renal', 'Cardiometabolic'],
  Preventive: ['Diabetes', 'Cardiometabolic'],
  'Social/SDOH': [],
};

// ─── Risk weights (acuity) ────────────────────────────────────────────────────
export const RISK_WEIGHT: Record<RiskTier, number> = {
  Critical: 4,
  High: 3,
  Moderate: 2,
  Low: 1,
};

// ─── Eligibility (hard rules) ─────────────────────────────────────────────────
function isEligible(member: CareTeamMember, p: AttributablePatient): boolean {
  if (member.status !== 'Active') return false;
  // Social/SDOH work routes to CHWs; clinical/BH routes to case managers.
  if (p.primaryDomain === 'Social') return member.function === 'CHW';
  if (p.primaryDomain === 'BH') {
    return member.function === 'CaseManager' && member.specialties.includes('Behavioral Health');
  }
  // Clinical
  return member.function === 'CaseManager';
}

interface LiveLoad {
  // memberId -> acuity-weighted load accumulated during a cohort run
  [memberId: string]: number;
}

function specialtyScore(member: CareTeamMember, need: Specialty): { pts: number; label: string } {
  if (member.specialties.includes(need)) return { pts: 40, label: `${need} specialist (exact)` };
  if (member.specialties.some((s) => ADJACENT[need]?.includes(s)))
    return { pts: 20, label: `${need}-adjacent skills` };
  return { pts: 0, label: '' };
}

/**
 * Attribute a single patient to the best-fit member.
 * `liveLoad` lets a cohort run balance acuity as it assigns (mutated by caller).
 */
export function attributePatient(
  p: AttributablePatient,
  members: CareTeamMember[] = CARE_TEAM_MEMBERS,
  liveLoad: LiveLoad = {}
): AttributionResult {
  const pool = members.filter((m) => m.function === 'CaseManager' || m.function === 'CHW');
  let eligible = pool.filter((m) => isEligible(m, p));
  let overCapacityException = false;

  // Capacity filter (soft): drop members at/over cap unless that empties the pool.
  const withCapacity = eligible.filter((m) => {
    const used = m.baseCaseload + (liveLoad[m.id] ?? 0) / RISK_WEIGHT.Moderate;
    return used < m.maxCaseload;
  });
  if (withCapacity.length > 0) {
    eligible = withCapacity;
  } else if (eligible.length > 0) {
    overCapacityException = true; // all eligible are full — assign anyway, flag it
  }

  if (eligible.length === 0) {
    // Last-resort: any active owner (keeps demo from dead-ending)
    eligible = pool.filter((m) => m.status === 'Active');
    overCapacityException = true;
  }

  const scored = eligible.map((m) => {
    const factors: string[] = [];
    let score = 0;

    const spec = specialtyScore(m, p.specialtyNeed);
    score += spec.pts;
    if (spec.label) factors.push(spec.label);

    // Acuity-balanced capacity: reward the lower normalized load.
    const normLoad =
      (m.baseCaseload * RISK_WEIGHT.Moderate + (liveLoad[m.id] ?? 0)) /
      (m.maxCaseload * RISK_WEIGHT.Moderate);
    const capacityPts = Math.round((1 - Math.min(normLoad, 1)) * 20);
    score += capacityPts;
    factors.push(`${Math.round(normLoad * 100)}% capacity`);

    // Continuity
    if (p.existingMemberId && p.existingMemberId === m.id) {
      score += 25;
      factors.push('continuity with existing care manager');
    } else if (p.pcpOrganization && m.organization && p.pcpOrganization === m.organization) {
      score += 10;
      factors.push('shared organization');
    }

    // Language / region / cultural
    if (p.language && m.languages.includes(p.language)) {
      score += 15;
      factors.push('language match');
    }
    if (p.region && m.regions.includes(p.region)) {
      score += 10;
      factors.push('regional coverage');
    }
    if (p.tribal && m.culturalCompetencies.includes('Tribal/IHS')) {
      score += 10;
      factors.push('tribal/IHS competency');
    }

    return { member: m, score, factors };
  });

  // Highest score wins; tie-break by lowest live load, then stable id order.
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const la = liveLoad[a.member.id] ?? 0;
    const lb = liveLoad[b.member.id] ?? 0;
    if (la !== lb) return la - lb;
    return a.member.id.localeCompare(b.member.id);
  });

  const winner = scored[0];
  // Commit acuity to live load so the next patient sees the updated balance.
  liveLoad[winner.member.id] = (liveLoad[winner.member.id] ?? 0) + RISK_WEIGHT[p.riskTier];

  const top = winner.score;
  const confidence: AttributionResult['confidence'] =
    top >= 70 ? 'High' : top >= 45 ? 'Medium' : 'Low';

  return {
    patientId: p.platformId,
    memberId: winner.member.id,
    score: top,
    confidence,
    rationale: `${winner.member.name} — ${winner.factors.join(', ')}.`,
    alternates: scored.slice(1, 3).map((s) => ({ memberId: s.member.id, score: s.score })),
    overCapacityException,
  };
}

// ─── Deterministic synthetic patient generation ───────────────────────────────
// Seeded by measure key so a cohort regenerates identically every time.

function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_NAMES = [
  'James',
  'Mary',
  'Robert',
  'Linda',
  'Michael',
  'Patricia',
  'David',
  'Barbara',
  'Joseph',
  'Susan',
  'Charles',
  'Margaret',
  'Thomas',
  'Dorothy',
  'Daniel',
  'Helen',
  'Walter',
  'Grace',
  'Frank',
  'Ruth',
  'Raymond',
  'Wilma',
  'Leonard',
  'Pearl',
  'Eugene',
  'Agnes',
];
const LAST_NAMES = [
  'Whitehorse',
  'Brave Bird',
  'Looking Cloud',
  'Two Bulls',
  'Red Cloud',
  'Iron Shell',
  'Spotted Eagle',
  'Walking Bull',
  'High Hawk',
  'Bordeaux',
  'Janis',
  'Provost',
  'Eagleman',
  'Black Elk',
  'Yellow Hawk',
  'Brings Plenty',
  'Swift Bird',
  'Means',
  'Comes Flying',
  'Bear Runner',
  'Anderson',
  'Nelson',
  'Larson',
  'Hanson',
  'Olson',
];
const REGIONS = ['Bennett County', 'Pine Ridge', 'Rural SD', 'Rapid City', 'Winner', 'Martin'];

const RISK_DISTRIBUTION: { tier: RiskTier; cum: number }[] = [
  { tier: 'Critical', cum: 0.12 },
  { tier: 'High', cum: 0.4 },
  { tier: 'Moderate', cum: 0.78 },
  { tier: 'Low', cum: 1.0 },
];

export function generateCohortStubs(
  measureKey: string,
  count: number,
  contract: string,
  specialty: Specialty
): AttributablePatient[] {
  const rng = mulberry32(hashSeed(measureKey));
  const domain = domainForSpecialty(specialty);
  const out: AttributablePatient[] = [];
  for (let i = 0; i < count; i++) {
    const r = rng();
    const tier = RISK_DISTRIBUTION.find((d) => r <= d.cum)!.tier;
    const fn = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)];
    const ln = LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)];
    const region = REGIONS[Math.floor(rng() * REGIONS.length)];
    const tribal = rng() < 0.45;
    out.push({
      platformId: `SYN-${measureKey}-${String(i + 1).padStart(4, '0')}`,
      name: `${fn} ${ln}`,
      riskTier: tier,
      rafScore: Math.round((1 + rng() * 2.5) * 100) / 100,
      primaryDomain: domain,
      specialtyNeed: specialty,
      language: tribal && rng() < 0.3 ? 'Lakota' : 'English',
      region,
      tribal,
      contract,
      synthetic: true,
    });
  }
  return out;
}
