import { describe, expect, it } from 'vitest';
import {
  createValueSetGovernanceService,
  createInMemoryValueSetGovernanceStore,
  getValueSetGovernanceStore,
  setProductionValueSetGovernanceStoreFactory,
  ValueSetGovernanceStoreNotConfiguredError,
  replayAgainstVersion,
  nextState,
  canTransition,
  allowedActions,
  IllegalTransitionError,
  MakerCheckerViolationError,
  VersionNotFoundError,
  type GovernancePrincipal,
} from '@/lib/terminology/governance';
import {
  setSessionDataMode,
  clearSessionDataModes,
} from '@/lib/config/dataMode';

/**
 * I8A-iii Wave A (B2 value-set governance). Proves: guarded lifecycle, ENFORCED
 * maker-checker separation of duties (configurable to single-approver), an
 * immutable PHI-free transition audit, the one-active-version invariant, and
 * chosen-version replay (E9: an unapproved/rejected version never becomes active;
 * replay never falls back to the current version).
 *
 * Deterministic: a fixed clock is injected into every service.
 */

// A monotonic fixed clock so transition timestamps are deterministic + ordered.
function fixedClock(startIso = '2026-06-01T00:00:00Z'): () => Date {
  let t = new Date(startIso).getTime();
  return () => {
    const d = new Date(t);
    t += 1000;
    return d;
  };
}

const STEWARD: GovernancePrincipal = { userId: 'user:steward-a', role: 'value-set-steward' };
const REVIEWER: GovernancePrincipal = { userId: 'user:reviewer-b', role: 'value-set-reviewer' };

function newService(config?: { approvalMode: 'maker-checker' | 'single-approver' }) {
  return createValueSetGovernanceService({
    store: createInMemoryValueSetGovernanceStore(),
    now: fixedClock(),
    config,
  });
}

// ── state machine: guarded transitions ──────────────────────────────────────────
describe('lifecycle state machine: guarded transitions', () => {
  it('permits only the declared edges out of each state', () => {
    expect(nextState('draft', 'submit')).toBe('in-review');
    expect(nextState('in-review', 'approve')).toBe('approved');
    expect(nextState('in-review', 'reject')).toBe('rejected');
    expect(nextState('approved', 'retire')).toBe('retired');
    expect(nextState('approved', 'supersede')).toBe('superseded');
    expect(canTransition('draft', 'approve')).toBe(false);
    expect(allowedActions('rejected')).toEqual([]);
  });

  it('throws IllegalTransitionError on an illegal edge (draft cannot jump to approved)', () => {
    expect(() => nextState('draft', 'approve')).toThrow(IllegalTransitionError);
    expect(() => nextState('rejected', 'approve')).toThrow(IllegalTransitionError);
    expect(() => nextState('superseded', 'retire')).toThrow(IllegalTransitionError);
  });
});

// ── happy path: draft -> in-review -> approved ───────────────────────────────────
describe('lifecycle: a version moves draft -> in-review -> approved(active)', () => {
  it('the approved version becomes the single active version', () => {
    const svc = newService();
    svc.createDraft({ valueSetId: 'vs:sdoh', version: 'v1', createdBy: STEWARD.userId });
    expect(svc.activeVersion('vs:sdoh')).toBeUndefined();

    svc.submitForReview('vs:sdoh', 'v1', STEWARD);
    expect(svc.activeVersion('vs:sdoh')).toBeUndefined(); // in-review is not active

    const approved = svc.approve('vs:sdoh', 'v1', REVIEWER, 'looks good');
    expect(approved.state).toBe('approved');
    expect(svc.activeVersion('vs:sdoh')?.version).toBe('v1');
    expect(approved.submittedBy).toBe(STEWARD.userId);
    expect(approved.decidedBy).toBe(REVIEWER.userId);
  });

  it('the service rejects an unknown version', () => {
    const svc = newService();
    expect(() => svc.submitForReview('vs:x', 'nope', STEWARD)).toThrow(VersionNotFoundError);
  });

  it('an illegal transition through the service throws (approve a draft directly)', () => {
    const svc = newService();
    svc.createDraft({ valueSetId: 'vs:sdoh', version: 'v1', createdBy: STEWARD.userId });
    // Never submitted -> still draft; approve is not a legal edge from draft.
    expect(() => svc.approve('vs:sdoh', 'v1', REVIEWER)).toThrow(IllegalTransitionError);
    // E9: the version did not become active.
    expect(svc.activeVersion('vs:sdoh')).toBeUndefined();
  });
});

// ── maker-checker (ENFORCED) ─────────────────────────────────────────────────────
describe('maker-checker: separation of duties is enforced, not advisory', () => {
  it('the submitter (maker) cannot approve their own version under maker-checker', () => {
    const svc = newService(); // default maker-checker
    svc.createDraft({ valueSetId: 'vs:hcc', version: 'V28', createdBy: REVIEWER.userId });
    // The reviewer here acts as the MAKER (submits). Then tries to self-approve.
    svc.submitForReview('vs:hcc', 'V28', REVIEWER);
    expect(() => svc.approve('vs:hcc', 'V28', REVIEWER)).toThrow(MakerCheckerViolationError);
    // E9: the self-approval attempt did NOT make it active.
    expect(svc.activeVersion('vs:hcc')).toBeUndefined();
  });

  it('a non-reviewer role cannot approve under maker-checker', () => {
    const svc = newService();
    svc.createDraft({ valueSetId: 'vs:hcc', version: 'V28', createdBy: STEWARD.userId });
    svc.submitForReview('vs:hcc', 'V28', STEWARD);
    const anotherSteward: GovernancePrincipal = { userId: 'user:steward-c', role: 'value-set-steward' };
    expect(() => svc.approve('vs:hcc', 'V28', anotherSteward)).toThrow(MakerCheckerViolationError);
  });

  it('a DIFFERENT reviewer (checker) can approve a version the steward submitted', () => {
    const svc = newService();
    svc.createDraft({ valueSetId: 'vs:hcc', version: 'V28', createdBy: STEWARD.userId });
    svc.submitForReview('vs:hcc', 'V28', STEWARD);
    const approved = svc.approve('vs:hcc', 'V28', REVIEWER);
    expect(approved.state).toBe('approved');
    expect(svc.activeVersion('vs:hcc')?.version).toBe('V28');
  });
});

// ── single-approver (configurable) ───────────────────────────────────────────────
describe('single-approver: configurable, the submitter may approve', () => {
  it('the same principal may submit and approve when approvalMode=single-approver', () => {
    const svc = newService({ approvalMode: 'single-approver' });
    expect(svc.approvalMode).toBe('single-approver');
    svc.createDraft({ valueSetId: 'vs:solo', version: 'v1', createdBy: STEWARD.userId });
    svc.submitForReview('vs:solo', 'v1', STEWARD);
    const approved = svc.approve('vs:solo', 'v1', STEWARD); // self-approval allowed here
    expect(approved.state).toBe('approved');
    expect(svc.activeVersion('vs:solo')?.version).toBe('v1');
  });
});

// ── one-active-version invariant ─────────────────────────────────────────────────
describe('one active version: approving a new version supersedes the prior active', () => {
  it('supersedes the prior active and keeps exactly one active version', () => {
    const svc = newService();
    // v1 approved and active.
    svc.createDraft({ valueSetId: 'vs:icd', version: 'FY2025', createdBy: STEWARD.userId });
    svc.submitForReview('vs:icd', 'FY2025', STEWARD);
    svc.approve('vs:icd', 'FY2025', REVIEWER);
    expect(svc.activeVersion('vs:icd')?.version).toBe('FY2025');

    // v2 approved -> v1 auto-superseded.
    svc.createDraft({ valueSetId: 'vs:icd', version: 'FY2026', createdBy: STEWARD.userId });
    svc.submitForReview('vs:icd', 'FY2026', STEWARD);
    svc.approve('vs:icd', 'FY2026', REVIEWER);

    expect(svc.activeVersion('vs:icd')?.version).toBe('FY2026');
    const versions = svc.listVersions('vs:icd');
    const active = versions.filter((v) => v.state === 'approved');
    expect(active).toHaveLength(1);
    expect(versions.find((v) => v.version === 'FY2025')?.state).toBe('superseded');

    // The supersede is a recorded, system-attributed transition.
    const supersede = svc.history({ valueSetId: 'vs:icd', version: 'FY2025' })
      .find((e) => e.action === 'supersede');
    expect(supersede).toMatchObject({ from: 'approved', to: 'superseded', principalRole: 'system' });
  });
});

// ── immutable audit ledger ───────────────────────────────────────────────────────
describe('traceability: every transition is appended to an immutable, PHI-free audit', () => {
  it('records every transition with principal, from->to, reason, and timestamp', () => {
    const svc = newService();
    svc.createDraft({ valueSetId: 'vs:q', version: 'v1', createdBy: STEWARD.userId });
    svc.submitForReview('vs:q', 'v1', STEWARD, 'ready for review');
    svc.approve('vs:q', 'v1', REVIEWER, 'approved by committee');

    const hist = svc.history({ valueSetId: 'vs:q' });
    expect(hist.map((e) => e.action)).toEqual(['submit', 'approve']);
    expect(hist[0]).toMatchObject({
      from: 'draft',
      to: 'in-review',
      principalId: STEWARD.userId,
      principalRole: 'value-set-steward',
      reason: 'ready for review',
    });
    expect(hist[1]).toMatchObject({
      from: 'in-review',
      to: 'approved',
      principalId: REVIEWER.userId,
      reason: 'approved by committee',
    });
    // monotonic seq + ISO timestamps present.
    expect(hist[0].seq).toBeLessThan(hist[1].seq);
    expect(hist[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('the returned history is a copy: mutating it does not corrupt the ledger', () => {
    const svc = newService();
    svc.createDraft({ valueSetId: 'vs:q', version: 'v1', createdBy: STEWARD.userId });
    svc.submitForReview('vs:q', 'v1', STEWARD);
    const first = svc.history();
    first.length = 0;
    (first as unknown[]).push({ tampered: true });
    // A fresh read is unaffected by the caller mutation.
    expect(svc.history({ valueSetId: 'vs:q' })).toHaveLength(1);
  });

  it('the audit carries no member/clinical PHI (ids, versions, states only)', () => {
    const svc = newService();
    svc.createDraft({ valueSetId: 'vs:q', version: 'v1', createdBy: STEWARD.userId });
    svc.submitForReview('vs:q', 'v1', STEWARD);
    svc.reject('vs:q', 'v1', REVIEWER, 'out of scope');
    const blob = JSON.stringify(svc.history());
    expect(blob).not.toMatch(/patient|member|mrn|ssn|dob/i);
  });
});

// ── chosen-version replay (E9) ───────────────────────────────────────────────────
describe('replay: a past adjudication reproduces against the CHOSEN version', () => {
  it('binds the chosen historical version, not the current one', () => {
    // R51 is retired in the CURRENT ICD-10-CM version (FY2026) but a member of FY2025.
    const historical = replayAgainstVersion({ system: 'ICD-10-CM', code: 'R51', version: 'FY2025' });
    expect(historical).toMatchObject({
      valid: true,
      status: 'valid',
      boundVersion: 'FY2025',
      reproduced: true,
    });

    // Against the current version the same code is NOT a member.
    const current = replayAgainstVersion({ system: 'ICD-10-CM', code: 'R51', version: 'FY2026' });
    expect(current.valid).toBe(false);
  });

  it('is reachable through the service replay API', () => {
    const svc = newService();
    const res = svc.replay({ system: 'HCC', code: 'HCC58', version: 'V24' });
    expect(res).toMatchObject({ valid: true, boundVersion: 'V24', reproduced: true });
  });

  it('E9: an unmodeled version does NOT fall back to current (not reproduced)', () => {
    const res = replayAgainstVersion({ system: 'ICD-10-CM', code: 'E11.9', version: 'FY1999' });
    expect(res).toMatchObject({ reproduced: false, status: 'version-not-modeled', boundVersion: null });
    expect(res.valid).toBe(false);
  });

  it('an ungoverned system is unsupported (never fabricated)', () => {
    const res = replayAgainstVersion({ system: 'NOT-A-SYSTEM', code: 'x', version: 'v1' });
    expect(res.status).toBe('unsupported-system');
    expect(res.reproduced).toBe(false);
  });
});

// ── retire path ──────────────────────────────────────────────────────────────────
describe('lifecycle: an active version can be retired', () => {
  it('approved -> retired removes it from active and is audited', () => {
    const svc = newService();
    svc.createDraft({ valueSetId: 'vs:r', version: 'v1', createdBy: STEWARD.userId });
    svc.submitForReview('vs:r', 'v1', STEWARD);
    svc.approve('vs:r', 'v1', REVIEWER);
    const retired = svc.retire('vs:r', 'v1', REVIEWER, 'end of life');
    expect(retired.state).toBe('retired');
    expect(svc.activeVersion('vs:r')).toBeUndefined();
    expect(svc.history({ valueSetId: 'vs:r' }).some((e) => e.action === 'retire')).toBe(true);
  });
});

// ── seam: fail-closed in production ──────────────────────────────────────────────
describe('seam: valueSetGovernanceStore is fail-closed in production', () => {
  it('throws in production with no factory, serves in-memory in mock', () => {
    clearSessionDataModes();
    setProductionValueSetGovernanceStoreFactory(null);
    setSessionDataMode('valueSetGovernanceStore', 'production');
    expect(() => getValueSetGovernanceStore()).toThrow(ValueSetGovernanceStoreNotConfiguredError);
    setSessionDataMode('valueSetGovernanceStore', 'mock');
    expect(getValueSetGovernanceStore()).toBeTruthy();
    clearSessionDataModes();
    setProductionValueSetGovernanceStoreFactory(null);
  });
});
