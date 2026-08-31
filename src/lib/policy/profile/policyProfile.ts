/**
 * Policy PROFILE seam — the sanctioned, optional per-payer / per-state extension point.
 *
 * The core pipeline (`processPolicyDocument` → `extractCriteriaPolicy` / `extractStructuredPolicy` →
 * encode → review → DTR/CRD) is strictly PAYER-AGNOSTIC: it keys off document STRUCTURE, never a
 * payer or state name. This seam is the ONLY place a payer/state may be recognized, and it does the
 * least dangerous thing possible — it PRE-NORMALIZES the raw text INTO the shape the general extractor
 * already understands (de-column a table, canonicalize a payer's heading vocabulary onto the generic
 * markers, repair a known OCR artifact). It never forks extraction, encoding, or generation.
 *
 * Design mirrors the two existing provider seams (`dtr/terminology/expansion.ts`,
 * `review/codingMap.ts`): a default that is a no-op, an interface, a registry, and a selector. With NO
 * profile registered, the `genericProfile` (identity) runs and the general path is byte-for-byte
 * unchanged — a payer name has no meaning in the engine UNLESS someone deliberately registers a profile.
 *
 * INVARIANT: `normalizeText` adapts INPUT only. It must not add, drop, or reinterpret clinical
 * meaning — a profile that changes what the policy SAYS is a bug, not a feature.
 */
import type { TextSource } from '../extract/types';

export interface PolicyProfile {
  /** Stable id, e.g. "generic" | "aetna-cpb" | "tx-medicaid". */
  id: string;
  /** True when this profile recognizes the document (by STRUCTURE/content — a payer/state template). */
  detect(src: TextSource): boolean;
  /** Pre-normalize raw text into the general extractor's shape. INPUT adaptation only — never changes
   *  clinical meaning. Identity is always a valid implementation. */
  normalizeText(src: TextSource): TextSource;
}

/** The floor: matches everything, changes nothing. The general payer-agnostic path. */
export const genericProfile: PolicyProfile = {
  id: 'generic',
  detect: () => true,
  normalizeText: (src) => src,
};

const REGISTRY: PolicyProfile[] = [];

/** Register a profile (idempotent by id). Payer/state profiles opt IN here — nothing is registered by
 *  default, so the engine ships payer-agnostic. */
export function registerProfile(p: PolicyProfile): void {
  if (!REGISTRY.some((x) => x.id === p.id)) REGISTRY.push(p);
}

/** The profiles registered so far (registration order), excluding the always-last generic fallback. */
export function registeredProfiles(): readonly PolicyProfile[] {
  return REGISTRY.slice();
}

/** The first registered profile that recognizes the document, or the generic (identity) fallback. */
export function selectProfile(src: TextSource): PolicyProfile {
  return REGISTRY.find((p) => p.detect(src)) ?? genericProfile;
}

/** Select a profile and pre-normalize the text. Returns the chosen profile (for provenance) and the
 *  normalized source that flows into the general extractor. Generic ⇒ the source is returned unchanged. */
export function applyProfile(src: TextSource): { profile: PolicyProfile; src: TextSource } {
  const profile = selectProfile(src);
  return { profile, src: profile.normalizeText(src) };
}

/** Test-only: clear registered profiles so a suite starts from the payer-agnostic floor. */
export function __resetProfilesForTest(): void {
  REGISTRY.length = 0;
}
