// CONTRACT: C-SEAM  // SEAM: memory-recall
/**
 * Cross-run recall — the missing memory type.
 *
 * Working memory is workflow state; episodic memory is the evidence ledger and
 * the closed event stream; semantic memory is the projected knowledge graph.
 * What was missing is RECALL: what did we already try with this member, and what
 * did the reviewer decide last time.
 *
 * INVARIANT: recall reads through the SAME consent scope as everything else — a
 *            memory path that bypasses the lens is a disclosure with extra steps.
 * INVARIANT: recall returns CODES and timestamps only, never free text, so a
 *            prior decision reason cannot be laundered into a proposal payload.
 * INVARIANT: 42 CFR Part 2 material is released only against a VERIFIED consent
 *            record — matching member, unexpired, with a stated purpose. A
 *            non-empty string is not a legal basis.
 * INVARIANT: every Part 2 release is returned marked, so a caller cannot confuse
 *            a disclosed Part 2 record with an ordinary one.
 */
import { SeamError } from './errors';

/** One prior decision about this member, reduced to codes. */
export interface RecalledDecision {
  proposalId: string;
  actionType: string;
  decision: 'approved' | 'rejected';
  /** A reason CODE, never the reviewer's prose. */
  reasonCode: string;
  decidedAtMs: number;
  /** True when this entry derives from a 42 CFR Part 2 protected source. */
  part2Sourced: boolean;
  /** The agent module that produced it — recall breadth is enforced against this. */
  owningModule: string;
}

/**
 * A verified consent basis for releasing Part 2 material. Every field is load
 * bearing: a basis for another member, or an expired one, releases nothing.
 */
export interface Part2Basis {
  consentId: string;
  /** Must equal the scope's memberId. */
  memberId: string;
  purpose: string;
  expiresAtMs: number;
}

/** What a recall call is scoped to. There is no 'everything' scope. */
export interface RecallScope {
  memberId: string;
  consentScope: string;
  /** Restricts recall to the calling agent's own module, or its owning module. */
  breadth: 'self' | 'owning-module';
  /** The caller's module id, compared against each entry's owningModule. */
  callerModule: string;
  part2Basis?: Part2Basis;
}

/** A released entry, carrying whether it was a Part 2 disclosure. */
export interface DisclosedDecision extends RecalledDecision {
  /** True when this entry was released under a Part 2 consent basis. */
  part2Disclosed: boolean;
}

/** The seam. `sinceMs` is an ABSOLUTE bound; recall reads no clock of its own. */
export interface MemoryRecall {
  recall(scope: RecallScope, sinceMs: number, nowMs: number): Promise<readonly DisclosedDecision[]>;
}

/** Is this basis valid for this scope at this instant? Fails closed. */
export function isPart2BasisValid(scope: RecallScope, nowMs: number): boolean {
  const b = scope.part2Basis;
  if (!b) return false;
  if (b.consentId.length === 0 || b.purpose.length === 0) return false;
  if (b.memberId !== scope.memberId) return false;
  return b.expiresAtMs > nowMs;
}

/** Release Part 2 material only against a verified basis, and mark what was released. */
export function applyPart2Filter(
  entries: readonly RecalledDecision[],
  scope: RecallScope,
  nowMs: number
): readonly DisclosedDecision[] {
  const allowed = isPart2BasisValid(scope, nowMs);
  const out: DisclosedDecision[] = [];
  for (const e of entries) {
    if (!e.part2Sourced) {
      out.push({ ...e, part2Disclosed: false });
    } else if (allowed) {
      out.push({ ...e, part2Disclosed: true });
    }
  }
  return out;
}

/** Enforce the declared breadth — a declared dimension that is never read is not a control. */
function withinBreadth(entry: RecalledDecision, scope: RecallScope): boolean {
  return scope.breadth === 'owning-module' ? entry.owningModule === scope.callerModule : true;
}

/** Mock recall over a seeded set, with scope, breadth and Part 2 all enforced. */
export function createSeededRecall(seed: readonly RecalledDecision[]): MemoryRecall {
  return {
    recall(
      scope: RecallScope,
      sinceMs: number,
      nowMs: number
    ): Promise<readonly DisclosedDecision[]> {
      if (!scope.consentScope) {
        return Promise.reject(
          new SeamError('SEAM_NOT_CONFIGURED', scope.memberId, 'recall requires a consent scope')
        );
      }
      const within = seed.filter((e) => e.decidedAtMs >= sinceMs && withinBreadth(e, scope));
      return Promise.resolve(applyPart2Filter(within, scope, nowMs));
    },
  };
}

/** Production recall: refuses until the read-model is configured. */
export function createUnconfiguredRecall(): MemoryRecall {
  return {
    recall(scope: RecallScope): Promise<readonly DisclosedDecision[]> {
      return Promise.reject(
        new SeamError(
          'SEAM_NOT_CONFIGURED',
          scope.memberId,
          'no recall read-model is configured — configure it at deployment; no fallback'
        )
      );
    },
  };
}
