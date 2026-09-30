// Canonical synthetic-entity registry — the SINGLE SOURCE for every de-attributed
// organisation in the demo corpus (AI-CODING-CONVENTIONS §1.1 single source, §2 data
// lives in *.json). Wave 1 de-attributed three screens by hand and the same names
// survived in 30+ other files; this module exists so display names, short/graph forms
// and contact details have exactly one owner.
//
// INVARIANT: a real place name may appear as a LOCATION (county, city, ZIP, lat/lng,
// map label) but never inside an ORGANISATION name; tribal and people names may not
// appear in an organisation name at all. County values in particular are load-bearing
// keys for the networkAdequacy engine and are never substituted.
import seed from './data/synthetic-entities.seed.json';

export type EntityCategory =
  'clinic' | 'hospital' | 'fqhc' | 'specialist' | 'behavioral' | 'cbo' | 'agency' | 'program';

export interface SyntheticEntityAddress {
  street: string;
  city: string;
  county: string;
  zip: string;
}

export interface SyntheticEntity {
  id: string;
  /** Full display name, e.g. 'Prairie Health Services'. */
  name: string;
  /** Compact form for dense tables, e.g. 'Prairie Health Ctr'. */
  shortName: string;
  /** Graph-node label, kept short enough for an SVG node. */
  graphLabel: string;
  category: EntityCategory;
  domain: string;
  email: string;
  phone: string;
  address: SyntheticEntityAddress;
  /** Provenance only — the real names this entity replaced. Never rendered. */
  oldNames: string[];
}

interface ContactSubstitutions {
  phones: Record<string, string>;
  domains: Record<string, string>;
  streets: Record<string, string>;
}

interface RegistrySeed {
  entities: SyntheticEntity[];
  variantSubstitutions: Record<string, string>;
  contactSubstitutions: ContactSubstitutions;
}

const registry = seed as unknown as RegistrySeed;

export const SYNTHETIC_ENTITIES: readonly SyntheticEntity[] = registry.entities;

const BY_ID = new Map(registry.entities.map((e) => [e.id, e]));

/** Look up an entity by its stable registry id. */
export function syntheticEntity(id: string): SyntheticEntity | undefined {
  return BY_ID.get(id);
}

/**
 * Display name for a registry id. Throws on an unknown id so a typo surfaces at the
 * first render rather than silently printing an empty cell.
 */
export function entityName(id: string): string {
  const entity = BY_ID.get(id);
  if (!entity) throw new Error(`Unknown synthetic entity id: ${id}`);
  return entity.name;
}

/** Short/table form for a registry id. */
export function entityShortName(id: string): string {
  const entity = BY_ID.get(id);
  if (!entity) throw new Error(`Unknown synthetic entity id: ${id}`);
  return entity.shortName;
}

/** Graph-node label for a registry id. */
export function entityGraphLabel(id: string): string {
  const entity = BY_ID.get(id);
  if (!entity) throw new Error(`Unknown synthetic entity id: ${id}`);
  return entity.graphLabel;
}

/**
 * Every old→new string pair the de-attribution sweep applies, longest-old-first so
 * 'Avera Sacred Heart CAH — BH' is matched before 'Avera Sacred Heart'. Consumed by
 * tools/deattribution/sweep.mjs and by the coherence test.
 */
export function substitutionPairs(): Array<readonly [string, string]> {
  const pairs: Array<readonly [string, string]> = [];
  for (const entity of registry.entities) {
    for (const old of entity.oldNames) pairs.push([old, entity.name] as const);
  }
  for (const [old, next] of Object.entries(registry.variantSubstitutions)) {
    pairs.push([old, next] as const);
  }
  const { phones, domains, streets } = registry.contactSubstitutions;
  for (const group of [streets, phones, domains]) {
    for (const [old, next] of Object.entries(group)) pairs.push([old, next] as const);
  }
  return pairs.sort((a, b) => b[0].length - a[0].length);
}

/** Every real string this registry retired — the input to the zero-residue grep. */
export function retiredStrings(): string[] {
  return substitutionPairs().map(([old]) => old);
}
