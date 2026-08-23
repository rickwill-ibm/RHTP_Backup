/**
 * $expand (I8A-ii wave A) - enumerate the membership of a value-set VERSION.
 *
 * Mirrors FHIR ValueSet/$expand: given a governed system (and optionally a
 * version), return the bounded, PHI-free set of member codes so a membership
 * check is REAL enumeration, not an opaque flat allowlist. The version defaults
 * to the registry's currently bound version (deterministic via asOf / injected
 * clock). An unknown version returns undefined; an ungoverned system too.
 */
import { valueSetRegistry, type ValueSetRegistry } from '../registry/valueSetRegistry';
import { SYSTEM_URIS, type TerminologySystem } from '../types';
import { declaredCurrentVersion, isGovernedSystem, membersForVersion, systemDisplay } from '../validateCode/membership';

/** One member of an expansion. */
export interface ExpansionEntry {
  code: string;
  display?: string;
}

/** The result of $expand - the enumerated membership of one value-set version. */
export interface ValueSetExpansion {
  /** The canonical system URI expanded. */
  system: string;
  /** The version whose membership was enumerated. */
  version: string;
  /** Total members in the version (before the bound cap). */
  total: number;
  contains: ExpansionEntry[];
  /** true when `contains` was truncated by the enumeration cap. */
  truncated: boolean;
  stub: boolean;
}

export interface ExpandOptions {
  /** Enumerate this version; defaults to the registry's currently bound version. */
  version?: string;
  registry?: ValueSetRegistry;
  /** The check time; when omitted the registry's clock decides the current version. */
  asOf?: Date;
  /** Bound on enumerated members (PHI-free, memory-safe). Default 1000. */
  max?: number;
}

const DEFAULT_MAX = 1000;

/** Enumerate the membership of a governed value-set version. */
export function expandValueSet(
  system: TerminologySystem | string,
  opts: ExpandOptions = {},
): ValueSetExpansion | undefined {
  if (!isGovernedSystem(system)) return undefined;
  const registry = opts.registry ?? valueSetRegistry;
  const uri = SYSTEM_URIS[system as TerminologySystem] ?? system;
  const active = registry.getActiveBySystem(uri, opts.asOf);
  const version = opts.version ?? active?.version ?? declaredCurrentVersion(system) ?? '(current)';
  const members = membersForVersion(system, version);
  if (!members) return undefined;
  const max = opts.max ?? DEFAULT_MAX;
  const bounded = members.slice(0, max);
  return {
    system: uri,
    version,
    total: members.length,
    contains: bounded.map((code) => ({ code, display: systemDisplay(system, code) })),
    truncated: members.length > bounded.length,
    stub: true,
  };
}
