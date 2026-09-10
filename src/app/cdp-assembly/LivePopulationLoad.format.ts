// LivePopulationLoad.format.ts — pure formatting helpers (style tokens, WPC domain
// labels, count formatter). Kept JSX-free so vitest can import/transform them: tsconfig
// jsx:'preserve' makes JSX modules untransformable in tests (see stars-hedis-mips/loading.tsx).
export const MONO = 'JetBrains Mono, Fira Code, monospace';
export const PANEL = '#0a0f1e';
export const CARD = '#0f172a';
export const BORDER = '#1e293b';
export const AMBER = '#F59E0B';
export const LIME = '#84CC16';
export const MUTED = '#64748b';
export const TEXT = '#e2e8f0';

export const n = (v: number): string => v.toLocaleString('en-US');

// WPC-domain keys are lowercase-kebab; preserve payer acronyms rather than title-casing
// them into "Sdoh" / "Bh". Everything else gets a plain humanised label.
export const DOMAIN_LABELS: Record<string, string> = {
  sdoh: 'SDOH',
  'behavioral-health': 'Behavioral Health',
  'labs-vitals': 'Labs & Vitals',
  'pa-lifecycle': 'PA Lifecycle',
  'claims-financial': 'Claims & Financial',
  'care-team': 'Care Team',
  'goals-tasks': 'Goals & Tasks',
  'caregiver-household': 'Caregiver & Household',
  'diagnostic-reports': 'Diagnostic Reports',
  'family-history': 'Family History',
  'risk-assessment': 'Risk Assessment',
};
export function humanizeDomain(d: string): string {
  if (DOMAIN_LABELS[d]) return DOMAIN_LABELS[d];
  return d
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
