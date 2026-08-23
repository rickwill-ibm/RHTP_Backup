// CONTRACT: C10  // DP-1  // F5 claims integrity
/**
 * Claims GOLDEN-THREAD integrity guard.
 *
 * The financial chain is Claim <-ADJUDICATED_BY- ClaimResponse <-EXPLAINED_BY- EOB.
 * Its head is the Claim: an adjudication or an explanation only makes sense hanging
 * off a Claim that actually exists. A ClaimResponse whose Claim node is ABSENT (the
 * claim.submitted never arrived, or arrived out of band) must NOT project an
 * ADJUDICATED_BY / EXPLAINED_BY edge into a non-existent node. A dangling edge is a
 * silent integrity break: the graph would assert an adjudication of a claim it has
 * no record of.
 *
 * So instead of dangling, the orphan is HELD. This reuses the dead-letter store (the
 * same durable, PHI-safe, append-only home quarantine/held-identity/failed-outbox
 * already use), so an operator can see the held adjudication and resolve it once the
 * missing claim lands. NO edge, NO orphan node is projected for a held record: the
 * graph stays referentially whole.
 *
 * Known-claim set: a claim is "present" if its claim.submitted appears earlier in
 * this batch OR it is listed in `opts.knownClaims` (the claim keys already in the
 * store, so a later batch's adjudication of an earlier batch's claim is honored).
 *
 * E9: an orphan is HELD, never dangled and never silently dropped. A missing claim
 * reference cannot fabricate a golden thread.
 */
import type { C2Event } from '@/lib/outbox';
import type { DeadLetterAppendInput, DeadLetterRecord, DeadLetterStore } from '@/lib/deadLetter';
import { getDeadLetterStore } from '@/lib/deadLetter';
import type { Mutation, ProjectorDeps } from '../types';
import { claimsFinancialSpec } from './claimsFinancial';

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

/** The outcome of an integrity-guarded claims projection. */
export interface ClaimsIntegrityResult {
  /** Safe mutations to apply. Contains NO dangling edge into an absent Claim. */
  mutations: Mutation[];
  /** Orphan adjudications / explanations to persist to the dead-letter store. */
  held: DeadLetterAppendInput[];
}

/** Options: pre-existing claim keys already present in the store (prior batches). */
export interface ClaimsIntegrityOptions {
  knownClaims?: Iterable<string>;
}

/** The dead-letter input for one orphan adjudication / explanation (PHI-safe). */
function heldFor(event: C2Event, claimRef: string): DeadLetterAppendInput {
  const p = event.payload;
  const isResponse = event.eventType === 'claim.adjudicated';
  const sourceRef = isResponse
    ? str(p.responseRef, `ClaimResponse/${event.memberId}`)
    : str(p.eobRef, `ExplanationOfBenefit/${event.memberId}`);
  return {
    kind: 'quarantine',
    memberRef: event.memberId,
    reasonCode: isResponse ? 'orphan-claim-response' : 'orphan-claim-explanation',
    sourceRef,
    // PHI-safe: which Claim reference was absent, so an operator can chase it.
    payloadRef: `claims-financial/orphan-claim/${claimRef || 'unreferenced'}`,
  };
}

/**
 * Project a batch of claim events with golden-thread integrity. An adjudication or
 * explanation whose Claim is not present (this batch or `knownClaims`) is HELD
 * instead of projecting a dangling edge; every other event projects normally.
 * Deterministic and pure (no store I/O); persistence is the caller's step via
 * `holdOrphanClaims`.
 */
export function projectClaimsWithIntegrity(
  events: readonly C2Event[],
  deps: ProjectorDeps,
  opts: ClaimsIntegrityOptions = {},
): ClaimsIntegrityResult {
  const known = new Set(opts.knownClaims ?? []);
  const mutations: Mutation[] = [];
  const held: DeadLetterAppendInput[] = [];

  for (const event of events) {
    const p = event.payload;
    if (event.eventType === 'claim.submitted') {
      known.add(str(p.claimRef, `Claim/${event.memberId}`));
      mutations.push(...claimsFinancialSpec.toMutations(event, deps));
    } else if (event.eventType === 'claim.adjudicated' || event.eventType === 'claim.explained') {
      const claimRef = str(p.claimRef);
      if (claimRef && known.has(claimRef)) {
        mutations.push(...claimsFinancialSpec.toMutations(event, deps));
      } else {
        held.push(heldFor(event, claimRef));
      }
    } else if (claimsFinancialSpec.matches(event.eventType)) {
      mutations.push(...claimsFinancialSpec.toMutations(event, deps));
    }
  }
  return { mutations, held };
}

/**
 * Persist held orphan claims to the dead-letter store (reusing the NS-01 seam).
 * Returns the stored records. Append is idempotent by the store's deterministic id.
 */
export async function holdOrphanClaims(
  held: readonly DeadLetterAppendInput[],
  store: DeadLetterStore = getDeadLetterStore(),
): Promise<DeadLetterRecord[]> {
  const out: DeadLetterRecord[] = [];
  for (const input of held) out.push(await store.append(input));
  return out;
}
