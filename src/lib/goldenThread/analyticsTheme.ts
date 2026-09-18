/**
 * analyticsTheme.ts — the ONE analytic visual theme, shared by every chart in the app so the
 * "analytic look" is consistent wherever it appears (workbench, surveillance, reconciliation, …).
 *
 * The categorical palette is VALIDATED (dataviz six-checks, light surface): lightness band, chroma
 * floor, CVD adjacent-pair separation (worst ΔE 9.6 deutan), normal-vision floor (17.3), contrast ≥3:1.
 * Do not hand-edit hexes without re-running scripts/validate_palette.js. Categorical hues are assigned
 * in FIXED order, never cycled — a 6th series folds into "Other".
 *
 * CLIENT-SAFE: pure constants. No engine import.
 */

/** Fixed-order categorical hues (identity). Never cycled; index 5+ → 'Other'. */
export const CAT = ['#2f6db0', '#7c3aed', '#0e9384', '#d97706', '#be185d'] as const;
export const catColor = (i: number): string => CAT[i] ?? '#57534e';

/** Reserved status colors (state) — never reused as a series hue; ship with a label/icon, not color alone. */
export const STATUS = {
  good: '#0e9384',
  warning: '#d97706',
  serious: '#c2410c',
  critical: '#da1e28',
} as const;

/** Chart ink + surface tokens (text wears ink, never a series hue). */
export const INK = {
  surface: '#ffffff',
  grid: '#e6e4e0',
  axis: '#9c9891',
  primary: '#1c1b1a',
  secondary: '#57534e',
  muted: '#8a8681',
} as const;

/** A single-hue sequential ramp (magnitude), light→dark. */
export const SEQ = ['#dbeafe', '#93c5fd', '#4f97e8', '#2f6db0', '#1e4b7d'] as const;
