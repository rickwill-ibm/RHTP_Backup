/**
 * demoPreservation — the HW0 / I12 safety net.
 *
 * Governing constraint #2 ("demo preserved at all costs") is unenforceable by
 * intention alone; this module makes it mechanical. captureDemoSurface() pins the
 * authored demo as fingerprints (a golden the gate compares against); the seam
 * parity registry (E15) freezes each mock disposition's shape so a later
 * production disposition must match it before a seam may flip. Every hardening
 * iteration HW1..HW6 runs against this net.
 */

export {
  captureDemoSurface,
  demoPanelIds,
  DEMO_CAPTURE_VERSION,
  type DemoSurface,
} from './capture';
export {
  fingerprintPanel,
  hashValue,
  canonicalJson,
  fnv1a,
  type PanelFingerprint,
} from './fingerprint';
export { shapeOf, diffShape, assertShapeEquivalent, type Shape, type ParityDiff } from './shape';
export {
  SEAM_PARITY,
  seamShapeRecords,
  assertSeamParityWithProduction,
  seamParityDiffs,
  type SeamParityEntry,
  type SeamShapeRecord,
} from './parity';
