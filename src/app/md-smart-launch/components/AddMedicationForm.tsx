'use client';
/**
 * AddMedicationForm — MTM-enhanced point-of-care MedicationRequest entry.
 * MTM screening state lives in useMtmScreening hook; MTM UI panels in MtmCheckStatus.
 * INVARIANT: All external API calls go through /api/mtm/* BFF routes (no keys in browser).
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ClinicalEntryModal from './ClinicalEntryModal';
import MtmCheckStatus from './MtmCheckStatus';
import type { SmartLaunchContext } from '@/lib/smartFhirTypes';
import type { DrugLookupResult, PatientAllergy, CurrentMedication } from '@/lib/agents/mtm/types';
import { searchDrugs, fetchNdcForRxcui } from '@/lib/agents/mtm/drugLookup';
import { useMtmScreening } from '../hooks/useMtmScreening';
import { useMedicationSubmit } from '../hooks/useMedicationSubmit';

// ── Static quick-picks (unchanged) ────────────────────────────────────────────

const MED_SUGGESTIONS = [
  { code: '314076', display: 'Lisinopril 10 mg', sig: '1 tab daily' },
  { code: '860975', display: 'Metformin 500 mg', sig: '1 tab twice daily with meals' },
  { code: '617311', display: 'Atorvastatin 40 mg', sig: '1 tab at bedtime' },
  { code: '313782', display: 'Furosemide 20 mg', sig: '1 tab daily' },
  { code: '197319', display: 'Amlodipine 5 mg', sig: '1 tab daily' },
  { code: '310798', display: 'Omeprazole 20 mg', sig: '1 cap daily before breakfast' },
  { code: '309362', display: 'Clopidogrel 75 mg', sig: '1 tab daily' },
  { code: '198240', display: 'Sertraline 50 mg', sig: '1 tab daily' },
];

// ── Cost tier badge ────────────────────────────────────────────────────────────

function CostBadge({ tier }: { tier?: 'low' | 'medium' | 'high' }) {
  if (!tier) return null;
  const styles = {
    low: 'bg-[#dcfce7] text-[#166534]',
    medium: 'bg-[#fef9c3] text-[#854d0e]',
    high: 'bg-[#fee2e2] text-[#991b1b]',
  };
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm ${styles[tier]}`}>
      {tier.toUpperCase()} COST
    </span>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  patientId: string;
  encounterId: string;
  launchContext: SmartLaunchContext;
  /** Active medications for MTM screening — from useActiveMedications() */
  currentMedications?: CurrentMedication[];
  /** Active allergies for drug-allergy check — from useAllergies() mapped to PatientAllergy */
  allergies?: PatientAllergy[];
  /** Patient age for Beers Criteria */
  patientAgeYears?: number;
  onSaved: (resourceId: string, display: string) => void;
  onCancel: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AddMedicationForm({
  patientId,
  encounterId,
  launchContext,
  currentMedications = [],
  allergies = [],
  patientAgeYears,
  onSaved,
  onCancel,
}: Props) {
  // ── Form state ───────────────────────────────────────────────────────────────
  const [medName, setMedName] = useState('');
  const [rxCode, setRxCode] = useState('');
  const [ndcCode, setNdcCode] = useState('');
  const [sig, setSig] = useState('');
  const [refills, setRefills] = useState('0');
  const [note, setNote] = useState('');

  // ── Typeahead state ──────────────────────────────────────────────────────────
  const [suggestions, setSuggestions] = useState<DrugLookupResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedDrug, setSelectedDrug] = useState<DrugLookupResult | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── MTM state (via hook) ─────────────────────────────────────────────────────
  const [mtm, mtmActions] = useMtmScreening({ currentMedications, allergies, patientAgeYears });
  const {
    mtmFindings,
    acknowledged,
    screeningDone,
    screenedForName,
    inputBlurred,
    screeningInProgress,
    hasHardBlock,
    pendingAck,
  } = mtm;
  const { runMtmScreening, handleAcknowledge, resetScreening, setInputBlurred } = mtmActions;

  const { saving, error, handleSubmit } = useMedicationSubmit(
    { patientId, encounterId, launchContext, allergies },
    onSaved
  );

  const today = new Date().toISOString().slice(0, 10);

  // ── Typeahead debounce ───────────────────────────────────────────────────────

  const handleMedNameChange = useCallback((value: string) => {
    setMedName(value);
    setSelectedDrug(null);
    resetScreening(); // clears all MTM state including blur gate

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLookingUp(true);
      try {
        const results = await searchDrugs(value.trim());
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
      } finally {
        setLookingUp(false);
      }
    }, 300);
  }, []);

  // ── Drug selection ────────────────────────────────────────────────────────────

  async function selectDrug(drug: DrugLookupResult) {
    setSelectedDrug(drug);
    setMedName(drug.name);
    setRxCode(drug.rxcui);
    setSig(drug.suggestedSig ?? '');
    setSuggestions([]);
    setShowSuggestions(false);

    // Fetch NDC
    if (drug.ndcList.length > 0) {
      setNdcCode(drug.ndcList[0]);
    } else {
      const ndcList = await fetchNdcForRxcui(drug.rxcui);
      setNdcCode(ndcList[0] ?? '');
    }

    // MTM screening
    await runMtmScreening(drug);
  }

  // ── Quick-pick ────────────────────────────────────────────────────────────────

  function pickSuggestion(m: { code: string; display: string; sig: string }) {
    const minimal: DrugLookupResult = {
      rxcui: m.code,
      name: m.display,
      isGeneric: true,
      suggestedSig: m.sig,
      ndcList: [],
    };
    selectDrug(minimal);
  }

  // ── Submit guard ──────────────────────────────────────────────────────────────

  // SAFETY INVARIANT: submit is blocked when allergies on file and screening has
  // not been run for the current drug name, OR a hard-block finding exists.
  const screeningRequired = allergies.length > 0;
  const screeningStale =
    screenedForName === null ||
    screenedForName.trim().toLowerCase() !== medName.trim().toLowerCase();
  const screeningPending = screeningRequired && screeningStale;

  const submitDisabled =
    !medName.trim() || hasHardBlock || pendingAck || screeningPending || screeningInProgress;

  // ── Cleanup on unmount ────────────────────────────────────────────────────────
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    []
  );

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <ClinicalEntryModal
      title="Add Medication to Medication List"
      saving={saving}
      error={error}
      onCancel={onCancel}
      onSubmit={() => handleSubmit({ medName, rxCode, ndcCode, sig, refills, note, mtmFindings })}
      submitLabel="Add Medication → FHIR"
      submitDisabled={submitDisabled}
    >
      <div className="text-[11.5px] text-[#5b6770] mb-1">
        Date of Service: <strong>{today}</strong> · Prescribed by:{' '}
        <strong>{launchContext.practitionerName}</strong>
      </div>

      <div className="space-y-2.5">
        {/* Drug name typeahead */}
        <div className="relative">
          <label className="block text-[12px] font-semibold text-[#1a1a1a] mb-1">
            Medication Name <span className="text-[#c8102e]">*</span>
            {lookingUp && (
              <span className="text-[10px] font-normal text-[#5b6770] ml-2">Searching…</span>
            )}
          </label>
          <input
            className="w-full border border-[#b7c1ca] rounded-sm px-2.5 py-1.5 text-[12.5px] focus:outline-none focus:border-[#2d4a63]"
            placeholder="Type drug name to search RxNorm…"
            value={medName}
            onChange={(e) => handleMedNameChange(e.target.value)}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            onBlur={() => {
              setTimeout(() => setShowSuggestions(false), 150);
              // Only set inputBlurred when the user leaves WITHOUT having selected a drug
              if (selectedDrug === null && medName.trim().length >= 2) {
                setInputBlurred(true);
              }
            }}
            autoComplete="off"
          />
          {showSuggestions && suggestions.length > 0 && (
            <ul className="absolute z-50 w-full bg-white border border-[#b7c1ca] rounded-sm shadow-lg mt-0.5 max-h-48 overflow-y-auto">
              {suggestions.map((s) => (
                <li
                  key={s.rxcui}
                  onMouseDown={() => selectDrug(s)}
                  className="px-3 py-2 cursor-pointer hover:bg-[#f2f6f9] border-b border-[#e5e7eb] last:border-0"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[12.5px] font-semibold text-[#1a1a1a]">{s.name}</span>
                    {s.brandName && (
                      <span className="text-[10.5px] text-[#5b6770]">(brand: {s.brandName})</span>
                    )}
                    <CostBadge tier={s.costTier} />
                  </div>
                  <div className="text-[10.5px] text-[#5b6770] mt-0.5">RxCUI: {s.rxcui}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Brand→generic resolution panel */}
        {selectedDrug?.brandName && selectedDrug.genericName && (
          <div className="bg-[#f0fdf4] border border-[#86efac] rounded-sm px-3 py-2 text-[11.5px]">
            <span className="font-semibold text-[#166534]">Generic substitution available: </span>
            <span className="text-[#1a1a1a]">{selectedDrug.genericName}</span>
            <span className="text-[#5b6770] ml-1">
              (auto-selected · typically lower cost than {selectedDrug.brandName})
            </span>
          </div>
        )}

        {/* Quick-picks */}
        <div>
          <p className="text-[11px] font-semibold text-[#5b6770] mb-1 uppercase tracking-wide">
            Common medications (quick-pick)
          </p>
          <div className="flex flex-wrap gap-1">
            {MED_SUGGESTIONS.map((m) => (
              <button
                key={m.code}
                type="button"
                onMouseDown={() => pickSuggestion(m)}
                className="text-[11px] px-2 py-0.5 border border-[#d5dce2] rounded-sm hover:border-[#2d4a63] hover:bg-[#f2f6f9] bg-white"
              >
                {m.display.split(' ').slice(0, 2).join(' ')}
              </button>
            ))}
          </div>
        </div>

        {/* RxNorm + NDC + Refills */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-[12px] font-semibold text-[#1a1a1a] mb-1">
              RxNorm Code <span className="text-[#5b6770] font-normal">(auto)</span>
            </label>
            <input
              className="w-full border border-[#b7c1ca] rounded-sm px-2.5 py-1.5 text-[12.5px] font-mono focus:outline-none focus:border-[#2d4a63]"
              placeholder="auto-filled"
              value={rxCode}
              onChange={(e) => setRxCode(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-[#1a1a1a] mb-1">
              NDC <span className="text-[#5b6770] font-normal">(auto)</span>
            </label>
            <input
              className="w-full border border-[#b7c1ca] rounded-sm px-2.5 py-1.5 text-[12.5px] font-mono focus:outline-none focus:border-[#2d4a63]"
              placeholder="auto-filled"
              value={ndcCode}
              onChange={(e) => setNdcCode(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-[#1a1a1a] mb-1">Refills</label>
            <input
              type="number"
              min="0"
              max="12"
              className="w-full border border-[#b7c1ca] rounded-sm px-2.5 py-1.5 text-[12.5px] focus:outline-none focus:border-[#2d4a63]"
              value={refills}
              onChange={(e) => setRefills(e.target.value)}
            />
          </div>
        </div>

        {/* Sig */}
        <div>
          <label className="block text-[12px] font-semibold text-[#1a1a1a] mb-1">
            Sig / Dosage Instructions <span className="text-[#5b6770] font-normal">(optional)</span>
          </label>
          <input
            className="w-full border border-[#b7c1ca] rounded-sm px-2.5 py-1.5 text-[12.5px] focus:outline-none focus:border-[#2d4a63]"
            placeholder="e.g. 1 tab daily with food"
            value={sig}
            onChange={(e) => setSig(e.target.value)}
          />
        </div>

        {/* Note */}
        <div>
          <label className="block text-[12px] font-semibold text-[#1a1a1a] mb-1">
            Note <span className="text-[#5b6770] font-normal">(optional)</span>
          </label>
          <textarea
            className="w-full border border-[#b7c1ca] rounded-sm px-2.5 py-1.5 text-[12.5px] min-h-[50px] focus:outline-none focus:border-[#2d4a63] resize-none"
            placeholder="Clinical notes about this medication…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {/* ── MTM Safety ── */}
        <MtmCheckStatus
          screeningInProgress={screeningInProgress}
          screeningPending={screeningPending}
          inputBlurred={inputBlurred}
          medName={medName}
          screeningDone={screeningDone}
          screeningStale={screeningStale}
          findings={mtmFindings}
          acknowledged={acknowledged}
          onAcknowledge={handleAcknowledge}
          onRunManual={() =>
            runMtmScreening({
              rxcui: rxCode.trim() || 'unknown',
              name: medName.trim(),
              isGeneric: true,
              suggestedSig: sig.trim(),
              ndcList: [],
            })
          }
        />
      </div>
    </ClinicalEntryModal>
  );
}
