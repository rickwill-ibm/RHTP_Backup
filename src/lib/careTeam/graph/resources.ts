// careTeam/graph/resources.ts — Citizen-context resource matching.
// Derives the active citizen's unmet needs (graph for Maria; patientRegistry
// social fields for everyone else) and matches/ranks CBO resources as NBAs,
// flagging keystone resources (those that address a barrier BLOCKing a care gap).

// SEAM: graph — registered in the data-mode registry (lib/config/dataMode.ts,
// seam id 'graph', env DATA_MODE_GRAPH). The authored whole-person graph below
// is the mock source; when a production graph backend exists, switch on
// getDataMode('graph') here instead of importing the authored data directly.
import { graphNodes } from '@/lib/wholePersonGraphData';
import { getPatientById, type RegistryPatient } from '@/lib/patientRegistry';
import { keystones } from './keystones';
import { DEMO_MEMBER_ID } from '@/lib/config/demoDefaults';

export type ResourceCategory =
  | 'Financial'
  | 'Housing'
  | 'Behavioral Health'
  | 'Transportation'
  | 'Social Isolation'
  | 'Food'
  | 'Employment';

export type Severity = 'HIGH' | 'MODERATE' | 'LOW';

export interface CitizenNeed {
  category: ResourceCategory;
  severity: Severity;
  label: string;
  keystone?: boolean;
  blockedGaps?: string[];
  cypher: string;
}

// The graph-backed dataset belongs to the configured demo member.
// Graph SDOH node labels → resource category
const SDOH_LABEL_CATEGORY: Record<string, ResourceCategory> = {
  Transportation: 'Transportation',
  'Childcare Barrier': 'Financial',
  'Food Insecurity': 'Food',
  'Economic Fragility': 'Financial',
  'Caregiver Burden': 'Social Isolation',
  'Isolation Risk': 'Social Isolation',
  'Postpartum Depression Risk': 'Behavioral Health',
};

function normSeverity(s: unknown): Severity {
  return s === 'HIGH' ? 'HIGH' : s === 'LOW' ? 'LOW' : 'MODERATE';
}

function graphNeeds(): CitizenNeed[] {
  const ksMap: Record<string, string[]> = {};
  keystones().forEach((k) => (ksMap[k.barrierId] = k.blockedGaps));
  return graphNodes
    .filter((n) => n.type === 'SDOHNode')
    .flatMap((n) => {
      const category = SDOH_LABEL_CATEGORY[n.label];
      if (!category) return [];
      return [
        {
          category,
          severity: normSeverity((n.properties as Record<string, unknown>)?.severity),
          label: n.label,
          keystone: !!ksMap[n.id],
          blockedGaps: ksMap[n.id],
          cypher: `MATCH (c:Member {id:'${DEMO_MEMBER_ID}'})-[:HAS_SDOH]->(n:SDOHNode {label:'${n.label}'}) RETURN n`,
        } as CitizenNeed,
      ];
    });
}

// Fallback: derive needs from registry social fields for any other citizen.
function registryNeeds(p: RegistryPatient): CitizenNeed[] {
  const out: CitizenNeed[] = [];
  const cy = (t: string) => `MATCH (c:Member {id:'${p.platformId}'})-[:HAS_SDOH]->(n:SDOHNode {type:'${t}'}) RETURN n`;
  if (/barrier|mile|high/i.test(p.transportStatus)) out.push({ category: 'Transportation', severity: 'HIGH', label: 'Transportation barrier', cypher: cy('Transportation') });
  if (/insecur/i.test(p.foodSecurity)) out.push({ category: 'Food', severity: 'MODERATE', label: 'Food insecurity', cypher: cy('Food') });
  if (/waitlist|instab|unstable|assistance/i.test(p.housingStatus)) out.push({ category: 'Housing', severity: 'MODERATE', label: 'Housing instability', cypher: cy('Housing') });
  if (/expired|not enrolled|lapsed|waitlist/i.test(p.snapStatus)) out.push({ category: 'Financial', severity: 'MODERATE', label: 'Benefit gap (SNAP/WIC)', cypher: cy('Financial') });
  if (p.bhRisk === 'Moderate' || p.bhRisk === 'High' || p.bhRisk === 'Crisis')
    out.push({ category: 'Behavioral Health', severity: p.bhRisk === 'Crisis' ? 'HIGH' : 'MODERATE', label: `BH need (${p.bhScreeningLabel})`, cypher: cy('BehavioralHealth') });
  return out;
}

export function citizenNeeds(citizenId: string): CitizenNeed[] {
  if (citizenId === DEMO_MEMBER_ID) return graphNeeds();
  const p = getPatientById(citizenId);
  return p ? registryNeeds(p) : [];
}

const CAPACITY_RANK: Record<string, number> = { Accepting: 0, Waitlist: 1, Full: 2 };
const SEV_RANK: Record<Severity, number> = { HIGH: 0, MODERATE: 1, LOW: 2 };

export interface RecommendedResource<T> {
  cbo: T;
  need: CitizenNeed;
  why: string;
}

/** Match + rank CBOs against the citizen's needs. Keystone-first, then severity, capacity, speed. */
export function recommendResources<T extends { domain: string; capacity: string; avgDaysToClose: number }>(
  citizenId: string,
  cbos: T[]
): RecommendedResource<T>[] {
  const needs = citizenNeeds(citizenId);
  const recs: RecommendedResource<T>[] = [];
  for (const need of needs) {
    for (const cbo of cbos.filter((c) => c.domain === need.category)) {
      recs.push({
        cbo,
        need,
        why:
          need.keystone && need.blockedGaps?.length
            ? `Addresses ${need.label} — unblocks ${need.blockedGaps.join(', ')}`
            : `Addresses ${need.label}`,
      });
    }
  }
  return recs.sort((a, b) => {
    const k = (a.need.keystone ? 0 : 1) - (b.need.keystone ? 0 : 1);
    if (k) return k;
    const s = SEV_RANK[a.need.severity] - SEV_RANK[b.need.severity];
    if (s) return s;
    const c = (CAPACITY_RANK[a.cbo.capacity] ?? 9) - (CAPACITY_RANK[b.cbo.capacity] ?? 9);
    if (c) return c;
    return a.cbo.avgDaysToClose - b.cbo.avgDaysToClose;
  });
}

// ─── Ranked Next Best Actions for a citizen (agentic surface) ─────────────────
const NBA_VERB: Record<ResourceCategory, string> = {
  Transportation: 'Arrange NEMT transportation',
  Food: 'Submit food assistance referral',
  Housing: 'Initiate housing navigator referral',
  Financial: 'Submit benefit enrollment (SNAP/WIC/LIHEAP)',
  'Behavioral Health': 'Coordinate BH engagement',
  'Social Isolation': 'Connect to community services',
  Employment: 'Refer to employment services',
};
const NBA_AGENT: Record<ResourceCategory, string> = {
  Transportation: 'SDOH Navigator',
  Food: 'SDOH Navigator',
  Housing: 'SDOH Navigator',
  'Social Isolation': 'SDOH Navigator',
  Financial: 'Eligibility Intelligence',
  'Behavioral Health': 'BH Follow-up Sentinel',
  Employment: 'Workforce Navigator',
};

export interface CitizenNBA<T> {
  id: string;
  action: string;
  whyNow: string;
  impact: string;
  agent: string;
  confidence: 'High' | 'Medium' | 'Low';
  keystone: boolean;
  cbo: T;
  need: CitizenNeed;
}

export function citizenNBAs<T extends { domain: string; capacity: string; avgDaysToClose: number; name: string }>(
  citizenId: string,
  cbos: T[]
): CitizenNBA<T>[] {
  return recommendResources(citizenId, cbos).map((rec, i) => ({
    id: `nba-${i}`,
    action: NBA_VERB[rec.need.category] ?? `Address ${rec.need.label}`,
    whyNow: `${rec.need.label} · ${rec.need.severity}`,
    impact:
      rec.need.keystone && rec.need.blockedGaps?.length
        ? `Unblocks ${rec.need.blockedGaps.join(', ')}`
        : `Addresses ${rec.need.label}`,
    agent: NBA_AGENT[rec.need.category] ?? 'SDOH Navigator',
    confidence: rec.need.keystone ? 'High' : rec.need.severity === 'HIGH' ? 'High' : 'Medium',
    keystone: !!rec.need.keystone,
    cbo: rec.cbo,
    need: rec.need,
  }));
}

// NBA for a single category (used by live screening — works even if the need
// isn't yet in the registry; keystone flagged if it blocks a clinical gap).
export function nbaForCategory<T extends { domain: string; capacity: string; avgDaysToClose: number; name: string }>(
  citizenId: string,
  category: ResourceCategory,
  cbos: T[]
): CitizenNBA<T> | undefined {
  const matches = cbos.filter((c) => c.domain === category);
  if (matches.length === 0) return undefined;
  const cap: Record<string, number> = { Accepting: 0, Waitlist: 1, Full: 2 };
  const cbo = matches.sort((a, b) => (cap[a.capacity] ?? 9) - (cap[b.capacity] ?? 9) || a.avgDaysToClose - b.avgDaysToClose)[0];
  const need = citizenNeeds(citizenId).find((n) => n.category === category);
  const keystone = !!need?.keystone;
  return {
    id: `nba-${category}`,
    action: NBA_VERB[category] ?? `Address ${category} need`,
    whyNow: `${category} screened positive`,
    impact: keystone && need?.blockedGaps?.length ? `Unblocks ${need.blockedGaps.join(', ')}` : `Addresses ${category} need`,
    agent: NBA_AGENT[category] ?? 'SDOH Navigator',
    confidence: keystone ? 'High' : 'Medium',
    keystone,
    cbo,
    need: need ?? { category, severity: 'MODERATE', label: category, cypher: `MATCH (c:Member {id:'${citizenId}'})-[:HAS_SDOH]->(n:SDOHNode {type:'${category}'}) RETURN n` },
  };
}
