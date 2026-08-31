/**
 * Authoring workflow stage-flow — the pure state machine behind the DTR Authoring workbench's
 * staged UI (Ingest → Review → Sign-off → Generate → Promote).
 *
 * It does NOT re-implement review gating or maker/checker separation; it ORCHESTRATES the existing
 * tested modules: review completion comes from `reviewProgress` (encodingReview) and the sign-off
 * gate is `applyTransition` (lifecycle — which fails closed on self-approval). This module only
 * decides which stage is reachable and how the stepper renders. Pure, deterministic, framework-free.
 *
 * FAIL-CLOSED INVARIANT: `generate` and `promote` are locked until the checker has approved — the
 * DTR/CRD artifacts can never be built from unreviewed criteria.
 */
import {
  applyTransition,
  TransitionError,
  type PolicyWorkflowRecord,
} from '@/lib/policy/workflow/lifecycle';

export type WorkbenchStage = 'ingest' | 'review' | 'signoff' | 'generate' | 'promote';

export const STAGE_ORDER: readonly WorkbenchStage[] = [
  'ingest',
  'review',
  'signoff',
  'generate',
  'promote',
] as const;

export interface StageMeta {
  stage: WorkbenchStage;
  index: number;
  title: string;
  blurb: string;
}

export const STAGES: readonly StageMeta[] = [
  { stage: 'ingest', index: 0, title: 'Ingest', blurb: 'upload · detect format' },
  { stage: 'review', index: 1, title: 'Extract & Encode', blurb: 'review criteria + codes' },
  { stage: 'signoff', index: 2, title: 'Maker → Checker', blurb: 'two-person sign-off' },
  { stage: 'generate', index: 3, title: 'Generate CRD + DTR', blurb: 'two sibling artifacts' },
  { stage: 'promote', index: 4, title: 'Promote', blurb: 'version · go live' },
] as const;

export type StageStatus = 'done' | 'active' | 'todo' | 'locked';

/** The observable facts the flow reads — each sourced from an existing tested module or the review. */
export interface WorkbenchState {
  /** A document is ingested and has something to promote (PolicyReview.promotable). */
  hasPromotableDoc: boolean;
  /** The maker has submitted for approval (lifecycle status past in-review). */
  submitted: boolean;
  /** The checker has approved (lifecycle status 'approved' or 'published'). */
  approved: boolean;
  /** Promoted/published to the tenant. */
  promoted: boolean;
}

export function stageIndex(stage: WorkbenchStage): number {
  return STAGE_ORDER.indexOf(stage);
}

/**
 * Whether a stage is reachable. FAIL-CLOSED at the generation gate: `generate` and `promote` are
 * locked until the checker has approved. `review` requires a promotable document; `signoff` also
 * requires the maker to have submitted (so the checker can never approve an un-submitted encoding).
 */
export function isStageUnlocked(state: WorkbenchState, stage: WorkbenchStage): boolean {
  switch (stage) {
    case 'ingest':
      return true;
    case 'review':
      return state.hasPromotableDoc;
    case 'signoff':
      // Fail-closed: the checker can only approve a maker-SUBMITTED encoding. Locked until the maker
      // has submitted (from the review Submit action), so the stepper cannot skip the submit and
      // drive an illegal in-review → approved transition. Mirrors generate/promote-until-approved.
      return state.hasPromotableDoc && state.submitted;
    case 'generate':
    case 'promote':
      // Fail-closed: approval already implies a reviewed document, but require BOTH so an
      // inconsistent {approved:true, hasPromotableDoc:false} can never unlock generation.
      return state.approved && state.hasPromotableDoc;
  }
}

function isStageComplete(state: WorkbenchState, stage: WorkbenchStage): boolean {
  switch (stage) {
    case 'ingest':
      return state.hasPromotableDoc;
    case 'review':
      return state.submitted;
    case 'signoff':
      return state.approved;
    case 'generate':
    case 'promote':
      return state.promoted;
  }
}

/** The stepper cell status for `stage` given the active stage. Active wins; locked beats todo/done. */
export function stageStatus(
  state: WorkbenchState,
  stage: WorkbenchStage,
  active: WorkbenchStage
): StageStatus {
  if (stage === active) return 'active';
  if (!isStageUnlocked(state, stage)) return 'locked';
  if (isStageComplete(state, stage)) return 'done';
  return 'todo';
}

/** The furthest-right stage currently unlocked — where a resumed session should land. */
export function furthestUnlocked(state: WorkbenchState): WorkbenchStage {
  let result: WorkbenchStage = 'ingest';
  for (const stage of STAGE_ORDER) {
    if (isStageUnlocked(state, stage)) result = stage;
  }
  return result;
}

/**
 * Resolve the stage the UI should actually show: the requested stage if unlocked, otherwise the
 * furthest unlocked stage — so a locked stage is never rendered as active (e.g. after a Reset).
 */
export function resolveActiveStage(
  state: WorkbenchState,
  requested: WorkbenchStage
): WorkbenchStage {
  return isStageUnlocked(state, requested) ? requested : furthestUnlocked(state);
}

/* ---- Sign-off wrappers over the lifecycle gate (so the React shell holds no try/catch) ---- */

export interface SignoffResult {
  record: PolicyWorkflowRecord;
  error: string | null;
}

/** Maker submits the reviewed encoding for approval (in-review → ready-for-approval). */
export function makerSubmit(record: PolicyWorkflowRecord, makerRef: string): SignoffResult {
  try {
    return {
      record: applyTransition(record, 'ready-for-approval', 'maker', makerRef),
      error: null,
    };
  } catch (err) {
    return { record, error: err instanceof TransitionError ? err.message : String(err) };
  }
}

/**
 * Checker approves (ready-for-approval → approved). Reuses the lifecycle's fail-closed maker/checker
 * separation: an approver equal to the submitter (or no submitter on record) is refused here too.
 */
export function checkerApprove(record: PolicyWorkflowRecord, checkerRef: string): SignoffResult {
  try {
    return { record: applyTransition(record, 'approved', 'checker', checkerRef), error: null };
  } catch (err) {
    return { record, error: err instanceof TransitionError ? err.message : String(err) };
  }
}

/** Derive the boolean gate inputs from a workflow record (for {@link WorkbenchState}). */
export function approvalFromRecord(record: PolicyWorkflowRecord): {
  submitted: boolean;
  approved: boolean;
  promoted: boolean;
} {
  const submitted =
    record.status === 'ready-for-approval' ||
    record.status === 'approved' ||
    record.status === 'published';
  const approved = record.status === 'approved' || record.status === 'published';
  const promoted = record.status === 'published';
  return { submitted, approved, promoted };
}
