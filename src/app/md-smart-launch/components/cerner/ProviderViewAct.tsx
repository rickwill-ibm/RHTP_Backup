'use client';
/**
 * Provider View — Act column.
 * CDS Alerts (CDS Hooks cards), Care Gaps (facts derived from FHIR),
 * Immunization status. Retained VBC quality logic, restyled.
 */
import React from 'react';
import MPageCard from './MPageCard';
import type { CdsCard } from '@/lib/smartFhirTypes';
import {
  useActiveMedications,
  useImmunizations,
  useLabs,
  useProblemList,
  useProcedures,
  useSdohObservations,
  useVitals,
} from '@/lib/fhir/hooks';
import { ccText, codeOf, fmtDate, interpCode } from '@/lib/fhir/types';

export interface DerivedGap {
  id: string;
  name: string;
  program: string;
  measure: string;
  priority: 'High' | 'Medium';
  evidence: string;
  fhir?: { resourceType: string; resourceId: string; label: string };
}

interface ActColumnProps {
  patientId: string;
  cdsCards: CdsCard[];
  closedGapIds: string[];
  onOpenResource: (resourceType: string, resourceId: string, label: string) => void;
  onCloseGap: (gap: DerivedGap) => void;
  onOpenCdsCard: (card: CdsCard) => void;
}

const INDICATOR_STYLE: Record<string, string> = {
  critical: 'border-l-[#c8102e] bg-[#fdecea]',
  warning: 'border-l-[#e8a33d] bg-[#fff8ec]',
  info: 'border-l-[#0057b8] bg-[#eef4fb]',
};

/** Derive HEDIS/MIPS-style care gaps from live FHIR facts. */
export function useDerivedCareGaps(patientId: string): { gaps: DerivedGap[]; loading: boolean } {
  const labs = useLabs(patientId);
  const vitals = useVitals(patientId);
  const meds = useActiveMedications(patientId);
  const problems = useProblemList(patientId);
  const procedures = useProcedures(patientId);
  const sdoh = useSdohObservations(patientId);

  const loading =
    labs.loading || vitals.loading || meds.loading || problems.loading || procedures.loading;

  const gaps: DerivedGap[] = [];
  const hasDm = problems.data.some((p) => codeOf(p.code)?.startsWith('E11'));
  const latestA1c = labs.data.find((l) => codeOf(l.code) === '4548-4');
  const a1cVal = latestA1c?.valueQuantity?.value;

  if (hasDm && a1cVal !== undefined && a1cVal > 8) {
    gaps.push({
      id: 'gap-a1c',
      name: 'A1C Control — Diabetes',
      program: 'HEDIS',
      measure: 'CDC-001',
      priority: 'High',
      evidence: `A1C ${a1cVal}% (${fmtDate(latestA1c?.effectiveDateTime)}) — above 8% control threshold`,
      fhir: latestA1c?.id
        ? { resourceType: 'Observation', resourceId: latestA1c.id, label: `HbA1c ${a1cVal}%` }
        : undefined,
    });
  }

  const latestBp = vitals.data.find((v) => codeOf(v.code) === '85354-9');
  if (latestBp && interpCode(latestBp) === 'H') {
    const sys = latestBp.component?.find((c) => codeOf(c.code) === '8480-6')?.valueQuantity?.value;
    const dia = latestBp.component?.find((c) => codeOf(c.code) === '8462-4')?.valueQuantity?.value;
    gaps.push({
      id: 'gap-bp',
      name: 'Controlling High Blood Pressure',
      program: 'HEDIS',
      measure: 'CBP-236',
      priority: 'High',
      evidence: `BP ${sys}/${dia} (${fmtDate(latestBp.effectiveDateTime)}) — above 130/80 goal`,
      fhir: latestBp.id
        ? { resourceType: 'Observation', resourceId: latestBp.id, label: `BP ${sys}/${dia}` }
        : undefined,
    });
  }

  const hasStatin = meds.data.some((m) =>
    ccText(m.medicationCodeableConcept).toLowerCase().includes('statin'),
  );
  if (hasDm && !hasStatin) {
    gaps.push({
      id: 'gap-statin',
      name: 'Statin Therapy — Diabetes/CVD',
      program: 'HEDIS',
      measure: 'SPC-438',
      priority: 'High',
      evidence: 'No active statin on medication list',
    });
  }

  const hasColonoscopy = procedures.data.some((p) =>
    ccText(p.code).toLowerCase().includes('colonoscop'),
  );
  if (!hasColonoscopy) {
    gaps.push({
      id: 'gap-crc',
      name: 'Colorectal Cancer Screening',
      program: 'HEDIS',
      measure: 'COL-113',
      priority: 'Medium',
      evidence: 'No colorectal screening on record (age 51)',
    });
  }

  const sdohPositive = sdoh.data.find((o) => interpCode(o) === 'A');
  if (sdohPositive) {
    gaps.push({
      id: 'gap-sdoh',
      name: 'SDOH Follow-Up — Food Insecurity',
      program: 'MIPS',
      measure: 'MIPS-487',
      priority: 'Medium',
      evidence: `${ccText(sdohPositive.code)}: ${ccText(sdohPositive.valueCodeableConcept)}`,
      fhir: sdohPositive.id
        ? {
            resourceType: 'Observation',
            resourceId: sdohPositive.id,
            label: ccText(sdohPositive.code),
          }
        : undefined,
    });
  }

  return { gaps, loading };
}

export default function ProviderViewAct({
  patientId,
  cdsCards,
  closedGapIds,
  onOpenResource,
  onCloseGap,
  onOpenCdsCard,
}: ActColumnProps) {
  const { gaps, loading: gapsLoading } = useDerivedCareGaps(patientId);
  const imms = useImmunizations(patientId);
  const openGaps = gaps.filter((g) => !closedGapIds.includes(g.id));

  const hasFluThisSeason = imms.data.some(
    (i) =>
      ccText(i.vaccineCode).toLowerCase().includes('influenza') &&
      (i.occurrenceDateTime ?? '') >= '2025-08-01',
  );

  return (
    <div>
      {/* ── CDS Alerts ── */}
      <MPageCard title="CDS Alerts" count={cdsCards.length}>
        {cdsCards.length === 0 ? (
          <div className="px-3 py-1.5 italic text-[#5b6770]">No active alerts</div>
        ) : (
          <div className="p-1.5 space-y-1.5">
            {cdsCards.map((card) => (
              <button
                key={card.id}
                onClick={() => onOpenCdsCard(card)}
                className={`w-full text-left border border-[#d5dce2] border-l-4 rounded-sm px-2 py-1.5 hover:brightness-[0.98] ${
                  INDICATOR_STYLE[card.indicator] ?? INDICATOR_STYLE.info
                }`}
              >
                <div className="font-semibold text-[12px]">{card.summary}</div>
                <div className="text-[11px] text-[#5b6770] truncate">{card.source}</div>
              </button>
            ))}
          </div>
        )}
      </MPageCard>

      {/* ── Care Gaps ── */}
      <MPageCard title="Care Gaps (HEDIS / MIPS)" count={openGaps.length} loading={gapsLoading}>
        {openGaps.length === 0 ? (
          <div className="px-3 py-1.5 text-[#1e7e34]">All identified gaps addressed ✓</div>
        ) : (
          <div className="p-1.5 space-y-1.5">
            {openGaps.map((g) => (
              <div
                key={g.id}
                className={`border border-[#d5dce2] rounded-sm px-2 py-1.5 border-l-4 ${
                  g.priority === 'High' ? 'border-l-[#c8102e]' : 'border-l-[#e8a33d]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[12px]">{g.name}</span>
                  <span className="text-[10px] text-[#5b6770] whitespace-nowrap">
                    {g.program} {g.measure}
                  </span>
                </div>
                <div className="text-[11px] text-[#5b6770]">
                  {g.fhir ? (
                    <button
                      className="text-[#00539b] hover:underline"
                      onClick={() =>
                        onOpenResource(g.fhir!.resourceType, g.fhir!.resourceId, g.fhir!.label)
                      }
                    >
                      {g.evidence}
                    </button>
                  ) : (
                    g.evidence
                  )}
                </div>
                <div className="mt-1">
                  <button
                    className="text-[11px] px-2 py-0.5 bg-[#2d4a63] text-white rounded-sm hover:bg-[#3a5a77]"
                    onClick={() => onCloseGap(g)}
                  >
                    Address Gap
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </MPageCard>

      {/* ── Immunizations ── */}
      <MPageCard
        title="Immunization Status"
        fetchedAt={imms.fetchedAt}
        loading={imms.loading}
        error={imms.error}
        onRefresh={imms.refresh}
      >
        <table className="w-full">
          <tbody>
            {imms.data.map((i) => (
              <tr key={i.id} className="border-b border-[#eef1f4] last:border-0">
                <td className="px-3 py-1">
                  <button
                    className="text-[#00539b] hover:underline"
                    onClick={() => i.id && onOpenResource('Immunization', i.id, ccText(i.vaccineCode))}
                  >
                    {ccText(i.vaccineCode)}
                  </button>
                </td>
                <td className="px-2 py-1 text-right text-[11.5px] text-[#5b6770]">
                  {fmtDate(i.occurrenceDateTime)}
                </td>
              </tr>
            ))}
            {!hasFluThisSeason && !imms.loading && (
              <tr>
                <td colSpan={2} className="px-3 py-1 bg-[#fff8ec] text-[#8a5300] text-[11.5px]">
                  ⚠ Influenza (2026–27 season) — due this fall
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </MPageCard>
    </div>
  );
}
