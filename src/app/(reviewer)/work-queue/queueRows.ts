/**
 * queueRows.ts — the PARSED boundary between `GET /api/work-queue` and the reviewer inbox.
 *
 * WHY THIS EXISTS: the page typed the response as `WorkItem[]`, but in mock mode the BFF
 * returns `devWorkQueueItems()` verbatim and that stub names the same facts differently —
 * `slaDurationHours` / `slaDueAt` / `id` / `isExpedited` where the domain `WorkItem` has
 * `slaHours` / `dueBy` / `evidenceId` / `priority`. Nothing failed loudly: every SLA field
 * read `undefined`, so `SLA {item.slaHours}h · due {…}` rendered as the literal
 * `SLA h · due —` on every row of a CMS-0057-F reviewer queue, and the "View evidence" link
 * pointed at `/evidence/undefined`.
 *
 * A BFF response is an untrusted boundary (AGENTS.md: boundaries are parsed, never cast), so
 * this module reads it out of `unknown` and yields rows whose SLA is either
 *   • `known`       — priority, hours and due-by all resolved, or
 *   • `unavailable` — with the reason, rendered as such.
 * There is no third, silent state: a regulated timer is shown, or its absence is shown.
 * FAIL-CLOSED: an `unavailable` SLA counts as breached, because a clock a reviewer cannot
 * read must draw attention rather than pass as "within SLA".
 *
 * Reuses `slaHours()` from `@/lib/workflow/paMachine` — the SAME 72h-expedited / 7d-standard
 * source the router uses — so no SLA duration is invented here.
 */
import { slaHours as slaHoursFor } from '@/lib/workflow/paMachine';
import type { QueueName } from '@/lib/goldenThread';

export type QueuePriority = 'expedited' | 'standard';

export type RowSla =
  | { kind: 'known'; priority: QueuePriority; slaHours: number; dueBy: string }
  | { kind: 'unavailable'; why: string };

export interface QueueRow {
  queue: QueueName;
  /** The Evidence Record this item links to. Empty when the payload carried none. */
  evidenceId: string;
  memberId: string;
  code: string;
  submittedAt: string;
  sla: RowSla;
  /**
   * Propensity TO DENY (0..1), as produced by `scorePropensity` ("Propensity-to-deny").
   * Named for what it measures: the page used to label it "submission-readiness", which
   * inverts its meaning and made correct routing look inverted.
   */
  denialPropensity: number | null;
  denialBand: string | null;
  note: string;
}

const MS_PER_HOUR = 3_600_000;

const QUEUE_NAMES: readonly QueueName[] = [
  'auto-cleared',
  'ready-to-submit',
  'high-risk-review',
  'denied-appeal',
  'more-info',
  'agent-proposal',
  'escalated',
  'parked',
];

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/** A non-empty trimmed string, or null. */
function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return trimmed;
}

/** A finite number, or null. */
function num(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

/** The first of the candidates that reads as a non-empty string. */
function firstText(source: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = text(source[key]);
    if (value !== null) return value;
  }
  return null;
}

/** The first of the candidates that reads as a finite number. */
function firstNum(source: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = num(source[key]);
    if (value !== null) return value;
  }
  return null;
}

function queueOf(value: unknown): QueueName {
  const name = text(value);
  for (const known of QUEUE_NAMES) {
    if (name === known) return known;
  }
  // An unrecognised queue is put where a human looks first, not quietly auto-cleared.
  return 'high-risk-review';
}

/**
 * The item's CMS-0057-F priority, from whichever field carries it. Returns null when
 * neither the domain `priority`, the stub's `isExpedited` flag, nor a supplied hour count
 * establishes it — a missing priority is NOT assumed to be `standard`, because standard is
 * the LONGER clock and assuming it would understate every expedited item's urgency.
 */
function priorityOf(source: Record<string, unknown>, hours: number | null): QueuePriority | null {
  const stated = text(source.priority);
  if (stated === 'expedited' || stated === 'standard') return stated;
  if (source.isExpedited === true) return 'expedited';
  if (source.isExpedited === false) return 'standard';
  if (hours !== null) return hours <= slaHoursFor('expedited') ? 'expedited' : 'standard';
  return null;
}

function addHoursIso(iso: string, hours: number): string | null {
  const start = Date.parse(iso);
  if (Number.isNaN(start)) return null;
  return new Date(start + hours * MS_PER_HOUR).toISOString();
}

/** Resolve the row's SLA, deriving what is missing and naming what cannot be resolved. */
function slaOf(source: Record<string, unknown>, submittedAt: string): RowSla {
  const suppliedHours = firstNum(source, ['slaHours', 'slaDurationHours']);
  const priority = priorityOf(source, suppliedHours);
  if (priority === null) {
    return { kind: 'unavailable', why: 'no priority on the item' };
  }
  // The regulated durations come from paMachine, never from a literal here.
  const hours = suppliedHours === null ? slaHoursFor(priority) : suppliedHours;

  const suppliedDue = firstText(source, ['dueBy', 'slaDueAt']);
  if (suppliedDue !== null && !Number.isNaN(Date.parse(suppliedDue))) {
    return { kind: 'known', priority, slaHours: hours, dueBy: suppliedDue };
  }
  if (submittedAt === '') {
    return { kind: 'unavailable', why: 'no due-by and no submission time to compute one' };
  }
  const derived = addHoursIso(submittedAt, hours);
  if (derived === null) {
    return { kind: 'unavailable', why: 'submission time is unreadable' };
  }
  return { kind: 'known', priority, slaHours: hours, dueBy: derived };
}

function toRow(raw: unknown): QueueRow {
  const source = asObject(raw);
  const submitted = firstText(source, ['submittedAt', 'createdAt']);
  const submittedAt = submitted === null ? '' : submitted;
  const evidence = firstText(source, ['evidenceId', 'id', 'recordRef']);
  const member = firstText(source, ['memberId']);
  const code = firstText(source, ['code']);
  const note = firstText(source, ['note', 'disposition']);
  return {
    queue: queueOf(source.queue),
    evidenceId: evidence === null ? '' : evidence,
    memberId: member === null ? 'unknown member' : member,
    code: code === null ? 'unknown code' : code,
    submittedAt,
    sla: slaOf(source, submittedAt),
    denialPropensity: firstNum(source, ['propensityScore', 'denialPropensity']),
    denialBand: firstText(source, ['propensityBand', 'denialBand']),
    note: note === null ? '' : note,
  };
}

/** Parse a work-queue payload (a group's array, or the flattened set) into rows. */
export function parseQueueRows(raw: unknown): QueueRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(toRow);
}

/** Parse the grouped BFF response into one rows-per-queue map. */
export function parseQueueGroups(raw: unknown): Partial<Record<QueueName, QueueRow[]>> {
  const groups = asObject(raw);
  const out: Partial<Record<QueueName, QueueRow[]>> = {};
  for (const name of QUEUE_NAMES) {
    const rows = parseQueueRows(groups[name]);
    if (rows.length > 0) out[name] = rows;
  }
  return out;
}

/**
 * True when the row's SLA has passed as of `asOfIso`. Boundary: due-by `<= now` is breached.
 * FAIL-CLOSED: an `unavailable` SLA is breached — a timer a reviewer cannot read is not a
 * timer that is fine.
 */
export function rowBreached(row: QueueRow, asOfIso: string): boolean {
  if (row.sla.kind === 'unavailable') return true;
  const due = Date.parse(row.sla.dueBy);
  const asOf = Date.parse(asOfIso);
  if (Number.isNaN(due) || Number.isNaN(asOf)) return true;
  return due <= asOf;
}

/** The row's SLA as the reviewer reads it. Never the unfilled `SLA h · due —` template. */
export function slaText(row: QueueRow): string {
  if (row.sla.kind === 'unavailable') return `SLA unavailable — ${row.sla.why}`;
  return `SLA ${row.sla.slaHours}h (${row.sla.priority}) · due ${row.sla.dueBy.slice(0, 10)}`;
}

/** Hours of SLA left, or null when the SLA is unavailable. Negative once breached. */
export function hoursRemaining(row: QueueRow, asOfIso: string): number | null {
  if (row.sla.kind === 'unavailable') return null;
  const due = Date.parse(row.sla.dueBy);
  const asOf = Date.parse(asOfIso);
  if (Number.isNaN(due) || Number.isNaN(asOf)) return null;
  return Math.round((due - asOf) / MS_PER_HOUR);
}
