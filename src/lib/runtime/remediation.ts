/**
 * Remediation / reprocessing entrypoint — the round trip that brings a HELD or
 * QUARANTINED record back into the projected graph once a steward has coded it.
 *
 * A previously-uncoded record (e.g. a Condition with no ICD-10 coding) was
 * quarantined and persisted to the durable dead-letter ledger. A steward stages a
 * CORRECTED minimal bundle — the member's Patient (for identity anchoring to the
 * SAME member, via the M3 consolidation path) plus the SAME resource now carrying
 * governed codes — and calls `remediateAndReprocess`. This is HONEST: the raw
 * corrected resource is supplied transiently by the caller and is NEVER written to
 * the PHI-safe ledger; only refs/codes/counts are.
 *
 * SUCCESS is conservative (red-team defence): the corrected resource must ADMIT
 * (admitted > 0) with ZERO residual quarantine and no identity hold. A partially
 * successful remediation (any resource still quarantines) does NOT resolve the
 * hold — the record stays open. Only on full success is the hold resolved
 * ('retry', immutable resolved version appended) and a `remediation`
 * reconciliation record emitted reflecting the delta.
 */
import { now as clockNow, rng as clockRng } from '@/lib/clock';
import type { DeadLetterRecord } from '@/lib/deadLetter';
import { setDeadLetterRetryLane } from '@/lib/deadLetter/review/lanes';
import type { RetryOutcome } from '@/lib/deadLetter/review';
import {
  ingestBundle,
  type FhirBundle,
  type IngestBundleOptions,
  type IngestStores,
} from './ingestBundle';
import type { LoadReconciliationRecord } from './reconciliation';

/** Options for one remediation round trip. */
export interface RemediationOptions {
  /** The dead-letter id of the hold/quarantine being remediated (`dl-...`). */
  holdId: string;
  /** Ops principal staging the correction (audited on the resolved record). */
  actor: string;
  /** The SOURCE SYSTEM — MUST match the original load's source so identity consolidates. */
  sourceSystem: string;
  /**
   * The anchored member id the hold belongs to (from the ORIGINAL load — `load.memberId`).
   * Remediation REFUSES to resolve unless the correction consolidates onto THIS member.
   * For an identifier-poor member (MRN-only, no global id) the anchor is a minted id
   * derived from the source+token; a steward passing a drifted source/token would
   * otherwise MINT A NEW member and falsely close the hold on a split identity. This
   * guard makes that impossible (red-team FINDING 2).
   */
  expectedMemberId: string;
  now?: () => number;
  rng?: () => number;
  medicaidSystem?: IngestBundleOptions['medicaidSystem'];
  identitySource?: IngestBundleOptions['identitySource'];
}

export interface RemediationResult {
  ok: boolean;
  /** The anchored member id the correction consolidated onto ('' when held). */
  memberId: string;
  /** The resolved (retried) dead-letter record on success, else null. */
  resolvedHold: DeadLetterRecord | null;
  /** The `remediation` reconciliation record for this round trip. */
  reconciliation: LoadReconciliationRecord;
  /** Dead-letter ids of resources that STILL quarantined (empty on success). */
  stillQuarantined: string[];
  /** PHI-safe machine reason when ok:false (else undefined). */
  reason?: string;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
/** The set of resource ids present in a bundle (the corrected resources supplied). */
function resourceIds(bundle: FhirBundle): Set<string> {
  const ids = new Set<string>();
  for (const e of bundle.entry ?? []) {
    const id = str((e.resource as { id?: unknown } | undefined)?.id);
    if (id) ids.add(id);
  }
  return ids;
}

/**
 * Run a corrected bundle back through the driver and resolve the SPECIFIC hold —
 * but only when the correction verifiably fixed THAT hold's resource, on the RIGHT
 * member. The two red-team integrity gaps are closed here:
 *   - the hold is resolved iff the held record's own `sourceRef` is present in the
 *     correction AND admitted (not re-quarantined) — never on a coarse "something
 *     admitted somewhere" signal (FINDING 1: false / wrong-hold closure);
 *   - AND the correction consolidated onto `expectedMemberId` — never a drifted /
 *     newly-minted member (FINDING 2: silent identity split).
 * Idempotent: re-running re-projects the same node (deterministic PUT) and
 * re-resolving a terminal hold is a no-op (the store returns it unchanged).
 */
export async function remediateAndReprocess(
  correctedBundle: FhirBundle,
  opts: RemediationOptions,
  stores: IngestStores
): Promise<RemediationResult> {
  // Remediation is defined only against the durable ledger — it needs the hold to
  // know WHICH resource must be proven fixed. No ledger -> cannot safely resolve.
  const hold = stores.deadLetter ? await stores.deadLetter.get(opts.holdId) : null;
  const targetRef = str(hold?.sourceRef);

  const res = await ingestBundle(
    correctedBundle,
    {
      sourceSystem: opts.sourceSystem,
      now: opts.now,
      rng: opts.rng,
      medicaidSystem: opts.medicaidSystem,
      identitySource: opts.identitySource,
    },
    stores
  );

  const stillQuarantined = res.quarantined.map((q) => `dl-${q.quarantineId}`);
  const quarantinedRefs = new Set(res.quarantined.map((q) => q.sourceRef));
  const suppliedIds = resourceIds(correctedBundle);

  // Ordered, PHI-safe gate — the FIRST failed check is the reason.
  let reason: string | undefined;
  if (!stores.deadLetter) reason = 'no-dead-letter-store';
  else if (!hold) reason = 'hold-not-found';
  else if (res.held) reason = 'held';
  else if (res.memberId !== opts.expectedMemberId) reason = 'member-mismatch';
  else if (targetRef && !suppliedIds.has(targetRef)) reason = 'target-not-in-correction';
  else if (targetRef && quarantinedRefs.has(targetRef)) reason = 'target-still-quarantined';
  const ok = reason === undefined;

  // Resolve ONLY the specific hold, only when its own resource is proven fixed on the
  // right member. Immutable resolved version appended; a terminal hold is unchanged.
  let resolvedHold: DeadLetterRecord | null = null;
  if (ok) resolvedHold = await stores.deadLetter!.resolve(opts.holdId, 'retry', opts.actor);

  // The remediation reconciliation is stamped `remediation` with its OWN loadId (so a
  // load record and a remediation for the same source+patient+time never collide —
  // FINDING 3) and points its heldRefs at the CLEARED hold (or the residual quarantines).
  const reconciliation: LoadReconciliationRecord = {
    ...res.reconciliation,
    kind: 'remediation',
    loadId: `remed-${opts.holdId}-${res.reconciliation.loadId}`,
    heldRefs: ok ? [opts.holdId] : stillQuarantined,
  };
  if (stores.reconciliation) await stores.reconciliation.append(reconciliation);

  return { ok, memberId: res.memberId, resolvedHold, reconciliation, stillQuarantined, reason };
}

/** A steward-staged correction: the corrected bundle plus its routing context. */
export interface StagedCorrection {
  bundle: FhirBundle;
  sourceSystem: string;
  actor: string;
  /** The anchored member the hold belongs to — the consolidation guard (FINDING 2). */
  expectedMemberId: string;
  now?: () => number;
  rng?: () => number;
}

/**
 * Provider seam: given a dead-letter record, return the staged correction for it,
 * or null when no correction has been staged (fail-closed).
 */
export type RemediationProvider = (record: DeadLetterRecord) => Promise<StagedCorrection | null>;

/**
 * Register the WPC reprocess retry lane for `quarantine` records. On `retry`, the
 * lane asks `provider` for a staged correction and runs `remediateAndReprocess`.
 * FAIL-CLOSED: no correction staged -> `no-remediation-staged`, the record stays
 * open (the review layer does not mark it retried).
 */
export function registerWpcReprocessLane(
  stores: IngestStores,
  provider: RemediationProvider
): void {
  setDeadLetterRetryLane('quarantine', async (record: DeadLetterRecord): Promise<RetryOutcome> => {
    const staged = await provider(record);
    if (!staged) return { ok: false, detail: 'no-remediation-staged' };
    const result = await remediateAndReprocess(
      staged.bundle,
      {
        holdId: record.id,
        actor: staged.actor,
        sourceSystem: staged.sourceSystem,
        expectedMemberId: staged.expectedMemberId,
        now: staged.now ?? clockNow,
        rng: staged.rng ?? clockRng,
      },
      stores
    );
    return result.ok
      ? { ok: true, detail: `remediated;member=${result.memberId}` }
      : {
          ok: false,
          detail: result.reason ?? `still-quarantined=${result.stillQuarantined.length}`,
        };
  });
}
