// CONTRACT: C2  // CONTRACT: C6  // CONTRACT: ADR-005
/**
 * The disposition decision model (DP-2). Pure fold: a member's pending signal
 * set, the active policy pack, member context, and an injected clock in;
 * per-signal decisions (act / bundle / suppress / delay), the composed
 * touchpoint, and PHI-safe audit out. Deterministic — same set, pack, clock,
 * same decisions, forever.
 *
 * Per-signal every decision names the policy rule that fired (explainable) and
 * emits an audit entry (auditable). Per-member ordering is honored: signals are
 * folded in outbox-sequence order, which the memberId partition guarantees (C6).
 */
import { sortByOrder } from '../intake/signalIntake';
import { bundleDelays, composeTouchpoints } from '../touchpoint/composer';
import type {
  Disposition,
  DispositionBatch,
  EngineDeps,
  MemberContext,
  PolicyPack,
  Signal,
  SdeAuditEntry,
} from '../types';
import { isApproved } from '../types';
import {
  capFor,
  coordinationWindowId,
  isExpired,
  isSuperseded,
  nextSmsWindowMs,
  outsideSmsWindow,
  priorContactCount,
  priorityScore,
  resolveChannel,
  smsWindowId,
} from './rules';

/** An approved candidate awaiting act-vs-bundle assignment (pass 2). */
interface Candidate {
  signal: Signal;
  channel: Signal['channel'] & string;
  score: number;
}

/**
 * Fold a member's signals into a disposition batch. All signals must be for the
 * same member; the caller partitions by memberId (C6).
 */
export function disposeBatch(
  signals: Signal[],
  pack: PolicyPack,
  ctx: MemberContext,
  deps: EngineDeps,
): DispositionBatch {
  const now = deps.now();
  const ordered = sortByOrder(signals);
  const foldWindowId = coordinationWindowId(now, pack);
  const memberId = ctx.memberId;
  const rid = pack.ruleIds;

  const closedMeasures = new Set<string>(ctx.recentlyClosedMeasures ?? []);
  for (const s of ordered) {
    if (s.kind === 'care-gap.closed' && s.measure) closedMeasures.add(s.measure);
  }

  const decisions: Disposition[] = [];
  const candidates: Candidate[] = [];
  const seenDedupe = new Map<string, string>();
  const actsThisFold = new Map<string, number>(); // channel -> count decided this fold

  const suppress = (s: Signal, reasonCode: Parameters<typeof mkSuppress>[2], policyId: string) =>
    decisions.push(mkSuppress(s, now, reasonCode, policyId));

  for (const s of ordered) {
    // Internal-only signals never contact anyone; they drive state (supersede)
    // but themselves take no action — recorded, never silently dropped.
    if (s.actionability === 'internal-only') {
      suppress(s, 'internal-only', rid.internalOnly);
      continue;
    }
    // Duplicate collapse (idempotent intake within the fold).
    if (pack.suppression.duplicateCollapse && seenDedupe.has(s.dedupeKey)) {
      suppress(s, 'duplicate-collapse', rid.duplicateCollapse);
      continue;
    }
    seenDedupe.set(s.dedupeKey, s.signalId);

    // Consent gate: a member-contact signal must clear its consent scope.
    if (s.consentScope && !deps.consentGranted(memberId, s.consentScope, ctx)) {
      suppress(s, 'consent-absent', rid.consentScope);
      continue;
    }
    // Supersede on closure.
    if (isSuperseded(s, pack, closedMeasures)) {
      suppress(s, 'superseded-on-closure', rid.supersedeOnClosure);
      continue;
    }
    // TTL expiry.
    if (isExpired(s, now)) {
      suppress(s, 'expired-ttl', rid.expiredTtl);
      continue;
    }

    const channel = resolveChannel(s, pack, ctx);
    // Quiet-hours / contact-window: sms outside its window delays to next window.
    if (outsideSmsWindow(channel, now, pack)) {
      const untilMs = nextSmsWindowMs(now, pack);
      decisions.push({
        signalId: s.signalId,
        memberId,
        action: 'delay',
        untilWindowId: smsWindowId(untilMs),
        untilMs,
        policyIds: [rid.quietHoursWindow],
        decidedAtMs: now,
      });
      continue;
    }
    // Frequency cap: prior contacts + acts this fold on the channel vs the cap.
    const used = priorContactCount(channel, ctx, now, pack) + (actsThisFold.get(channel) ?? 0);
    if (used >= capFor(channel, pack)) {
      suppress(s, 'frequency-cap', rid.frequencyCap);
      continue;
    }
    actsThisFold.set(channel, (actsThisFold.get(channel) ?? 0) + 1);
    candidates.push({ signal: s, channel, score: priorityScore(s, pack, ctx) });
  }

  // Pass 2: approved candidates compose into coordinated touchpoint(s). Highest
  // score (ties by sequence) opens the touchpoint (act); the rest bundle in.
  candidates.sort((a, b) => b.score - a.score || orderKey(a.signal) - orderKey(b.signal));
  const maxIntents = pack.bundling.maxIntentsPerTouchpoint;
  candidates.forEach((c, i) => {
    const chunk = Math.floor(i / maxIntents);
    const touchpointId = chunk === 0 ? `tp:${memberId}:${foldWindowId}` : `tp:${memberId}:${foldWindowId}:${chunk + 1}`;
    const first = i % maxIntents === 0;
    decisions.push({
      signalId: c.signal.signalId,
      memberId,
      action: first ? 'act' : 'bundle',
      touchpointId,
      channel: c.channel,
      priorityScore: c.score,
      policyIds: [rid.priorityScoring, rid.bundlingWindow],
      decidedAtMs: now,
    });
  });

  const signalsById = new Map(ordered.map((s) => [s.signalId, s]));
  const touchpoints = composeTouchpoints(decisions, signalsById, memberId);
  const delayBundles = bundleDelays(decisions);
  const summary = {
    approved: decisions.filter(isApproved).length,
    suppressed: decisions.filter((d) => d.action === 'suppress').length,
    delayed: decisions.filter((d) => d.action === 'delay').length,
    touchpoints: touchpoints.length,
  };

  emitAudit(decisions, summary, memberId, now, foldWindowId, deps);
  return { memberId, foldWindowId, decidedAtMs: now, dispositions: decisions, touchpoints, delayBundles, summary };
}

function orderKey(s: Signal): number {
  return s.sequence ?? s.occurredAtMs;
}

function mkSuppress(
  s: Signal,
  now: number,
  reasonCode:
    | 'duplicate-collapse'
    | 'consent-absent'
    | 'superseded-on-closure'
    | 'frequency-cap'
    | 'expired-ttl'
    | 'internal-only',
  policyId: string,
): Disposition {
  return {
    signalId: s.signalId,
    memberId: s.memberId,
    action: 'suppress',
    reasonCode,
    policyIds: [policyId],
    decidedAtMs: now,
  };
}

/** One PHI-safe audit entry per decision, plus a fold-level entry. */
function emitAudit(
  decisions: Disposition[],
  summary: DispositionBatch['summary'],
  memberId: string,
  now: number,
  foldWindowId: string,
  deps: EngineDeps,
): void {
  const actor = deps.actor ?? 'sde-engine';
  for (const d of decisions) {
    const detail: SdeAuditEntry['detail'] = { signalId: d.signalId, action: d.action, policyIds: d.policyIds };
    if (d.action === 'suppress') detail.reasonCode = d.reasonCode;
    if (d.action === 'delay') detail.untilWindowId = d.untilWindowId;
    if (d.action === 'act' || d.action === 'bundle') detail.touchpointId = d.touchpointId;
    deps.audit.record({ kind: 'disposition', memberId, actor, atMs: now, correlationId: deps.correlationId, detail });
  }
  deps.audit.record({
    kind: 'fold',
    memberId,
    actor,
    atMs: now,
    correlationId: deps.correlationId,
    detail: {
      foldWindowId,
      approved: summary.approved,
      suppressed: summary.suppressed,
      delayed: summary.delayed,
      touchpoints: summary.touchpoints,
    },
  });
}
