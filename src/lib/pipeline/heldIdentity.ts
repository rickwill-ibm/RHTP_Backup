/**
 * Held-identity control signal (§4A stage 3, identity-resolution seam).
 *
 * The whole point of the litmus test: an inbound record whose subject lands in
 * the possible-match band (score 60-90, below the auto-link threshold) must NOT
 * be silently attached to a member — a wrong-person link corrupts the whole
 * person record. A match-engine-backed resolver (identity/empiResolver.ts) throws
 * `HeldIdentityError` at that band; the transform core (transform.ts) catches it
 * and routes the record to the held-for-review lane instead of normalizing it.
 *
 * This is a tiny, dependency-free module so both the identity layer (which throws)
 * and the pipeline transform (which catches) can share it with no import cycle.
 */

/** PHI-safe hold detail: reason code, a PHI-free summary, match tier, and score. */
export interface HeldIdentitySignal {
  /** Structured, PHI-safe, e.g. 'identity-possible-match'. */
  reasonCode: string;
  /** PHI-free one-line summary (rule names + score), safe for an audit record. */
  reason: string;
  /** The match engine's tier, e.g. 'possible-match'. */
  matchTier: string;
  /** 0-100 probabilistic score that put the subject in the review band. */
  confidence: number;
}

/**
 * Thrown by a resolver when identity resolution lands a subject in the possible-
 * match band. Not an error in the failure sense — a deliberate "do not auto-link,
 * route to human review" control-flow signal, caught centrally by runTransform.
 */
export class HeldIdentityError extends Error {
  constructor(public readonly signal: HeldIdentitySignal) {
    super(
      `identity held for review: ${signal.reasonCode} ` +
        `(tier=${signal.matchTier}, confidence=${signal.confidence})`
    );
    this.name = 'HeldIdentityError';
  }
}

export function isHeldIdentityError(e: unknown): e is HeldIdentityError {
  return e instanceof HeldIdentityError;
}
