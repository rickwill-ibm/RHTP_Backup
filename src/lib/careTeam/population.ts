// careTeam/population.ts — One deterministic shared synthetic patient panel.
//
// Why: cohorts must draw from the SAME pool of people so that a patient with
// multiple measure gaps (e.g. A1C + BP) appears in several cohorts but is
// counted ONCE on the dashboard. Per-measure minting created disjoint people and
// made the unique total balloon (47 + 83 = 130). Sampling a shared pool bounds
// the unique caseload to the panel size while each cohort still has EXACTLY its
// open-gap count of members.

import type { AttributablePatient, PrimaryDomain, RiskTier, Specialty } from './attribution';

const POOL_SIZE = 320;

// ─── Deterministic RNG ────────────────────────────────────────────────────────
function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
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
  'Harold',
  'Esther',
  'Carl',
  'Lois',
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
  'Brewer',
  'Hawk Wing',
  'Little Thunder',
];
const REGIONS = ['Bennett County', 'Pine Ridge', 'Rural SD', 'Rapid City', 'Winner', 'Martin'];

const RISK_BANDS: { tier: RiskTier; cum: number }[] = [
  { tier: 'Critical', cum: 0.12 },
  { tier: 'High', cum: 0.4 },
  { tier: 'Moderate', cum: 0.78 },
  { tier: 'Low', cum: 1.0 },
];

export interface PanelPerson {
  index: number;
  platformId: string; // SYN-P-####  (stable across every cohort that samples them)
  name: string;
  riskTier: RiskTier;
  rafScore: number;
  region: string;
  language: string;
  tribal: boolean;
}

// Stable attributes per pool index — same person wherever they appear.
function buildPerson(index: number): PanelPerson {
  const rng = mulberry32(hashSeed(`person-${index}`));
  const r = rng();
  const tier = RISK_BANDS.find((b) => r <= b.cum)!.tier;
  const fn = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)];
  const ln = LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)];
  const region = REGIONS[Math.floor(rng() * REGIONS.length)];
  const tribal = rng() < 0.45;
  return {
    index,
    platformId: `SYN-P-${String(index).padStart(4, '0')}`,
    name: `${fn} ${ln}`,
    riskTier: tier,
    rafScore: Math.round((1 + rng() * 2.5) * 100) / 100,
    region,
    language: tribal && rng() < 0.3 ? 'Lakota' : 'English',
    tribal,
  };
}

const PANEL: PanelPerson[] = Array.from({ length: POOL_SIZE }, (_, i) => buildPerson(i));
const PANEL_BY_ID: Record<string, PanelPerson> = Object.fromEntries(
  PANEL.map((p) => [p.platformId, p])
);

export function getPanelPerson(platformId: string): PanelPerson | undefined {
  return PANEL_BY_ID[platformId];
}

/**
 * Deterministically sample `count` DISTINCT pool members for a measure.
 * Different measures use different seeds, so their samples overlap by chance —
 * that overlap is what keeps the unique caseload bounded (a person with two
 * measure gaps is the same SYN-P-#### in both cohorts).
 */
export function samplePanel(measureKey: string, count: number): PanelPerson[] {
  const n = Math.min(count, POOL_SIZE);
  const idx = Array.from({ length: POOL_SIZE }, (_, i) => i);
  // Seeded Fisher–Yates shuffle, then take the first n.
  const rng = mulberry32(hashSeed(`cohort-${measureKey}`));
  for (let i = POOL_SIZE - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, n).map((i) => PANEL[i]);
}

/** Adapt a pool person to an AttributablePatient for a specific measure/domain. */
export function panelPersonToAttributable(
  person: PanelPerson,
  domain: PrimaryDomain,
  specialty: Specialty,
  contract: string
): AttributablePatient {
  return {
    platformId: person.platformId,
    name: person.name,
    riskTier: person.riskTier,
    rafScore: person.rafScore,
    primaryDomain: domain,
    specialtyNeed: specialty,
    language: person.language,
    region: person.region,
    tribal: person.tribal,
    contract,
    synthetic: true,
  };
}

export const PANEL_POOL_SIZE = POOL_SIZE;
