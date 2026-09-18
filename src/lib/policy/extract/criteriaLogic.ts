/**
 * Shared AND/OR display rule for a nested criteria tree — SINGLE SOURCE for every place that shows a
 * `CriteriaGroup`/`CriterionNode` tree to a human (the authoring review panel, the patient-match
 * reference view). Mirrors the ONE deterministic rule the real DTR generator uses
 * (`criteriaNormalize.ts`): a group's top-level criteria are AND'd only when its heading says "all of
 * the following" (`group.logic === 'all'`); everything else — including any node's own children —
 * defaults to OR ("alternatives") unless that node's own text says "all of the following"
 * (`logicOf(node.text) === 'all'`). Reusing `logicOf` keeps every preview identical to what the DTR is
 * actually generated from.
 */
import type { CriteriaGroup, CriterionNode } from './criteria';
import { logicOf } from './criteriaParse';

export type CriteriaLogic = 'AND' | 'OR';

export function groupLogic(g: CriteriaGroup): CriteriaLogic {
  return g.logic === 'all' ? 'AND' : 'OR';
}

export function childLogic(node: CriterionNode): CriteriaLogic {
  return logicOf(node.text) === 'all' ? 'AND' : 'OR';
}

export function logicTone(logic: CriteriaLogic): string {
  return logic === 'AND' ? 'bg-teal-100 text-teal-800' : 'bg-purple-100 text-purple-800';
}
