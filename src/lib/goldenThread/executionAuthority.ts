/**
 * WHO MAY CAUSE A GOVERNED EFFECT — the execution bind for `runGovernedAction`.
 *
 * Extracted because `governedAction.ts` is at its 400-line cap and because this is a distinct
 * responsibility: that module decides WHETHER an action resolves; this one decides whether the human
 * it resolved on may authorise the effect.
 *
 * WHY IT EXISTS (adversarial-AFTER, HIGH-4). `runGovernedAction` is a full parallel resolution path.
 * It accepts a `HumanDecision`, runs the interlock, and on `resolved` executes a payer-facing
 * submission and writes `decidedBy` into the durable evidence ledger — while calling neither
 * `assertReviewerQualified` nor `assertSignalDecider`, and matching no marker of the E14 gate that
 * exists to catch exactly that. Its one caller qualified first, so the LIVE path was covered; the
 * exported FUNCTION was unguarded and unwatched, and the second caller — an ops tool, a batch
 * runner, a test turned utility — would have executed a submission on an unqualified decider with
 * every gate reporting green.
 */
import { isMintedProof, type QualifiedReviewer } from '@/lib/authz/credentialing';
import type { HumanDecision } from '@/lib/agentRuntime';

/**
 * Assert that an execution resting on a HUMAN decision carries a minted proof naming that human.
 *
 * SCOPED TO THE PRESENCE OF A DECISION, deliberately. A HOTL non-submission action with NO decision
 * auto-proceeds under the interlock — there is no human, so demanding a proof of one would be
 * demanding a receipt for something that did not happen, and would block a path the tier legitimately
 * permits. The hole is the other case: a caller HANDS IN a `HumanDecision` and executes on it.
 *
 * `isMintedProof` rather than a type check: the brand on `QualifiedReviewer` is erased at compile
 * time, so a cast, a spread of a real proof, or an object parsed at a future HTTP boundary all
 * satisfy the type. Membership of the minting module's private WeakSet cannot be forged.
 */
export function assertExecutionAuthorised(
  decision: HumanDecision | null | undefined,
  reviewer: QualifiedReviewer | null | undefined
): void {
  if (!decision) return;
  if (!reviewer || !isMintedProof(reviewer))
    throw new Error(
      'runGovernedAction: executing on a human decision requires a QualifiedReviewer proof ' +
        '(assertReviewerQualified) — a decider string alone cannot authorise a payer-facing effect'
    );
  if (reviewer.reviewerRef !== decision.decidedBy)
    throw new Error(
      'runGovernedAction: the reviewer proof does not name the decider the record will carry'
    );
}
