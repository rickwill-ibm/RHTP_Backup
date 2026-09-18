// CONTRACT: C10  // SEAM: graph  // DP-1
/**
 * Mapping-spec framework (DP-1). A MappingSpec is the per-domain rule that turns
 * ONE C2 event into neutral graph mutations. Specs never touch a store; they emit
 * the instruction set from types.ts and nothing else. Shared helpers here encode
 * the DP-1 invariants every spec obeys, so a new domain spec cannot forget them:
 *
 *   - the Member node is always upserted (every subgraph hangs off the member);
 *   - restriction is read from the ENVELOPE (consentContext), never the payload,
 *     so Part 2 / segmented data projects as a RESTRICTED node by envelope
 *     inspection alone (C10.1) — the segmentation label the pipeline stamped is
 *     carried onto the node as labels;
 *   - every edge is dated (validity interval) for asOf queries.
 */
import type { C2Event } from '@/lib/outbox';
import type { EdgeSemantics, Mutation, Props, ProjectorDeps, UpsertNode } from '../types';

export interface MappingSpec {
  /** Domain name (for diagnostics + the registry index). */
  readonly domain: string;
  /** True when this spec owns the event (matched on eventType). */
  matches(eventType: string): boolean;
  /** Pure: one event -> ordered mutations. Deterministic under deps.now. */
  toMutations(event: C2Event, deps: ProjectorDeps): Mutation[];
}

export const MEMBER_KIND = 'Member';

/** The Member node for an event's member. Idempotent; every spec emits it. */
export function memberNode(event: C2Event): UpsertNode {
  return {
    op: 'UpsertNode',
    kind: MEMBER_KIND,
    key: event.memberId,
    properties: { id: event.memberId },
  };
}

/** Segmentation labels the pipeline stamped on the envelope (sorted, de-duped). */
export function segmentLabels(event: C2Event): string[] {
  const labels = new Set(event.consentContext.segmentLabels ?? []);
  if (event.consentContext.part2Restricted) labels.add('42-CFR-Part-2');
  return [...labels].sort();
}

/** Is this event's resource restricted? Envelope-only (never parses payload). */
export function isRestricted(event: C2Event): boolean {
  return event.consentContext.part2Restricted || segmentLabels(event).length > 0;
}

/**
 * Build a resource node honoring restriction: sets `restricted` and appends every
 * segmentation label as a SetLabel so consent-aware lenses (wave B) can filter on
 * the node alone. Returns the UpsertNode plus any SetLabel mutations.
 */
export function resourceNode(
  event: C2Event,
  kind: string,
  key: string,
  properties: Props
): Mutation[] {
  const restricted = isRestricted(event);
  const node: UpsertNode = { op: 'UpsertNode', kind, key, properties, restricted };
  const out: Mutation[] = [node];
  if (restricted) out.push({ op: 'SetLabel', kind, key, label: 'Restricted' });
  for (const label of segmentLabels(event)) out.push({ op: 'SetLabel', kind, key, label });
  return out;
}

/** Provenance for a causal edge, from the event's source + a PHI-safe basis. */
export function causal(asserter: string, basis: string): EdgeSemantics {
  return { kind: 'causal', asserter, basis };
}

export const associative: EdgeSemantics = { kind: 'associative' };
