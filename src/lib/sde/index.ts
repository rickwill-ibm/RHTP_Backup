// CONTRACT: C2  // CONTRACT: C6  // SEAM: sde-policy-store  // SEAM: signalDisposition  (dataMode)
/**
 * Signal Disposition Engine — public surface (DP-2). The disposition service:
 * signal taxonomy (data), the act/suppress/delay/bundle decision model
 * (deterministic, injected clock), disposition policy as data, a consent gate,
 * explainability, and PHI-safe audit.
 *
 * Seam (dataMode 'signalDisposition'): getSdeDemoDisposition() returns the demo's AUTHORED
 * disposition in mock mode (the hardcoded page stays green) and runs the REAL
 * engine over the seeded signal batch in production mode. The 5/3/1/one-touchpoint
 * acceptance shape is EMERGENT from policy in production mode, never hardcoded.
 */
import { getDataMode } from '@/lib/config/dataMode';
import { createMemoryAuditSink } from './audit';
import { consentGranted } from './consentGate';
import demoBatchJson from './data/demo-signal-batch.json';
import { disposeBatch } from './engine/dispositionEngine';
import { defaultPolicyPack, getPolicyPack } from './policy/policyStore';
import { defaultTaxonomy } from './taxonomy';
import type {
  DispositionBatch,
  DispositionSummary,
  EngineDeps,
  MemberContext,
  PolicyPack,
  Signal,
} from './types';

// ── Types ────────────────────────────────────────────────────────────────────
export type {
  Signal,
  SignalTaxonomy,
  TaxonomyEntry,
  Priority,
  Actionability,
  Channel,
  FoldBehavior,
  Disposition,
  ActDisposition,
  BundleDisposition,
  SuppressDisposition,
  DelayDisposition,
  SuppressReason,
  DispositionAction,
  DispositionBatch,
  DispositionSummary,
  Touchpoint,
  DelayBundle,
  MemberContext,
  PolicyPack,
  FrequencyCap,
  SdeAuditEntry,
  SdeAuditSink,
  EngineDeps,
} from './types';
export { isApproved } from './types';

// ── Engine + building blocks ──────────────────────────────────────────────────
export { disposeBatch } from './engine/dispositionEngine';
export { explainDisposition, explainBatch, type DispositionExplanation } from './engine/explain';
export { composeTouchpoints, bundleDelays } from './touchpoint/composer';
export { createMemoryAuditSink } from './audit';
export { consentGranted } from './consentGate';

// ── Taxonomy + intake ─────────────────────────────────────────────────────────
export { defaultTaxonomy, loadTaxonomy, indexTaxonomy, fillDedupeKey } from './taxonomy';
export {
  intakeSignals,
  intakeSignalsDurable,
  signalFromEvent,
  sortByOrder,
  type IntakeOptions,
  type DurableIntakeDeps,
} from './intake/signalIntake';

// ── Policy store (SEAM: sde-policy-store) ──────────────────────────────────────
export {
  getPolicyPack,
  defaultPolicyPack,
  loadPolicyPack,
  setProductionPolicyPackLoader,
  SdePolicyStoreNotConfiguredError,
} from './policy/policyStore';

// ── Schema (validators) ────────────────────────────────────────────────────────
export { parseTaxonomy, parsePolicyPack, SdeConfigError } from './schema';

/** The seeded demo batch, parsed into engine-ready signals + context. */
export interface DemoBatch {
  memberId: string;
  correlationId: string;
  nowMs: number;
  memberContext: MemberContext;
  signals: Signal[];
  authoredSummary: DispositionSummary;
}

/** Load the seeded demo signal batch (occurredAtIso -> ms). */
export function loadDemoBatch(): DemoBatch {
  const raw = demoBatchJson as unknown as {
    memberId: string;
    correlationId: string;
    nowIso: string;
    memberContext: MemberContext;
    authoredSummary: DispositionSummary;
    signals: Array<Record<string, unknown>>;
  };
  const signals: Signal[] = raw.signals.map((s) => {
    const sig: Signal = {
      signalId: s.signalId as string,
      memberId: raw.memberId,
      kind: s.kind as string,
      sourceEventType: s.sourceEventType as string,
      occurredAtMs: Date.parse(s.occurredAtIso as string),
      priority: s.priority as Signal['priority'],
      actionability: s.actionability as Signal['actionability'],
      foldBehavior: s.foldBehavior as Signal['foldBehavior'],
      dedupeKey: dedupeKeyFor(s, raw.memberId),
      part2Restricted: s.part2Restricted === true,
    };
    if (s.channel) sig.channel = s.channel as Signal['channel'];
    if (s.consentScope) sig.consentScope = s.consentScope as string;
    if (s.measure) sig.measure = s.measure as string;
    if (s.sequence !== undefined) sig.sequence = s.sequence as number;
    if (s.refs) sig.refs = s.refs as Record<string, string>;
    return sig;
  });
  return {
    memberId: raw.memberId,
    correlationId: raw.correlationId,
    nowMs: Date.parse(raw.nowIso),
    memberContext: raw.memberContext,
    signals,
    authoredSummary: raw.authoredSummary,
  };
}

function dedupeKeyFor(s: Record<string, unknown>, memberId: string): string {
  const measure = (s.measure as string) ?? (s.refs as Record<string, string> | undefined)?.instrument ?? 'na';
  const channel = (s.channel as string) ?? 'na';
  const kind = s.kind as string;
  if (kind.startsWith('care-gap')) return `care-gap:${memberId}:${measure}`;
  if (kind === 'bh.screening.indicated') return `bh-screening:${memberId}:${measure}`;
  if (kind === 'behavioral.window') return `behavioral:${memberId}:${channel}`;
  return `${kind}:${memberId}:${s.signalId}`;
}

/**
 * Run the real engine over an arbitrary member signal batch. This is the
 * production entry point (deterministic; caller injects clock + deps).
 */
export function runMemberDispositions(
  signals: Signal[],
  ctx: MemberContext,
  opts: { nowMs: number; pack?: PolicyPack; deps?: Partial<EngineDeps> } ,
): DispositionBatch {
  const pack = opts.pack ?? getPolicyPack();
  const deps: EngineDeps = {
    now: () => opts.nowMs,
    audit: opts.deps?.audit ?? createMemoryAuditSink(),
    consentGranted: opts.deps?.consentGranted ?? consentGranted,
    actor: opts.deps?.actor ?? `sde-engine@${pack.version}`,
    correlationId: opts.deps?.correlationId,
  };
  return disposeBatch(signals, pack, ctx, deps);
}

/**
 * The dataMode 'signalDisposition' seam. mock/seeded: return the demo's AUTHORED disposition
 * summary (the hardcoded page stays green). production: run the real engine over
 * the seeded batch and return its emergent summary.
 */
export function getSdeDemoDisposition(): { summary: DispositionSummary; batch?: DispositionBatch; mode: string } {
  const mode = getDataMode('signalDisposition');
  const demo = loadDemoBatch();
  if (mode === 'production') {
    const batch = runRealDemo();
    return { summary: batch.summary, batch, mode };
  }
  return { summary: demo.authoredSummary, mode };
}

/**
 * Run the real engine over the seeded demo batch (used by production mode + tests).
 * The demo always runs against the DEFAULT pack — the policy-as-data reference —
 * independent of the 'signalDisposition' data mode, so the acceptance shape is reproducible
 * whether or not a production pack store is wired.
 */
export function runRealDemo(): DispositionBatch {
  const demo = loadDemoBatch();
  const pack = defaultPolicyPack();
  const audit = createMemoryAuditSink();
  const deps: EngineDeps = {
    now: () => demo.nowMs,
    audit,
    consentGranted,
    actor: `sde-engine@${pack.version}`,
    correlationId: demo.correlationId,
  };
  return disposeBatch(demo.signals, pack, demo.memberContext, deps);
}
