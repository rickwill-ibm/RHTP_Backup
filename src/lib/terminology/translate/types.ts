/**
 * $translate cross-map types (Iteration 8A-ii, Wave B).
 *
 * A CrosswalkTranslation carries not just the target coding(s) but the PROVENANCE
 * of the mapping: WHICH seeded crosswalk asset (and which version) produced it.
 * This is deliberately richer than the seam's minimal TranslationResult so a
 * translated code can be audited back to its versioned crosswalk. An untranslatable
 * source code returns NO-MAP (empty targets) and NEVER a fabricated target.
 */
import type { TerminologySystem } from '../types';

/** Which seeded crosswalk (and version) produced a translation. PHI-free metadata. */
export interface CrosswalkProvenance {
  /** The crosswalk asset id, e.g. `icd10cm-to-cms-hcc-v28`. */
  crosswalkId: string;
  /** Human name, e.g. `ICD-10-CM to CMS-HCC (V28)`. */
  name: string;
  /** The versioned asset this crosswalk binds to, e.g. `cms-hcc-v28`. */
  assetId: string;
  /** Version string of the bound asset (ILLUSTRATIVE STUB), e.g. `V28`. */
  version: string;
  sourceSystem: TerminologySystem;
  targetSystem: TerminologySystem;
}

/** One target coding a source code maps to. */
export interface CrosswalkTarget {
  system: TerminologySystem;
  code: string;
  display?: string;
}

/**
 * Result of a $translate cross-map. `targets` is empty on NO-MAP. `crosswalk` names
 * the consulted crosswalk when one exists for the (source, target) systems, even on
 * a no-map (so the caller sees which versioned map was consulted); it is null only
 * when no crosswalk is seeded for that system pair at all.
 */
export interface CrosswalkTranslation {
  sourceSystem: TerminologySystem;
  sourceCode: string;
  targetSystem: TerminologySystem;
  /** Target coding(s); EMPTY on no-map (never a fabricated target). */
  targets: CrosswalkTarget[];
  matched: boolean;
  /** true when no target was found (empty targets), whether or not a crosswalk existed. */
  noMap: boolean;
  /** The crosswalk consulted, or null when no crosswalk covers this system pair. */
  crosswalk: CrosswalkProvenance | null;
  /** true for the seeded answer, so no caller mistakes it for a live terminology server. */
  stub: boolean;
}

/** The $translate cross-map service surface. */
export interface CrosswalkTranslator {
  readonly id: string;
  /** Cross-map a source coding to the target system over the seeded crosswalks. */
  translate(
    sourceSystem: TerminologySystem,
    sourceCode: string,
    targetSystem: TerminologySystem
  ): CrosswalkTranslation;
  /** The provenance of every seeded crosswalk (for an ops/registry view). */
  listCrosswalks(): CrosswalkProvenance[];
}
