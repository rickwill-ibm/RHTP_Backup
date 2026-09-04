'use client';
// wpcGraph/useWholePersonGraph.ts — React hook wrapping buildWholePersonGraph.
// Subscribes to demoStore.activeCitizenId and re-derives the graph on patient change.
// This is the only hook — it is the entry point for page-level consumption.

import { useMemo } from 'react';
import { useDemoStore } from '@/uhg/store/demoStore';
import { buildWholePersonGraph } from './builder';
import type { WpcGraphResult } from './types';

/**
 * Returns the whole-person graph for the currently active citizen.
 * Re-derives whenever the demo store's activeCitizenId changes.
 * Pure — no side effects, no fetches.
 */
export function useWholePersonGraph(citizenIdOverride?: string): WpcGraphResult {
  const storeId = useDemoStore((s) => s.activeCitizenId);
  const citizenId = citizenIdOverride ?? storeId;
  return useMemo(() => buildWholePersonGraph(citizenId), [citizenId]);
}
