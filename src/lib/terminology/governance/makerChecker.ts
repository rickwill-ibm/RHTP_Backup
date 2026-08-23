/**
 * Maker-checker separation-of-duties — the SINGLE decision predicate
 * (I8A-iii Wave D convergence).
 *
 * ONE implementation of the separation-of-duties rule, shared by every layer:
 *  - the backend service (service.approve) throws MakerCheckerViolationError on
 *    a non-ok decision;
 *  - the admin console approval gate renders the control DISABLED on a non-ok
 *    decision (and re-checks before acting);
 *  - the BFF approve boundary + its mock backend return 403 on a non-ok decision.
 *
 * Before Wave D each layer inlined its own copy of the rule (three subtly
 * different implementations); this collapses them to one so the rule cannot
 * drift between the UI, the routes, and the engine. PHI-free (ids/roles only).
 */
import type { ApprovalMode, GovernanceRole } from './types';

export interface MakerCheckerParams {
  approvalMode: ApprovalMode;
  /** The MAKER: principal id that submitted the version for review (if submitted). */
  submittedBy: string | undefined;
  /** The CHECKER: principal id attempting the approval. */
  approverId: string;
  /** The CHECKER's governance role (null when the actor holds no governance role). */
  approverRole: GovernanceRole | null;
}

export interface MakerCheckerDecision {
  ok: boolean;
  reasonCode?: 'self-approval' | 'not-a-reviewer';
  detail?: string;
}

/**
 * Evaluate separation of duties for an approval. Under `single-approver` the
 * check is relaxed (ok). Under `maker-checker` (the enforced default): only a
 * `value-set-reviewer` may approve (else `not-a-reviewer`), and the principal who
 * submitted the version may never approve it (else `self-approval`).
 */
export function evaluateMakerChecker(params: MakerCheckerParams): MakerCheckerDecision {
  if (params.approvalMode !== 'maker-checker') return { ok: true };

  if (params.approverRole !== 'value-set-reviewer') {
    return {
      ok: false,
      reasonCode: 'not-a-reviewer',
      detail: `role '${params.approverRole ?? 'none'}' may not approve under maker-checker`,
    };
  }
  if (params.submittedBy && params.submittedBy === params.approverId) {
    return {
      ok: false,
      reasonCode: 'self-approval',
      detail: 'the principal who submitted a version may not approve it',
    };
  }
  return { ok: true };
}
