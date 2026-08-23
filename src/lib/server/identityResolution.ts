import * as clock from '@/lib/clock'; // deterministic time/rng seam (test setters: setClock/setRng)
/**
 * Server-side wrapper: cross-source identity resolution + audit trail
 * (Dev Plan Workstream A3 — "integrate MPI layer with existing $member-match +
 * audit trail").
 *
 * Mirrors the thin-wrapper-around-a-pure-engine pattern already used by
 * memberMatch.ts: the actual matching logic (lib/identity/resolveIdentity.ts) is
 * pure and unit-tested; this module is the server-only seam that emits a
 * PHI-free AuditEvent for every resolution attempt, matching the same
 * "references, codes, and determinations only" principle as the Evidence Record.
 *
 * Complementary to $member-match, not a replacement for it: this layer reconciles
 * identity across EMR, payer, and state-agency sources; $member-match then confirms
 * identity against a specific payer's FHIR server for a given transaction.
 */
import { audit } from './audit';
import { newCorrelationId } from './correlation';
import { resolveIdentity } from '@/lib/identity/resolveIdentity';
import { mockIdentitySource } from '@/lib/identity/identitySource';
import type { IdentityTraits, ResolvedIdentity, SourceSystem } from '@/lib/identity/mpiTypes';

export async function resolveIdentityWithAudit(
  input: IdentityTraits,
  originSystem: SourceSystem,
  ctx: { actor: string; correlationId?: string }
): Promise<ResolvedIdentity> {
  const correlationId = ctx.correlationId ?? newCorrelationId();
  const result = resolveIdentity(input, originSystem, mockIdentitySource);

  await audit({
    ts: clock.nowIso(),
    actor: ctx.actor,
    action: 'identity-resolution',
    resourceRef: result.resolvedId ? `mpi/${result.resolvedId}` : undefined,
    correlationId,
    outcome:
      result.bestMatch.tier === 'deterministic' || result.bestMatch.tier === 'probabilistic-auto'
        ? 'success'
        : 'failure',
    detail: result.auditSummary,
  });

  return result;
}
