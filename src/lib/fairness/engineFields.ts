// CONTRACT: C-FAIRNESS
/**
 * THE FIELDS THE DISPOSITION ENGINE READS — the set §92.210(b) identification is taken over.
 *
 * DECLARED HERE RATHER THAN DISCOVERED AT RUNTIME, and the gate is what keeps it honest.
 * `docs/build-provenance/check-92210.mjs` walks `src/lib/sde/engine/` and the `MemberContext` /
 * `PolicyPack` type declarations and fails when this list, the types, and the lock disagree. So this
 * constant cannot drift from the code silently: it is one of three things the gate holds together,
 * not a hand-maintained list anyone trusts on its own.
 *
 * WHY THE LIST EXISTS AT ALL. Identification has to be over a KNOWN set or "we identified our
 * inputs" means nothing. Enumerating them, and refusing any field that is not in the reviewed lock,
 * makes identification a property of the build rather than an assertion by an author — which is the
 * difference between this and the per-agent declaration the BEFORE round rejected.
 */
import { parseFairnessLock } from './assertFairnessLock';
import lockData from './data/fairness-lock.json';
import type { FairnessLockFile } from './types';

/** Every `MemberContext` and `PolicyPack` field the engine reads on a member-affecting path. */
export const ENGINE_READ_FIELDS: readonly string[] = Object.freeze([
  'MemberContext.channelPreference',
  'MemberContext.recentEdWithinHours',
  'Signal.measure',
  'MemberContext.contactHistory',
  'MemberContext.recentlyClosedMeasures',
  'MemberContext.consentScopesGranted',
  'PolicyPack.smsWindow',
  'PolicyPack.priorityWeights',
  'PolicyPack.recentEdBoost',
  'PolicyPack.frequencyCaps',
  'PolicyPack.channelDefaultOrder',
  'MemberContext.memberId',
  'PolicyPack.packId',
  'PolicyPack.version',
  'PolicyPack.ruleIds',
  'PolicyPack.bundling',
  'PolicyPack.suppression',
  'Signal.signalId',
  'Signal.memberId',
  'Signal.sourceEventType',
  'Signal.refs',
  'Signal.sequence',
  'Signal.dedupeKey',
  'TaxonomyEntry.signalType',
  'TaxonomyEntry.sourceEventTypes',
  'TaxonomyEntry.dedupeKeyTemplate',
  'Signal.kind',
  'Signal.occurredAtMs',
  'Signal.priority',
  'Signal.actionability',
  'Signal.foldBehavior',
  'Signal.channel',
  'Signal.consentScope',
  'Signal.ttlHours',
  'Signal.part2Restricted',
  'TaxonomyEntry.defaultPriority',
  'TaxonomyEntry.actionability',
  'TaxonomyEntry.foldBehavior',
  'TaxonomyEntry.defaultChannel',
  'TaxonomyEntry.consentScope',
  'TaxonomyEntry.dataClassFloor',
  'TaxonomyEntry.ttlHours',
  'TaxonomyEntry.sourceGated',
]);

let cached: FairnessLockFile | null = null;

/**
 * The parsed, validated lock. Parsed rather than cast, and DEEP-VALIDATED on first read: a lock that
 * is malformed, self-contradictory, or cites the simulated fairness screen as evidence is refused
 * here rather than believed.
 */
export function loadFairnessLock(): FairnessLockFile {
  cached ??= parseFairnessLock(lockData, 'src/lib/fairness/data/fairness-lock.json');
  return cached;
}
