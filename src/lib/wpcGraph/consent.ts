// src/lib/wpcGraph/consent.ts
// Wave 0 — the ONE canonical consent / 42 CFR Part 2 / minimum-necessary gate for
// the whole-person graph. Every engine and screen discloses nodes through this
// single predicate, so the rule is auditable and applied identically everywhere
// (previously it was duplicated inline in lensUtils and the render layer).
//
// Rule — per SUBJECT, fail-closed:
//   • A non-sensitive node is always disclosable.
//   • A sensitive node (42 CFR Part 2 / consent-pending / gated) is disclosed ONLY
//     when it is the viewing member's OWN data under an explicit consent basis.
//   • A relative's sensitive data (a household member's BH/SUD, a minor's
//     confidential services) is NEVER surfaced through the member's view without
//     that relative's own consent — it stays hidden by default.

export interface SensitiveNode {
  id: string;
  /** 42 CFR Part 2 — SUD / behavioral-health program record. */
  locked?: boolean;
  /** Consent requested but not yet granted. */
  consentPending?: boolean;
  /** Explicit gate marker (any truthy value gates). */
  consentGate?: unknown;
  /** Subject proxy: which person the datum belongs to (member vs a relative). */
  cluster?: string;
}

export interface DiscloseContext {
  /** The viewing member's own subject cluster (e.g. the member's cluster id). */
  viewerCluster?: string;
  /** True when the viewer holds a consent basis for the member's OWN sensitive data. */
  memberConsent?: boolean;
}

/** A node carries consent-sensitive data (Part 2 / pending / gated). */
export function isSensitive(n: SensitiveNode): boolean {
  return Boolean(n.locked || n.consentPending || n.consentGate);
}

/**
 * Per-subject disclosure decision. Fail-closed: relatives' sensitive data and any
 * sensitive node lacking a member consent basis are hidden. Default context
 * (no consent supplied) reproduces the prior behaviour exactly — all sensitive
 * nodes hidden — so this is a safe centralisation, not a behaviour change.
 */
export function isNodeDisclosable(n: SensitiveNode, ctx: DiscloseContext = {}): boolean {
  if (!isSensitive(n)) return true;
  const ownData = ctx.viewerCluster !== undefined && n.cluster === ctx.viewerCluster;
  return Boolean(ownData && ctx.memberConsent);
}
