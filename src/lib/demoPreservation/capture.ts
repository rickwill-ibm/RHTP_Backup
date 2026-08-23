/**
 * capture.ts — captures the authored DEMO SURFACE as a set of fingerprints.
 *
 * These are the panels a demo operator actually sees: the whole-person graph,
 * the SMART-on-FHIR cards/orders/care-team, the member + provider rosters, the
 * authored HEDIS/STARS/MIPS gap sets (constraint #4 — measures are external, so
 * their MOCK disposition is exactly today's authored gaps), and the seam-mode
 * configuration surface. captureDemoSurface() is pure and deterministic; the
 * demo-preservation test compares it to a committed golden and fails on drift.
 */

import { fingerprintPanel, type PanelFingerprint } from './fingerprint';
import {
  graphNodes,
  graphEdges,
  lensDefinitions,
  activeSignals,
} from '../wholePersonGraphData';
import { mockCdsCards, mockOrderCatalog, mockCareTeamCandidates } from '../smartFhirMockData';
import {
  mockPatients,
  mockProviders,
  mockSTARSMeasures,
  mockHEDISMeasures,
  mockMIPSAdjustments,
} from '../mockData';
import { describeDataModes } from '../config/dataMode';

export interface DemoSurface {
  /** Schema version of the capture shape; bump only on an intentional capture change. */
  version: number;
  panels: PanelFingerprint[];
}

export const DEMO_CAPTURE_VERSION = 1;

/**
 * The authored panels under preservation. Adding a panel here EXPANDS coverage
 * (a new golden entry); it never weakens the gate.
 */
function panels(): PanelFingerprint[] {
  return [
    fingerprintPanel('graph.nodes', graphNodes),
    fingerprintPanel('graph.edges', graphEdges),
    fingerprintPanel('graph.lenses', lensDefinitions),
    fingerprintPanel('graph.activeSignals', activeSignals),
    fingerprintPanel('smart.cdsCards', mockCdsCards),
    fingerprintPanel('smart.orderCatalog', mockOrderCatalog),
    fingerprintPanel('smart.careTeamCandidates', mockCareTeamCandidates),
    fingerprintPanel('roster.patients', mockPatients),
    fingerprintPanel('roster.providers', mockProviders),
    // Measures are EXTERNAL (constraint #4): the mock disposition is the authored
    // demo gap set and MUST be preserved exactly until HW4's ingestion replaces
    // only the PRODUCTION disposition.
    fingerprintPanel('measures.stars', mockSTARSMeasures),
    fingerprintPanel('measures.hedis', mockHEDISMeasures),
    fingerprintPanel('measures.mips', mockMIPSAdjustments),
    // The seam configuration surface: every registered seam must still default to
    // 'mock' (frontend-only demo runs with zero backend — constraint #3).
    fingerprintPanel('config.dataModes', describeDataModes()),
  ];
}

/** Capture the full demo surface as a deterministic fingerprint set. */
export function captureDemoSurface(): DemoSurface {
  return { version: DEMO_CAPTURE_VERSION, panels: panels() };
}

/** The panel ids under preservation — for reporting / coverage checks. */
export function demoPanelIds(): string[] {
  return panels().map((p) => p.panel);
}
