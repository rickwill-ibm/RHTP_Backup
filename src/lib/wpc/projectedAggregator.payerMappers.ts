// CONTRACT: C1  // DP-1  // WPC payer dimensions
/**
 * Pure section mappers for the WPC payer dimensions (Coverage / Encounter /
 * RiskAssessment / Flag), split out of projectedAggregator.mappers.ts to keep both
 * modules under the size cap. Each turns consent-filtered whole-person lens output
 * into one OPTIONAL HolisticPatientContext section. No store, no I/O, no globals.
 *
 * The whole-person lens has already consent-filtered its nodes, so a restricted
 * (42 CFR Part 2) Encounter/Flag the read scope does not cover is simply absent
 * here — utilization/alerts never count what the caller may not see. Every field is
 * PHI-minimal (codes + numbers, never a free-text narrative).
 */
import type { GraphNodeRecord, PropVal } from '@/lib/graph/types';
import type { LensResult } from '@/lib/graph/lens/types';
import type {
  AlertSummary,
  CodingGapSummary,
  CoverageSummary,
  RiskProfileSummary,
  UtilizationSummary,
} from '@/lib/services/holisticContextEngine.types';

function s(v: PropVal | undefined, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function n(v: PropVal | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
function nodesOfKind(nodes: GraphNodeRecord[], kind: string): GraphNodeRecord[] {
  return nodes.filter((node) => node.kind === kind);
}

/** Risk profile from the whole-person lens's RiskAssessment nodes (PHI-minimal). */
export function mapRiskProfile(whole: LensResult): RiskProfileSummary {
  const assessments = nodesOfKind(whole.nodes, 'RiskAssessment').map((node) => ({
    predictedOutcome: s(node.properties.predictedOutcome),
    probability: n(node.properties.probability),
    rafScore: n(node.properties.rafScore),
    method: s(node.properties.method),
  }));
  const highestRaf = assessments.reduce((max, a) => Math.max(max, a.rafScore), 0);
  return { assessments, highestRaf };
}

/** Coverage summary from the whole-person lens's Coverage nodes (PHI-minimal). */
export function mapCoverage(whole: LensResult): CoverageSummary {
  const plans = nodesOfKind(whole.nodes, 'Coverage').map((node) => ({
    planCode: s(node.properties.planCode),
    status: s(node.properties.status),
    periodStart: s(node.properties.periodStart),
    periodEnd: s(node.properties.periodEnd),
  }));
  return { plans };
}

/** Utilization from the whole-person lens's Encounter nodes (consent-filtered; PHI-minimal). */
export function mapUtilization(whole: LensResult): UtilizationSummary {
  const encounters = nodesOfKind(whole.nodes, 'Encounter');
  const classes: string[] = [];
  for (const e of encounters) {
    const c = s(e.properties.encounterClass);
    if (c && !classes.includes(c)) classes.push(c);
  }
  return { encounterCount: encounters.length, classes };
}

/** Alerts from the whole-person lens's Flag nodes (consent-filtered; category codes only). */
export function mapAlerts(whole: LensResult): AlertSummary {
  const flags = nodesOfKind(whole.nodes, 'Flag');
  const categories: string[] = [];
  let activeCount = 0;
  for (const f of flags) {
    if (s(f.properties.status, 'active') === 'active') activeCount += 1;
    const cat = s(f.properties.categoryCode);
    if (cat && !categories.includes(cat)) categories.push(cat);
  }
  return { activeCount, categories };
}

/**
 * Da Vinci Risk Adjustment coding gaps from the whole-person lens's CodingGap nodes
 * (consent-filtered — a SUD-linked/Part 2 gap the scope does not cover is already
 * absent). PHI-minimal: HCC category codes, statuses, and suspect types only. An
 * `open-gap`/`pending` is actionable recapture; a `suspected` gap is a hypothesis.
 */
export function mapCodingGaps(whole: LensResult): CodingGapSummary {
  const gaps = nodesOfKind(whole.nodes, 'CodingGap').map((node) => ({
    conditionCategory: s(node.properties.conditionCategory),
    model: s(node.properties.model),
    modelVersion: s(node.properties.modelVersion),
    evidenceStatus: s(node.properties.evidenceStatus),
    suspectType: s(node.properties.suspectType),
    hierarchicalStatus: s(node.properties.hierarchicalStatus),
  }));
  const openCount = gaps.filter(
    (g) => g.evidenceStatus === 'open-gap' || g.evidenceStatus === 'pending'
  ).length;
  const suspectedCount = gaps.filter((g) => g.suspectType === 'suspected').length;
  return { gaps, openCount, suspectedCount };
}
