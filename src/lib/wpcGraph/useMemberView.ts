'use client';
// src/lib/wpcGraph/useMemberView.ts
// Wave 0 — the ONE canonical member-view access pattern. A screen calls this to
// become member-derived: it returns the active member id, the persona, and the
// whole-person graph in a single call, all keyed off the same active-member source
// of truth. Screens should stop reading demoStore / hardcoding Maria directly and
// consume this instead — that is how a screen "converts" in the de-hardcoding waves.

import { useActiveCitizen } from '@/uhg/store/useActiveCitizen';
import { useWholePersonGraph } from './useWholePersonGraph';
import { personaFor } from '@/uhg/data/persona';

export function useMemberView(citizenIdOverride?: string) {
  const { activeCitizenId, setActiveCitizen } = useActiveCitizen();
  const memberId = citizenIdOverride ?? activeCitizenId;
  const persona = personaFor(memberId);
  const graph = useWholePersonGraph(memberId);
  return {
    memberId,
    setMember: setActiveCitizen,
    persona,
    nodes: graph.nodes,
    edges: graph.edges,
    isEmpty: graph.isEmpty,
  };
}
