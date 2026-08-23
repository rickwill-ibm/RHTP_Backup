// CONTRACT: C2  // CONTRACT: C10
/**
 * Hand validators for SDE data (zod is not a project dependency — the house
 * pattern is a boundary validator that matches the JSON shape exactly, plan
 * conventions v2 §5). An invalid taxonomy or policy pack refuses LOUDLY so a
 * misconfigured deployment never silently changes dispositions.
 */
import type {
  Actionability,
  Channel,
  FoldBehavior,
  PolicyPack,
  Priority,
  SignalTaxonomy,
  TaxonomyEntry,
} from './types';

export class SdeConfigError extends Error {
  constructor(public readonly field: string, detail: string) {
    super(`SDE config invalid at "${field}": ${detail}`);
    this.name = 'SdeConfigError';
  }
}

const PRIORITIES: Priority[] = ['urgent', 'high', 'routine'];
const ACTIONABILITIES: Actionability[] = ['member-outreach', 'care-team-task', 'internal-only'];
const FOLDS: FoldBehavior[] = ['immediate', 'windowed'];
const CHANNELS: Channel[] = ['sms', 'email', 'portal', 'mail', 'task'];

function str(v: unknown, field: string): string {
  if (typeof v !== 'string' || v === '') throw new SdeConfigError(field, 'non-empty string required');
  return v;
}
function num(v: unknown, field: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new SdeConfigError(field, 'number required');
  return v;
}
function oneOf<T extends string>(v: unknown, allowed: T[], field: string): T {
  if (typeof v !== 'string' || !allowed.includes(v as T))
    throw new SdeConfigError(field, `one of ${allowed.join(', ')}`);
  return v as T;
}
function arr(v: unknown, field: string): unknown[] {
  if (!Array.isArray(v)) throw new SdeConfigError(field, 'array required');
  return v;
}

/** Validate + type a taxonomy entry. */
function parseEntry(raw: unknown, i: number): TaxonomyEntry {
  const o = raw as Record<string, unknown>;
  const at = `entries[${i}]`;
  const entry: TaxonomyEntry = {
    signalType: str(o.signalType, `${at}.signalType`),
    sourceEventTypes: arr(o.sourceEventTypes, `${at}.sourceEventTypes`).map((s, j) =>
      str(s, `${at}.sourceEventTypes[${j}]`),
    ),
    defaultPriority: oneOf(o.defaultPriority, PRIORITIES, `${at}.defaultPriority`),
    actionability: oneOf(o.actionability, ACTIONABILITIES, `${at}.actionability`),
    foldBehavior: oneOf(o.foldBehavior, FOLDS, `${at}.foldBehavior`),
    dedupeKeyTemplate: str(o.dedupeKeyTemplate, `${at}.dedupeKeyTemplate`),
  };
  if (o.defaultChannel !== undefined)
    entry.defaultChannel = oneOf(o.defaultChannel, CHANNELS, `${at}.defaultChannel`);
  if (o.consentScope !== undefined) entry.consentScope = str(o.consentScope, `${at}.consentScope`);
  if (o.ttlHours !== undefined) entry.ttlHours = num(o.ttlHours, `${at}.ttlHours`);
  if (o.sourceGated !== undefined) entry.sourceGated = str(o.sourceGated, `${at}.sourceGated`);
  return entry;
}

/** Parse + validate a signal taxonomy (throws SdeConfigError on any breach). */
export function parseTaxonomy(raw: unknown): SignalTaxonomy {
  const o = raw as Record<string, unknown>;
  const entries = arr(o.entries, 'entries').map(parseEntry);
  if (entries.length === 0) throw new SdeConfigError('entries', 'at least one entry required');
  const seen = new Set<string>();
  for (const e of entries) {
    if (seen.has(e.signalType)) throw new SdeConfigError('entries', `duplicate signalType ${e.signalType}`);
    seen.add(e.signalType);
  }
  return { version: str(o.version, 'version'), entries };
}

/** Parse + validate a disposition policy pack (throws SdeConfigError on breach). */
export function parsePolicyPack(raw: unknown): PolicyPack {
  const o = raw as Record<string, unknown>;
  const pw = (o.priorityWeights ?? {}) as Record<string, unknown>;
  const priorityWeights = {
    urgent: num(pw.urgent, 'priorityWeights.urgent'),
    high: num(pw.high, 'priorityWeights.high'),
    routine: num(pw.routine, 'priorityWeights.routine'),
  };
  const caps = arr(o.frequencyCaps, 'frequencyCaps').map((c, i) => {
    const co = c as Record<string, unknown>;
    return {
      channel: oneOf(co.channel, CHANNELS, `frequencyCaps[${i}].channel`),
      windowHours: num(co.windowHours, `frequencyCaps[${i}].windowHours`),
      maxPerWindow: num(co.maxPerWindow, `frequencyCaps[${i}].maxPerWindow`),
    };
  });
  const sw = (o.smsWindow ?? {}) as Record<string, unknown>;
  const bd = (o.bundling ?? {}) as Record<string, unknown>;
  const sp = (o.suppression ?? {}) as Record<string, unknown>;
  const ri = (o.ruleIds ?? {}) as Record<string, unknown>;
  const ruleId = (k: string) => str(ri[k], `ruleIds.${k}`);
  return {
    packId: str(o.packId, 'packId'),
    version: str(o.version, 'version'),
    priorityWeights,
    recentEdBoost: num(o.recentEdBoost, 'recentEdBoost'),
    frequencyCaps: caps,
    channelDefaultOrder: arr(o.channelDefaultOrder, 'channelDefaultOrder').map((c, i) =>
      oneOf(c, CHANNELS, `channelDefaultOrder[${i}]`),
    ),
    smsWindow: {
      startHour: num(sw.startHour, 'smsWindow.startHour'),
      endHour: num(sw.endHour, 'smsWindow.endHour'),
    },
    bundling: {
      coordinationWindowCadenceHours: num(bd.coordinationWindowCadenceHours, 'bundling.coordinationWindowCadenceHours'),
      maxIntentsPerTouchpoint: num(bd.maxIntentsPerTouchpoint, 'bundling.maxIntentsPerTouchpoint'),
    },
    suppression: {
      supersedeOnClosure: sp.supersedeOnClosure === true,
      duplicateCollapse: sp.duplicateCollapse === true,
    },
    ruleIds: {
      consentScope: ruleId('consentScope'),
      duplicateCollapse: ruleId('duplicateCollapse'),
      supersedeOnClosure: ruleId('supersedeOnClosure'),
      frequencyCap: ruleId('frequencyCap'),
      quietHoursWindow: ruleId('quietHoursWindow'),
      priorityScoring: ruleId('priorityScoring'),
      bundlingWindow: ruleId('bundlingWindow'),
      expiredTtl: ruleId('expiredTtl'),
      internalOnly: ruleId('internalOnly'),
    },
  };
}
