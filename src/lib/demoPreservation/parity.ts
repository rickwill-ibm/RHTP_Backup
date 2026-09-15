/**
 * parity.ts — the E15 seam mock<->production parity REGISTRY (HW0 / I12).
 *
 * Each entry freezes the STRUCTURAL SHAPE of a seam's mock disposition. Two uses:
 *   1. now — a test proves each mock shape has not drifted from its frozen hash;
 *   2. later (HW1-HW4) — when a seam gains a production disposition, a parity test
 *      calls assertSeamParityWithProduction(seam, prodSample) to prove the two are
 *      shape-equivalent before the seam is allowed to flip to production.
 *
 * Registering a seam here is how a hardening iteration "freezes the contract"
 * its production disposition must satisfy (program-spine interface-freeze).
 */

import { shapeOf, diffShape, assertShapeEquivalent, type Shape } from './shape';
import { hashValue } from './fingerprint';
import { graphNodes, graphEdges, activeSignals } from '../wholePersonGraphData';
import { mockCdsCards } from '../smartFhirMockData';
import { mockPatients, mockProviders, mockHEDISMeasures } from '../mockData';

export interface SeamParityEntry {
  /** dataMode seam id (or a demo-panel key when no single seam owns it yet). */
  seam: string;
  /** A representative mock value whose shape the production disposition must match. */
  sample: () => unknown;
  /** Human note: what the production disposition will be, and its DEQM/FHIR anchor. */
  note: string;
}

/**
 * The frozen seam set. Kept to representative elements (one node, one card, one
 * member) so the shape — not the volume — is what is pinned.
 */
export const SEAM_PARITY: SeamParityEntry[] = [
  {
    seam: 'graph',
    sample: () => graphNodes[0],
    note: 'mock authored node vs projected-store node (HW1/HW4)',
  },
  {
    seam: 'graph.edge',
    sample: () => graphEdges[0],
    note: 'mock authored edge vs projected-store edge (HW1/HW4)',
  },
  {
    seam: 'graph.signal',
    sample: () => activeSignals[0],
    note: 'authored active signal vs derived signal (HW4)',
  },
  {
    seam: 'fhirStore',
    sample: () => mockCdsCards[0],
    note: 'mock CDS card vs live CDS Hooks card (HW4)',
  },
  {
    seam: 'wpcRecord',
    sample: () => mockPatients[0],
    note: 'mock member vs resolved 20-domain record (HW3/HW4)',
  },
  {
    seam: 'providerDirectory',
    sample: () => mockProviders[0],
    note: 'mock provider vs NPPES-resolved provider (HW3)',
  },
  {
    seam: 'measures',
    sample: () => mockHEDISMeasures[0],
    note: 'authored HEDIS gap vs external DEQM MeasureReport-derived gap (HW4)',
  },
];

export interface SeamShapeRecord {
  seam: string;
  shape: Shape;
  shapeHash: string;
}

/** Compute the frozen shape record for every registered seam. */
export function seamShapeRecords(): SeamShapeRecord[] {
  return SEAM_PARITY.map((e) => {
    const shape = shapeOf(e.sample());
    return { seam: e.seam, shape, shapeHash: hashValue(shape) };
  });
}

/**
 * Prove a seam's production sample is shape-equivalent to its frozen mock shape.
 * Called by a seam's parity test the moment a production disposition exists.
 * Throws (E15) on divergence.
 */
export function assertSeamParityWithProduction(seam: string, productionSample: unknown): void {
  const entry = SEAM_PARITY.find((e) => e.seam === seam);
  if (!entry) throw new Error(`E15: seam '${seam}' is not registered in SEAM_PARITY`);
  assertShapeEquivalent(entry.sample(), productionSample, seam);
}

/** Non-throwing variant for reporting: the structural diffs (empty = parity). */
export function seamParityDiffs(seam: string, productionSample: unknown) {
  const entry = SEAM_PARITY.find((e) => e.seam === seam);
  if (!entry) return [{ path: '$', reason: `seam '${seam}' not registered` }];
  return diffShape(shapeOf(entry.sample()), shapeOf(productionSample));
}
