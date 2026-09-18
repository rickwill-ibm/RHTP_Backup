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

/** Resolve the channel: the signal's own, else member preference, else pack order. */
export function resolveChannel(signal: Signal, pack: PolicyPack, ctx: MemberContext): Channel {
  if (signal.channel) return signal.channel;
  const pref = ctx.channelPreference && ctx.channelPreference[0];
  if (pref) return pref;
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

/** True when a channel with a contact window is currently outside it (delay path). */
export function outsideSmsWindow(channel: Channel, nowMs: number, pack: PolicyPack): boolean {
  if (channel !== 'sms') return false;
  const hour = new Date(nowMs).getUTCHours();
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
