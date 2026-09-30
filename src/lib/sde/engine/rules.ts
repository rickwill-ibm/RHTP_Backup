/**
 * Pure policy-rule evaluators. Each is a deterministic function of (signal,
 * pack, member context, injected clock) — no I/O, no globals. The engine
 * (dispositionEngine.ts) dispatches these and records which rule fired.
 *
 * SMS window + coordination windows are evaluated in UTC so the fold is
 * reproducible regardless of the host TZ (the deployment sets its clock).
 */
import type { Channel, MemberContext, PolicyPack, Priority, Signal } from '../types';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** Priority score: pack weight for the class plus a recent-ED boost. */
export function priorityScore(signal: Signal, pack: PolicyPack, ctx: MemberContext): number {
  const base = pack.priorityWeights[signal.priority as Priority] ?? 0;
  const boost = ctx.recentEdWithinHours !== undefined ? pack.recentEdBoost : 0;
  return base + boost;
}

/**
 * Internal routing, not a way of contacting a member.
 *
 * `task` puts work in front of the CARE TEAM. A member's channel preference says how to reach the
 * MEMBER, so it has nothing to say about a care-team task and must not override one.
 */
const INTERNAL_CHANNELS: ReadonlySet<Channel> = new Set<Channel>(['task']);

/**
 * Resolve the channel: the member's preference for anything member-facing, else the signal's own,
 * else the pack order.
 *
 * WHAT THIS ORDER REPLACED, AND WHY IT IS A §1557 FIX, NOT A REFACTOR. It read
 * `if (signal.channel) return signal.channel;` FIRST — and `signalIntake` sets `signal.channel` from
 * `TaxonomyEntry.defaultChannel`, which 10 of the 11 shipped taxonomy kinds carry. So the member's
 * stated preference was reached only for the one kind with no default: it was, in practice, dead.
 *
 * A deaf or hard-of-hearing member whose recorded preference is `['sms']` received care-gap outreach
 * on `portal`, because the taxonomy said so. That is an effective-communication failure under
 * Section 1557 (45 CFR 92.202), and it is exactly the harm `fairness-lock.json`'s
 * `MemberContext.channelPreference` entry claims to be about — while that entry's own basis said
 * "resolveChannel SELECTS the channel from it", which was false. A fairness record that misdescribes
 * the mechanism is worse than no record: it points a reviewer away from the defect.
 *
 * `task` is exempt because it is internal routing, so preference does not apply. Every OTHER
 * taxonomy default is now a FALLBACK for a member who expressed no preference, which is what a
 * default should be.
 */
export function resolveChannel(signal: Signal, pack: PolicyPack, ctx: MemberContext): Channel {
  if (signal.channel && INTERNAL_CHANNELS.has(signal.channel)) return signal.channel;
  const pref = ctx.channelPreference && ctx.channelPreference[0];
  if (pref) return pref;
  if (signal.channel) return signal.channel;
  return pack.channelDefaultOrder[0] ?? 'portal';
}

/** True when a care-gap outreach targets a measure already closed for the member. */
export function isSuperseded(
  signal: Signal,
  pack: PolicyPack,
  closedMeasures: Set<string>
): boolean {
  if (!pack.suppression.supersedeOnClosure) return false;
  if (signal.actionability !== 'member-outreach') return false;
  return signal.measure !== undefined && closedMeasures.has(signal.measure);
}

/** True when an undispositioned signal has passed its TTL. */
export function isExpired(signal: Signal, nowMs: number): boolean {
  if (signal.ttlHours === undefined) return false;
  return signal.occurredAtMs + signal.ttlHours * HOUR_MS < nowMs;
}

/**
 * True when a channel with a contact window is currently outside it (delay path).
 *
 * THE QUIET-HOURS WINDOW IS A §92.210 IDENTIFIED INPUT (`fairness-lock.json`,
 * `PolicyPack.smsWindow`), and it was contradicting itself. `PolicyPack.smsWindow`'s own type
 * comment reads "24h clock, LOCAL" while this function read `getUTCHours()`. One UTC window across
 * a multi-timezone state lands at the wrong local hour for a subset of members — so members in one
 * part of a state were delayed for reasons that had nothing to do with their preference. And the
 * window only ever delays SMS, the channel deaf and hard-of-hearing members depend on, so the error
 * fell along a disability line.
 *
 * `utcOffsetMinutes` resolves it AS THE MEMBER EXPERIENCES IT when the member's offset is known.
 * When it is NOT known the behaviour is unchanged (UTC) — deliberately, and recorded as residue in
 * the lock rather than papered over: defaulting an unknown member to a guessed timezone would
 * substitute one silent error for another, and the honest state is that this platform does not yet
 * carry a member timezone.
 */
export function outsideSmsWindow(
  channel: Channel,
  nowMs: number,
  pack: PolicyPack,
  utcOffsetMinutes?: number
): boolean {
  if (channel !== 'sms') return false;
  const shifted = nowMs + (utcOffsetMinutes ?? 0) * 60_000;
  const hour = new Date(shifted).getUTCHours();
  const { startHour, endHour } = pack.smsWindow;
  return !(hour >= startHour && hour < endHour);
}

/** The next sms-window opening (UTC), given now is outside the window. */
export function nextSmsWindowMs(nowMs: number, pack: PolicyPack): number {
  const d = new Date(nowMs);
  const startToday = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    pack.smsWindow.startHour,
    0,
    0,
    0
  );
  return nowMs < startToday ? startToday : startToday + DAY_MS;
}

/** Stable id for the sms coordination window a delayed signal parks to. */
export function smsWindowId(nextMs: number): string {
  return `sms-window:${new Date(nextMs).toISOString().slice(0, 13)}`;
}

/** The member's daily coordination-window id (bundling cadence). */
export function coordinationWindowId(nowMs: number, pack: PolicyPack): string {
  const cadenceMs = pack.bundling.coordinationWindowCadenceHours * HOUR_MS;
  return `cw:${Math.floor(nowMs / cadenceMs)}`;
}

/**
 * Count of prior contacts on a channel inside its rolling cap window, from the
 * member's contact history. Combined with acts already decided this fold, the
 * engine compares against the cap.
 */
export function priorContactCount(
  channel: Channel,
  ctx: MemberContext,
  nowMs: number,
  pack: PolicyPack
): number {
  const cap = pack.frequencyCaps.find((c) => c.channel === channel);
  if (!cap) return 0;
  const since = nowMs - cap.windowHours * HOUR_MS;
  return (ctx.contactHistory ?? []).filter((c) => c.channel === channel && c.atMs >= since).length;
}

/** The cap for a channel, or Infinity when uncapped (e.g. care-team tasks). */
export function capFor(channel: Channel, pack: PolicyPack): number {
  const cap = pack.frequencyCaps.find((c) => c.channel === channel);
  return cap ? cap.maxPerWindow : Number.POSITIVE_INFINITY;
}
