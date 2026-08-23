/**
 * DEQM MeasureReport ingestion (HW4 / I19) — the PRODUCTION disposition.
 *
 * Parses external Da Vinci DEQM FHIR MeasureReport resources into normalized
 * MeasureGap rows. The platform does not compute the measures — it reads the
 * numerator/denominator the external system reported and derives the open-gap
 * count. Deliberately tolerant of the population codes DEQM uses.
 */

import type {
  FhirMeasureReport,
  MeasureGap,
  MeasureProgram,
} from './types';

/** Standard DEQM/CQF population codes. */
const NUMERATOR = new Set(['numerator']);
const DENOMINATOR = new Set(['denominator']);

function populationCount(report: FhirMeasureReport, which: Set<string>): number {
  let total = 0;
  for (const g of report.group ?? []) {
    for (const p of g.population ?? []) {
      const code = p.code?.coding?.[0]?.code?.toLowerCase();
      if (code && which.has(code) && typeof p.count === 'number') total += p.count;
    }
  }
  return total;
}

function programFrom(report: FhirMeasureReport): MeasureProgram {
  return report._meta?.program ?? 'HEDIS';
}

/**
 * Ingest one MeasureReport into a normalized gap. Returns null for a report that
 * carries no denominator (nothing to measure a gap against) — a data-quality skip,
 * not a silent fabrication.
 */
export function ingestMeasureReport(report: FhirMeasureReport): MeasureGap | null {
  const denominator = populationCount(report, DENOMINATOR);
  if (denominator <= 0) return null;
  const numerator = populationCount(report, NUMERATOR);
  const gapCount = Math.max(0, denominator - numerator);
  const meta = report._meta ?? {};
  return {
    id: report.id ?? `mr-${meta.measureId ?? 'unknown'}`,
    program: programFrom(report),
    measureId: meta.measureId ?? report.measure ?? 'unknown',
    measureName: meta.measureName ?? report.measure ?? 'Unknown measure',
    domain: meta.domain ?? 'Unspecified',
    contractName: meta.contractName ?? 'Unspecified',
    numerator,
    denominator,
    gapCount,
    status: gapCount === 0 ? 'closed' : 'open',
    source: 'deqm',
  };
}

/** Ingest a batch of MeasureReports; data-quality skips are dropped (not faked). */
export function ingestMeasureReports(reports: FhirMeasureReport[]): MeasureGap[] {
  const out: MeasureGap[] = [];
  for (const r of reports) {
    const gap = ingestMeasureReport(r);
    if (gap) out.push(gap);
  }
  return out;
}
