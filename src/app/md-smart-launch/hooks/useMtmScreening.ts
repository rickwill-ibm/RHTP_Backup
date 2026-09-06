/**
 * useMtmScreening — MTM state and screening logic extracted from AddMedicationForm.
 *
 * Owns:
 *  - findings[], acknowledged set, screeningDone, screenedForName
 *  - inputBlurred (blur-gate for the orange warning)
 *  - screeningInProgress (spinner state)
 *  - runMtmScreening() async function
 *  - submit-guard derived flags (hasHardBlock, pendingAck, screeningPending)
 *
 * The hook is a pure logic container — no JSX, no side effects beyond useState.
 * All external API calls go through the BFF (/api/mtm/*).
 */
import { useState, useCallback } from 'react';
import type {
  DrugLookupResult,
  DrugInteraction,
  MtmFinding,
  PatientAllergy,
} from '@/lib/agents/mtm/types';
import type { CurrentMedication } from '@/lib/agents/mtm/types';
import { evaluate } from '@/lib/agents/mtm/mtmEngine';

interface UseMtmScreeningOptions {
  currentMedications: CurrentMedication[];
  allergies: PatientAllergy[];
  patientAgeYears?: number;
}

export interface MtmScreeningState {
  mtmFindings: MtmFinding[];
  acknowledged: Set<number>;
  screeningDone: boolean;
  screenedForName: string | null;
  inputBlurred: boolean;
  screeningInProgress: boolean;
  // Derived submit-guard flags
  hasHardBlock: boolean;
  pendingAck: boolean;
  screeningRequired: boolean;
  screeningStale: boolean;
  screeningPending: boolean;
}

export interface MtmScreeningActions {
  runMtmScreening: (drug: DrugLookupResult) => Promise<void>;
  handleAcknowledge: (index: number) => void;
  resetScreening: () => void;
  setInputBlurred: (v: boolean) => void;
}

export function useMtmScreening({
  currentMedications,
  allergies,
  patientAgeYears,
}: UseMtmScreeningOptions): [MtmScreeningState, MtmScreeningActions] {
  const [mtmFindings, setMtmFindings] = useState<MtmFinding[]>([]);
  const [acknowledged, setAcknowledged] = useState<Set<number>>(new Set());
  const [screeningDone, setScreeningDone] = useState(false);
  const [screenedForName, setScreenedForName] = useState<string | null>(null);
  const [inputBlurred, setInputBlurred] = useState(false);
  const [screeningInProgress, setScreeningInProgress] = useState(false);

  const resetScreening = useCallback(() => {
    setMtmFindings([]);
    setAcknowledged(new Set());
    setScreeningDone(false);
    setScreenedForName(null);
    setInputBlurred(false);
  }, []);

  const runMtmScreening = useCallback(
    async (drug: DrugLookupResult) => {
      setMtmFindings([]);
      setAcknowledged(new Set());
      setScreeningDone(false);
      setScreeningInProgress(true);

      try {
        let interactions: DrugInteraction[] = [];
        if (currentMedications.length > 0) {
          const existingRxcuis = currentMedications.map((m) => m.rxcui).filter(Boolean);
          if (existingRxcuis.length > 0) {
            try {
              const res = await fetch('/api/mtm/interactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rxcuis: [...existingRxcuis, drug.rxcui] }),
              });
              if (res.ok) {
                const data = (await res.json()) as { interactions: DrugInteraction[] };
                interactions = data.interactions ?? [];
              }
            } catch {
              /* fail-open — show no interactions */
            }
          }
        }

        const findings = evaluate({
          newDrug: drug,
          currentMedications,
          interactions,
          allergies,
          patientAgeYears,
        });

        setMtmFindings(findings);
        setScreeningDone(true);
        setScreenedForName(drug.name);
      } finally {
        setScreeningInProgress(false);
      }
    },
    [currentMedications, allergies, patientAgeYears]
  );

  const handleAcknowledge = useCallback((index: number) => {
    setAcknowledged((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  // ── Derived submit-guard flags ─────────────────────────────────────────────
  const hasHardBlock = mtmFindings.some((f) => f.hardBlock);
  const pendingAck = mtmFindings.some(
    (f, i) => f.requiresAcknowledgement && !f.hardBlock && !acknowledged.has(i)
  );
  const screeningRequired = allergies.length > 0;
  const screeningStale = screenedForName === null || screenedForName.trim().toLowerCase() !== ''; // computed in form against medName
  const screeningPending = screeningRequired && screenedForName === null;

  const state: MtmScreeningState = {
    mtmFindings,
    acknowledged,
    screeningDone,
    screenedForName,
    inputBlurred,
    screeningInProgress,
    hasHardBlock,
    pendingAck,
    screeningRequired,
    screeningStale,
    screeningPending,
  };

  const actions: MtmScreeningActions = {
    runMtmScreening,
    handleAcknowledge,
    resetScreening,
    setInputBlurred,
  };

  return [state, actions];
}
