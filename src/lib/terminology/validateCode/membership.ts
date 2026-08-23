/**
 * Versioned value-set membership (I8A-ii wave A) - the data layer that makes
 * validateCode and $expand REAL instead of a flat allowlist.
 *
 * The CURRENT-version members of a governed system are the keys of
 * codeSystems[system].codes in terminology-seed.json (single source of truth).
 * The `membership` block adds only the version DELTAS: which codes are retired
 * as of the current bound version, and how a prior version's membership differs.
 * So a code can be a member of an OLD version yet retired/removed in the CURRENT
 * one, and $expand can enumerate the membership of a specific version.
 *
 * PHI-free: codes + versions only, no clinical narrative.
 */
import seed from '../data/terminology-seed.json';

interface VersionDelta {
  adds?: string[];
  removes?: string[];
}

interface SystemMembership {
  currentVersion: string;
  retiredInCurrent?: string[];
  priorVersions?: Record<string, VersionDelta>;
}

interface SeedShape {
  codeSystems: Record<string, { uri: string; codes: Record<string, string> }>;
  membership?: { systems?: Record<string, SystemMembership> };
}

const DATA = seed as unknown as SeedShape;

/** True when the system is one we govern (a key of the seeded code systems). */
export function isGovernedSystem(system: string): boolean {
  return system in DATA.codeSystems;
}

/** The display for a code in a system, when seeded (demo/reference only). */
export function systemDisplay(system: string, code: string): string | undefined {
  return DATA.codeSystems[system]?.codes[code];
}

/** The members of the CURRENT bound version: the seeded allowlist keys. */
export function currentMembers(system: string): string[] {
  const cs = DATA.codeSystems[system];
  return cs ? Object.keys(cs.codes) : [];
}

function membershipFor(system: string): SystemMembership | undefined {
  return DATA.membership?.systems?.[system];
}

/** The version string the seed declares as current for a system, if declared. */
export function declaredCurrentVersion(system: string): string | undefined {
  return membershipFor(system)?.currentVersion;
}

/** Codes retired/removed as of the current bound version (invalid for admission now). */
export function retiredInCurrent(system: string): string[] {
  return membershipFor(system)?.retiredInCurrent ?? [];
}

/** True when `code` is retired as of the current bound version of `system`. */
export function isRetiredInCurrent(system: string, code: string): boolean {
  return retiredInCurrent(system).includes(code);
}

/**
 * The membership of a SPECIFIC version of `system`, or undefined when that
 * version is not modeled. The current version resolves to the seeded allowlist;
 * a modeled prior version is the current set with its recorded adds/removes
 * applied. Systems with no membership deltas expose their single seeded snapshot.
 */
export function membersForVersion(system: string, version: string): string[] | undefined {
  if (!isGovernedSystem(system)) return undefined;
  const current = currentMembers(system);
  const decl = membershipFor(system);
  if (!decl) return [...current];
  if (version === decl.currentVersion) return [...current];
  const prior = decl.priorVersions?.[version];
  if (!prior) return undefined;
  const set = new Set(current);
  for (const c of prior.removes ?? []) set.delete(c);
  for (const c of prior.adds ?? []) set.add(c);
  return [...set];
}
