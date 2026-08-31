/**
 * Stage-flow gating tests. Central invariant: generation and promotion are FAIL-CLOSED behind
 * checker approval, and the sign-off wrappers inherit the lifecycle's maker/checker separation.
 */
import { describe, it, expect } from 'vitest';
import {
  STAGE_ORDER,
  STAGES,
  isStageUnlocked,
  stageStatus,
  furthestUnlocked,
  resolveActiveStage,
  makerSubmit,
  checkerApprove,
  approvalFromRecord,
  type WorkbenchState,
} from '@/lib/policy/workflow/stageflow';
import type { PolicyWorkflowRecord } from '@/lib/policy/workflow/lifecycle';

const fresh: WorkbenchState = {
  hasPromotableDoc: false,
  submitted: false,
  approved: false,
  promoted: false,
};
const reviewing: WorkbenchState = { ...fresh, hasPromotableDoc: true };
const submittedState: WorkbenchState = { ...reviewing, submitted: true };
const approved: WorkbenchState = {
  hasPromotableDoc: true,
  submitted: true,
  approved: true,
  promoted: false,
};

describe('stageflow — gates', () => {
  it('locks generate + promote until the checker has approved (fail-closed)', () => {
    expect(isStageUnlocked(reviewing, 'generate')).toBe(false);
    expect(isStageUnlocked(reviewing, 'promote')).toBe(false);
    expect(isStageUnlocked(approved, 'generate')).toBe(true);
    expect(isStageUnlocked(approved, 'promote')).toBe(true);
  });
  it('locks review until a promotable document exists; locks signoff until the maker submits', () => {
    expect(isStageUnlocked(fresh, 'ingest')).toBe(true);
    expect(isStageUnlocked(fresh, 'review')).toBe(false);
    expect(isStageUnlocked(reviewing, 'review')).toBe(true);
    // signoff is fail-closed until the maker has submitted — a promotable doc alone is not enough,
    // so the stepper can't skip the submit and drive an illegal in-review → approved transition.
    expect(isStageUnlocked(reviewing, 'signoff')).toBe(false);
    expect(isStageUnlocked(submittedState, 'signoff')).toBe(true);
  });
  it('stageStatus: active wins, locked beats todo, complete shows done', () => {
    expect(stageStatus(reviewing, 'review', 'review')).toBe('active');
    expect(stageStatus(reviewing, 'generate', 'review')).toBe('locked');
    expect(stageStatus(reviewing, 'ingest', 'review')).toBe('done'); // hasPromotableDoc completes ingest
    expect(stageStatus(reviewing, 'signoff', 'review')).toBe('locked'); // locked until submitted
    expect(stageStatus(submittedState, 'signoff', 'signoff')).toBe('active');
  });
  it('resolveActiveStage never returns a locked stage', () => {
    expect(resolveActiveStage(fresh, 'generate')).toBe('ingest');
    expect(resolveActiveStage(reviewing, 'generate')).toBe('review'); // signoff still locked (not submitted)
    expect(resolveActiveStage(submittedState, 'generate')).toBe('signoff'); // furthest unlocked
    expect(resolveActiveStage(approved, 'generate')).toBe('generate');
  });
  it('furthestUnlocked advances with state', () => {
    expect(furthestUnlocked(fresh)).toBe('ingest');
    expect(furthestUnlocked(reviewing)).toBe('review');
    expect(furthestUnlocked(submittedState)).toBe('signoff');
    expect(furthestUnlocked(approved)).toBe('promote');
  });
  it('STAGE_ORDER is the five stages in order', () => {
    expect([...STAGE_ORDER]).toEqual(['ingest', 'review', 'signoff', 'generate', 'promote']);
  });

  // LENS 2 (guards fail closed): an inconsistent state must NEVER unlock generation.
  it('does not unlock generate/promote on approved without a promotable doc', () => {
    const inconsistent: WorkbenchState = {
      hasPromotableDoc: false,
      submitted: true,
      approved: true,
      promoted: false,
    };
    expect(isStageUnlocked(inconsistent, 'generate')).toBe(false);
    expect(isStageUnlocked(inconsistent, 'promote')).toBe(false);
  });

  // LENS 4 (target-contract conformance): STAGES must stay aligned with STAGE_ORDER.
  it('STAGES align with STAGE_ORDER — index === position, stage === order[i]', () => {
    expect(STAGES).toHaveLength(STAGE_ORDER.length);
    STAGES.forEach((meta, i) => {
      expect(meta.index).toBe(i);
      expect(meta.stage).toBe(STAGE_ORDER[i]);
      expect(meta.title.length).toBeGreaterThan(0);
    });
  });
});

describe('stageflow — sign-off wrappers (reuse lifecycle fail-closed)', () => {
  const inReview: PolicyWorkflowRecord = { policyId: 'p', status: 'in-review' };

  it('maker submit then a DIFFERENT checker approves', () => {
    const sub = makerSubmit(inReview, 'Practitioner/maker');
    expect(sub.error).toBeNull();
    expect(sub.record.status).toBe('ready-for-approval');
    const app = checkerApprove(sub.record, 'Practitioner/checker');
    expect(app.error).toBeNull();
    expect(app.record.status).toBe('approved');
  });
  it('refuses self-approval (checker equals maker) — surfaced, not thrown', () => {
    const sub = makerSubmit(inReview, 'Practitioner/same');
    const app = checkerApprove(sub.record, 'Practitioner/same');
    expect(app.record.status).toBe('ready-for-approval'); // unchanged
    expect(app.error).toMatch(/must differ/i);
  });
  it('refuses approval with no submitter on record', () => {
    const app = checkerApprove({ policyId: 'p', status: 'ready-for-approval' }, 'Practitioner/c');
    expect(app.error).toMatch(/no submitter/i);
  });
  // LENS 2: an out-of-order call (approve before submit, resubmit after approval) fails closed —
  // the record is returned unchanged with an error, never a partial/illegal state.
  it('refuses an approve before submit (illegal transition), record unchanged', () => {
    const app = checkerApprove(inReview, 'Practitioner/checker');
    expect(app.record).toEqual(inReview);
    expect(app.error).toMatch(/illegal transition/i);
  });
  it('refuses a maker submit on an already-approved record', () => {
    const app: PolicyWorkflowRecord = {
      policyId: 'p',
      status: 'approved',
      submittedBy: 'Practitioner/m',
    };
    const sub = makerSubmit(app, 'Practitioner/m2');
    expect(sub.record.status).toBe('approved');
    expect(sub.error).toMatch(/illegal transition/i);
  });
  it('approvalFromRecord maps status to gate booleans', () => {
    expect(approvalFromRecord({ policyId: 'p', status: 'in-review' })).toEqual({
      submitted: false,
      approved: false,
      promoted: false,
    });
    expect(approvalFromRecord({ policyId: 'p', status: 'ready-for-approval' }).submitted).toBe(
      true
    );
    expect(approvalFromRecord({ policyId: 'p', status: 'approved' }).approved).toBe(true);
    expect(approvalFromRecord({ policyId: 'p', status: 'published' })).toEqual({
      submitted: true,
      approved: true,
      promoted: true,
    });
  });
});
