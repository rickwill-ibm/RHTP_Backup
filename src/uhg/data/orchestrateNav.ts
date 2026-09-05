// orchestrateNav.ts — per-patient keyboard-navigation resolvers for the demo.
//
// Pure, side-effect-free navigation math extracted from PresenterControls so the
// component stays within the file-size cap (AI-CODING-CONVENTIONS §2-3). Both
// helpers drop any conditional beat that doesn't apply to the selected patient
// (Family without a dependent, Caregiver without a care recipient, any future
// household beat) so arrow / up-down nav never lands on an inapplicable screen.

import { SCREEN_ORDER, SCREEN_ROUTES, ORCHESTRATE_FLOW, orchestrateIndexFor } from '@/uhg/store/demoStore';
import { beatApplies } from './demoNarrative';

export type OrchestrateNavResult =
  | { kind: 'not-orchestrate' } // current screen isn't on the orchestrate flow — let legacy nav handle it
  | { kind: 'handled' } // on the flow, but at an edge / nothing applicable — handled as a no-op
  | { kind: 'navigate'; route: string }; // navigate to this route

/**
 * Resolve the Up/Down target across the Agentic Orchestrate flow for the selected
 * patient. The current screen is recognised against the UNFILTERED flow, so a beat
 * filtered out for this patient is still treated as "on the flow" (and doesn't wrongly
 * fall through to the legacy SCREEN_ORDER stepper). A current screen that was itself
 * filtered out resolves to the nearest applicable step in the original order.
 */
export function resolveOrchestrateTarget(
  pathname: string | null | undefined,
  citizenId: string,
  dir: 1 | -1
): OrchestrateNavResult {
  const flow = ORCHESTRATE_FLOW.filter((s) => beatApplies(s.route, citizenId));
  const rawIdx = orchestrateIndexFor(pathname);
  if (rawIdx === -1) return { kind: 'not-orchestrate' };
  if (flow.length === 0) return { kind: 'handled' };

  const idx = flow.findIndex((s) => pathname === s.route || (!!pathname && pathname.endsWith(s.route)));
  let target: number;
  if (idx === -1) {
    // `insertPos` is where the dropped screen would sit in the filtered flow
    // (count of applicable steps before it).
    const insertPos = ORCHESTRATE_FLOW.slice(0, rawIdx).filter((s) => beatApplies(s.route, citizenId)).length;
    target = dir === 1 ? insertPos : insertPos - 1;
  } else {
    target = idx + dir;
  }
  if (target < 0 || target >= flow.length) return { kind: 'handled' };
  return { kind: 'navigate', route: flow[target].route };
}

/**
 * Nearest SCREEN_ORDER index in `dir` whose beat applies to the selected patient,
 * skipping any that don't. Returns -1 at the edge. The scan begins at the neighbour
 * and never returns `fromIndex` itself, so a filtered-out current screen still
 * resolves to the nearest applicable step.
 */
export function nextApplicableScreenIndex(fromIndex: number, dir: 1 | -1, citizenId: string): number {
  for (let i = fromIndex + dir; i >= 0 && i < SCREEN_ORDER.length; i += dir) {
    if (beatApplies(SCREEN_ROUTES[SCREEN_ORDER[i]], citizenId)) return i;
  }
  return -1;
}
