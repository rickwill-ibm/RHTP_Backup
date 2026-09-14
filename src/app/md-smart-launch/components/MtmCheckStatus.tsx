'use client';
/**
 * MtmCheckStatus — inline MTM safety feedback within AddMedicationForm.
 * Renders one of: spinner, warning+manual trigger, findings panel, or green pass.
 * Extracted from AddMedicationForm to keep that file under the 400-line cap.
 */
import React from 'react';
import MtmSafetyPanel from './MtmSafetyPanel';
import type { MtmFinding } from '@/lib/agents/mtm/types';

export interface MtmCheckStatusProps {
  screeningInProgress: boolean;
  screeningPending: boolean;
  inputBlurred: boolean;
  medName: string;
  screeningDone: boolean;
  screeningStale: boolean;
  findings: MtmFinding[];
  acknowledged: Set<number>;
  onAcknowledge: (i: number) => void;
  onRunManual: () => void;
}

export default function MtmCheckStatus({
  screeningInProgress,
  screeningPending,
  inputBlurred,
  medName,
  screeningDone,
  screeningStale,
  findings,
  acknowledged,
  onAcknowledge,
  onRunManual,
}: MtmCheckStatusProps) {
  if (screeningInProgress) {
    return (
      <div className="bg-[#f0f9ff] border border-[#7dd3fc] rounded-sm px-3 py-2">
        <p className="text-[12px] font-semibold text-[#0369a1]">⏳ Running MTM Safety Check…</p>
        <p className="text-[11.5px] text-[#075985] mt-0.5">
          Checking for allergy conflicts, drug interactions, duplicate therapy, and Beers Criteria.
        </p>
      </div>
    );
  }
  if (screeningPending && inputBlurred && medName.trim().length >= 2) {
    return (
      <div className="bg-[#fff7ed] border border-[#fb923c] rounded-sm px-3 py-2">
        <p className="text-[12px] font-semibold text-[#c2410c]">
          ⚠ MTM Safety Check required — patient has documented allergies
        </p>
        <p className="text-[11.5px] text-[#9a3412] mt-0.5 mb-2">
          Select a drug from the search results, or click below to run a safety check on the entered
          name.
        </p>
        <button
          type="button"
          onClick={onRunManual}
          className="text-[11.5px] font-semibold px-3 py-1 rounded-sm bg-[#c2410c] text-white hover:bg-[#9a3412]"
        >
          Run MTM Safety Check Now
        </button>
      </div>
    );
  }
  if (screeningDone && !screeningStale && findings.length > 0) {
    return (
      <MtmSafetyPanel
        findings={findings}
        acknowledged={acknowledged}
        onAcknowledge={onAcknowledge}
      />
    );
  }
  if (screeningDone && !screeningStale && findings.length === 0) {
    return (
      <div className="text-[11.5px] text-[#166534] bg-[#f0fdf4] border border-[#86efac] rounded-sm px-3 py-2">
        ✓ MTM Safety Check passed — no allergy conflicts, interactions, duplicate therapy, or Beers
        Criteria concerns.
      </div>
    );
  }
  return null;
}
