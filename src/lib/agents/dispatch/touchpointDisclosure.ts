// CONTRACT: C-DISCLOSURE
/**
 * The composed-touchpoint half of the disclosure gate: decide a coordinated
 * touchpoint intent by intent, and carry the brand that proves it happened.
 *
 * Split from `disclosureGate.ts` by responsibility (conventions §2): that module
 * decides ONE signal against ONE agent; this one decides an AGGREGATE and is
 * where the representative-vs-aggregate defect below lives.
 */
import { decideDispatchDisclosure, type DisclosureGateDeps } from './disclosureGate';
import type { DisclosureDecision } from '@/lib/agents/disclosure';
import type { Signal, Touchpoint } from '@/lib/sde';

/**
 * A touchpoint whose every remaining intent cleared the disclosure plane.
 *
 * WHY A BRAND. The bypass this closes was the SECOND instance of one bug: a
 * control decided on a REPRESENTATIVE and acted on an AGGREGATE. The gate
 * decided `tp.intents[0]` and dispatched the whole touchpoint, so a Part 2
 * intent bundled behind an ordinary opener reached the agent undecided and
 * unrecorded. Fixing the instance leaves the class open, because
 * `DispatchedTask.task.touchpoint` is an ordinary `Touchpoint` any code path can
 * construct. The brand makes the compiler enforce what a reviewer was enforcing —
 * which it does only now that `OutreachTask.touchpoint` is typed as the brand and
 * the `as OutreachTouchpoint` launder on the no-gate path is gone with the path.
 */
declare const DISCLOSED: unique symbol;
// mut-equiv: flipping this literal type `true` -> `false` is PROVABLY unobservable
// at runtime. `DISCLOSED` is a phantom `unique symbol` — declared, never defined,
// so no value carrying this key ever exists and no test can read which literal the
// brand holds. The brand's whole job is structural non-assignability, which either
// literal provides identically. Its proof is therefore a COMPILE-time one and is
// already live: the `@ts-expect-error` on an undecided `Touchpoint` in
// tests/agents/dispatcher.test.ts fails `tsc --noEmit` if the brand ever stops
// biting. E13's sampler is a runtime tool, so this one line is excluded from it
// rather than left as a permanently unkillable "survivor".
export type DisclosedTouchpoint = Touchpoint & { readonly [DISCLOSED]: true }; // mut-equiv

/**
 * One intent that did not survive the gate, paired with the decision that
 * refused it.
 *
 * A PAIR, NOT TWO PARALLEL ARRAYS. The caller used to reconcile a list of refused
 * signal ids against a list of decisions by `requestId.includes(signalId)` —
 * `'sig-1'` matched `'dispatch:sig-10:…'`, and a refusal that matched nothing was
 * dropped entirely, so the caller could never surface it.
 */
export interface RefusedIntent {
  signalId: string;
  /** Absent only when no decision was possible — an intent whose signal is unreadable. */
  decision?: DisclosureDecision;
}

/** What a touchpoint decision produced: what may go, and what was refused. */
export interface TouchpointDisclosure {
  /** Absent when nothing survived — an empty touchpoint must not be dispatched. */
  touchpoint?: DisclosedTouchpoint;
  decisions: readonly DisclosureDecision[];
  refused: readonly RefusedIntent[];
}

/**
 * Decide a composed touchpoint intent by intent, and strip what is refused.
 *
 * WHY STRIP RATHER THAN DENY THE WHOLE TOUCHPOINT. Denying the bundle would
 * withhold a member's diabetes care gap and missed-appointment follow-up because
 * they also have a substance-use record — adverse treatment on the basis of a
 * Part 2 record, and a control whose failure mode is "contact nobody" is a
 * control that gets switched off. Stripping is safe here because the composer
 * models intents as independent content units ordered by priority, with no
 * cross-intent narrative. THE DAY THAT CHANGES, THIS DECISION MUST BE REVISITED.
 *
 * WHAT THE RECIPIENT SEES. The permitted intents, and nothing else — no count,
 * no marker, no placeholder. A "1 item withheld" chip on an identified member's
 * touchpoint is itself a disclosure that the member has a Part 2 record. The
 * withheld set goes to the orchestration and to the ledger, both privileged
 * reads, never to the agent.
 *
 * `touchpointId` is deliberately preserved: the outreach agent's send-once guard
 * is keyed on it, so minting a new id would let a republish re-send.
 */
export function decideTouchpointDisclosure(
  touchpoint: Touchpoint,
  agentId: string,
  signalsById: ReadonlyMap<string, Signal>,
  deps: DisclosureGateDeps
): TouchpointDisclosure {
  const decisions: DisclosureDecision[] = [];
  const refused: RefusedIntent[] = [];
  const kept: Touchpoint['intents'] = [];

  for (const intent of touchpoint.intents) {
    const signal = signalsById.get(intent.signalId);
    if (!signal) {
      // An intent whose signal we cannot read is not decidable, so it is refused
      // — and the refusal carries no decision, which is the honest record.
      refused.push({ signalId: intent.signalId });
      continue;
    }
    const decision = decideDispatchDisclosure(signal, agentId, deps);
    decisions.push(decision);
    if (decision.outcome === 'permit') kept.push(intent);
    else refused.push({ signalId: intent.signalId, decision });
  }

  if (kept.length === 0) return { decisions, refused };
  return {
    // Channel is re-derived from the surviving opener: `Touchpoint.channel` is a
    // denormalised copy of intents[0].channel, so inheriting it would send on the
    // channel the REFUSED intent asked for.
    touchpoint: {
      ...touchpoint,
      channel: kept[0]?.channel ?? touchpoint.channel,
      intents: kept,
    } as DisclosedTouchpoint,
    decisions,
    refused,
  };
}
