/**
 * stageGovernance — the STRUCTURED per-stage governance gate (actionType / adverse), keyed by
 * StageKey. It mirrors the real `actionType`/`adverse` each flow stage's verdict is built with in
 * e2eFlow, so the interactive what-if can feed the SAME predicate into the SAME `verdict()` and the
 * submission/adverse human-gate holds at every tier. This exists because `FlowStage` does not retain
 * the actionType it was constructed with, and recovering the gate by parsing the display `reason`
 * string is a fail-open seam (a reword would silently drop the gate). Structured + single-sourced +
 * test-pinned instead. PURE + CLIENT-SAFE (type-only import).
 */
import type { StageKey } from '@/lib/goldenThread/e2eFlow';

export interface StageGate {
  actionType: string;
  adverse: boolean;
}

/**
 * The gated MAIN-FLOW stages. `pas-submit` is an X12 278 payer-facing submission; `recovery` is an
 * appeal submission — both human-gated regardless of earned rung. Every other main-flow stage carries
 * no outbound (actionType ''), so its authority floats with the interlock. A drift test
 * (opsEnhancements.test.ts) asserts this reproduces each stage's real sealed `requiresHuman`.
 */
const STAGE_ACTION: Partial<Record<StageKey, StageGate>> = {
  'pas-submit': { actionType: 'x12-278', adverse: false },
  recovery: { actionType: 'appeal', adverse: false },
};

export function stageGate(key: StageKey): StageGate {
  return STAGE_ACTION[key] ?? { actionType: '', adverse: false };
}
