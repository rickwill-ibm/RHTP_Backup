/**
 * Authored measure gaps (HW4 / I19) — the MOCK disposition.
 *
 * GOVERNING CONSTRAINT #2 + #4: the mock disposition reproduces TODAY's authored
 * demo gaps EXACTLY. This module only READS the existing authored arrays
 * (mockHEDISMeasures / mockSTARSMeasures / mockMIPSAdjustments) and normalizes them
 * into the shared MeasureGap shape — it never mutates them, so the demo-preservation
 * golden (which pins those arrays) stays green. Adding this seam does NOT change the
 * demo; it adds a production branch alongside it.
 */

import { mockHEDISMeasures, mockSTARSMeasures, mockMIPSAdjustments } from '../mockData';
import type { MeasureGap, GapStatus } from './types';

function normStatus(s: unknown): GapStatus {
  return s === 'in-progress' ? 'in-progress' : s === 'closed' ? 'closed' : 'open';
}

/** Normalize the authored demo measure arrays into MeasureGap[] (source 'authored'). */
export function authoredMeasureGaps(): MeasureGap[] {
  const hedis: MeasureGap[] = (mockHEDISMeasures as any[]).map((m) => ({
    id: m.id,
    program: 'HEDIS',
    measureId: m.measureId,
    measureName: m.measureName,
    domain: m.domain,
    contractName: m.contractName,
    numerator: m.patientsCompliant,
    denominator: m.patientsDue,
    gapCount: Math.max(0, (m.patientsDue ?? 0) - (m.patientsCompliant ?? 0)),
    status: normStatus(m.status),
    source: 'authored',
  }));
  const stars: MeasureGap[] = (mockSTARSMeasures as any[]).map((m) => ({
    id: m.id,
    program: 'STARS',
    measureId: m.measureId,
    measureName: m.measureName,
    domain: m.domain,
    contractName: m.contractName,
    gapCount: m.gapCount ?? 0,
    status: normStatus(m.status),
    source: 'authored',
  }));
  const mips: MeasureGap[] = (mockMIPSAdjustments as any[]).map((m) => ({
    id: m.id,
    program: 'MIPS',
    measureId: m.noticeId,
    measureName: `MIPS ${m.performanceYear} (composite ${m.compositeScore})`,
    domain: 'MIPS',
    contractName: m.performanceYear,
    gapCount: m.status === 'closed' ? 0 : 1,
    status: normStatus(m.status),
    source: 'authored',
  }));
  return [...hedis, ...stars, ...mips];
}
