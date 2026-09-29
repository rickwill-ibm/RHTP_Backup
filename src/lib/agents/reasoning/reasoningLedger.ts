// CONTRACT: C-REASON
/**
 * Reasoning idempotency.
 *
 * A durable workflow retries. Retrying a pure activity is invisible and correct.
 * Retrying an activity with a MODEL in it is neither: the second call can return
 * something different, and if the workflow simply takes the newer answer, the
 * run's recorded history no longer explains its own outcome. A member could be
 * denied on reasoning that the evidence record does not contain.
 *
 * So a reasoning step is keyed by (workflowId, stepId). The FIRST result for a
 * key is the result, recorded by digest. A later call under the same key must
 * produce the same digest. If it does not, that is not a transparent retry — it
 * is a GOVERNANCE EVENT, raised loudly, because the model has become
 * non-reproducible at a point the record depends on.
 *
 * INVARIANT: the first recorded digest for a key is authoritative.
 * INVARIANT: divergence raises; it is never resolved by preferring either value.
 * INVARIANT: pure, injected, no clock — the caller supplies the digest.
 */

/** Identifies one reasoning activity within one run. */
export interface ReasoningStepKey {
  workflowId: string;
  stepId: string;
}

/** What happened when a result was submitted under a key. */
export type LedgerOutcome = 'recorded' | 'replayed';

/**
 * Raised when the same reasoning step produced a different result on retry.
 * This is deliberately NOT a subclass of the boundary error: a boundary breach
 * is the reasoner misbehaving inside known limits, whereas divergence means the
 * run can no longer be reproduced from its own history.
 */
export class ReasoningDivergenceError extends Error {
  constructor(
    public readonly key: ReasoningStepKey,
    public readonly recordedDigest: string,
    public readonly observedDigest: string
  ) {
    super(
      `reasoning step ${key.workflowId}/${key.stepId} produced a different result on retry ` +
        `(recorded ${recordedDigest}, observed ${observedDigest}) — a run whose history does ` +
        'not reproduce its outcome cannot support a determination'
    );
    this.name = 'ReasoningDivergenceError';
  }
}

/** Records the first digest per key and refuses a divergent retry. */
export interface ReasoningLedger {
  /** Record or verify. Returns how the submission was treated. */
  submit(key: ReasoningStepKey, digest: string): LedgerOutcome;
  /** The digest recorded for a key, if any. For diagnostics and replay checks. */
  recorded(key: ReasoningStepKey): string | undefined;
  size(): number;
}

const keyOf = (k: ReasoningStepKey): string => `${k.workflowId}\u0000${k.stepId}`;

/**
 * An in-memory ledger. Scope it to the run, or to the process for a single-node
 * deployment; a multi-node deployment binds this to the same durable store the
 * workflow history lives in, which is a deployment binding, not an authority.
 */
export function createReasoningLedger(): ReasoningLedger {
  const byKey = new Map<string, string>();
  return {
    submit(key, digest) {
      const k = keyOf(key);
      const recorded = byKey.get(k);
      if (recorded === undefined) {
        byKey.set(k, digest);
        return 'recorded';
      }
      if (recorded !== digest) throw new ReasoningDivergenceError(key, recorded, digest);
      return 'replayed';
    },
    recorded: (key) => byKey.get(keyOf(key)),
    size: () => byKey.size,
  };
}
