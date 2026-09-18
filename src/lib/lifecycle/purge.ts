/**
 * Policy-driven purge over the MUTABLE stores (Wave C).
 *
 * The pipeline is: scan sources -> select by policy -> split off legal holds ->
 * remove the rest -> emit audit. The split is the E9 guarantee in code: an item
 * a hold protects is placed in `heldBack` and is NEVER passed to a source's
 * `remove`. Planning is pure (given items + policies + a hold predicate + now);
 * only `executePurge` touches the stores.
 */
import * as clock from '@/lib/clock';
import { auditHeldBack, auditPurged } from './audit';
import { selectByPolicies } from './policy';
import type { LegalHoldRegistry } from './legalHold';
import type {
  PurgeableItem,
  PurgePlan,
  PurgeResult,
  PurgeSelection,
  PurgeSource,
  RetentionPolicy,
} from './types';

/** Predicate form of a hold check, so planning can stay decoupled from the registry. */
export type HoldPredicate = (subjectRef: string) => boolean;

/** Adapt a LegalHoldRegistry to a HoldPredicate. */
export function holdPredicate(registry: LegalHoldRegistry): HoldPredicate {
  return (subjectRef: string) => registry.isHeld(subjectRef);
}

/**
 * Plan a purge: select items by policy, then partition into `purge` (free to
 * remove) and `heldBack` (a legal hold protects the subject). Pure — no store
 * access, no clock read.
 */
export function planPurge(
  items: readonly PurgeableItem[],
  policies: readonly RetentionPolicy[],
  isHeld: HoldPredicate,
  nowMs: number
): PurgePlan {
  const selected = selectByPolicies(items, policies, nowMs);
  const purge: PurgeSelection[] = [];
  const heldBack: PurgeSelection[] = [];
  for (const sel of selected) {
    if (isHeld(sel.item.subjectRef)) heldBack.push(sel);
    else purge.push(sel);
  }
  return { purge, heldBack };
}

/**
 * Execute a plan against the sources that produced it. Removes only `purge`
 * items; `heldBack` items are audited as blocked and left untouched. Emits one
 * audit event per item. `actor` and `nowMs` (via the clock) make it deterministic.
 */
export async function executePurge(
  plan: PurgePlan,
  sources: readonly PurgeSource[],
  actor: string
): Promise<PurgeResult> {
  const byStore = new Map(sources.map((s) => [s.store, s]));
  const ts = clock.nowIso();
  const audit = [];
  const purged: PurgeSelection[] = [];

  for (const sel of plan.purge) {
    const source = byStore.get(sel.item.store);
    if (!source) {
      throw new Error(
        `purge: no source registered for store '${sel.item.store}' (item ${sel.item.id})`
      );
    }
    await source.remove(sel.item.id);
    purged.push(sel);
    audit.push(auditPurged(sel, ts, actor));
  }

  for (const sel of plan.heldBack) {
    audit.push(auditHeldBack(sel, ts, actor));
  }

  return { purged, heldBack: plan.heldBack, audit };
}

/**
 * End-to-end convenience: scan every source, plan against the policies and the
 * hold registry, and execute. The single entry point a scheduled retention job
 * calls.
 */
export async function runPurge(
  sources: readonly PurgeSource[],
  policies: readonly RetentionPolicy[],
  registry: LegalHoldRegistry,
  actor: string,
  nowMs: number = clock.now()
): Promise<PurgeResult> {
  const items: PurgeableItem[] = [];
  for (const source of sources) {
    const scanned = await source.scan();
    for (const item of scanned) items.push(item);
  }
  const plan = planPurge(items, policies, holdPredicate(registry), nowMs);
  return executePurge(plan, sources, actor);
}
