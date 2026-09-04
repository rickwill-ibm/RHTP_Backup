// wpcGraph/types.ts — re-exports the shared graph types from the golden source.
// All consumers import from here so the golden file is never bypassed.

export type {
  GraphNode,
  GraphEdge,
  LensType,
  NodeType,
  ActiveSignal,
  EdgeProperties,
} from '@/lib/wholePersonGraphData';

export interface WpcGraphResult {
  nodes: import('@/lib/wholePersonGraphData').GraphNode[];
  edges: import('@/lib/wholePersonGraphData').GraphEdge[];
  /** True only when citizenId could not be resolved — caller should show an empty state. */
  isEmpty: boolean;
}
