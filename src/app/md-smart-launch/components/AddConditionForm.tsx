'use client';
/**
 * AddConditionForm — point-of-care Condition (Problem) entry.
 *
 * Writes a FHIR R4 Condition with:
 *   category: problem-list-item (persists to LPR)
 *   clinicalStatus: active
 *   recorder: Practitioner/{practitionerId}  (today's attending)
 *   recordedDate: today (Date of Service)
 *   encounter: Encounter/{encounterId}
 *
 * Works in both mock (in-memory store) and live (HAPI FHIR) modes.
 */
import React, { useState } from 'react';
import ClinicalEntryModal from './ClinicalEntryModal';
import { getFhirClient } from '@/lib/services/fhirClient';
import type { SmartLaunchContext } from '@/lib/smartFhirTypes';

// Curated ICD-10 quick-pick list for common encounter conditions
const ICD10_SUGGESTIONS = [
  { code: 'J06.9', display: 'Acute upper respiratory infection, unspecified' },
  { code: 'I10', display: 'Essential (primary) hypertension' },
  { code: 'E11.65', display: 'Type 2 diabetes mellitus with hyperglycemia' },
  { code: 'N18.32', display: 'Chronic kidney disease, stage 3b' },
  { code: 'I50.9', display: 'Heart failure, unspecified' },
  { code: 'J18.9', display: 'Pneumonia, unspecified organism' },
  { code: 'M54.5', display: 'Low back pain' },
  { code: 'F41.1', display: 'Generalized anxiety disorder' },
  { code: 'E66.9', display: 'Obesity, unspecified' },
  { code: 'Z59.0', display: 'Homelessness' },
];

interface Props {
  patientId: string;
  encounterId: string;
  launchContext: SmartLaunchContext;
  onSaved: (resourceId: string, display: string) => void;
  onCancel: () => void;
}

export default function AddConditionForm({
  patientId,
  encounterId,
  launchContext,
  onSaved,
  onCancel,
}: Props) {
  const [code, setCode] = useState('');
  const [display, setDisplay] = useState('');
  const [onset, setOnset] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  function pickSuggestion(s: { code: string; display: string }) {
    setCode(s.code);
    setDisplay(s.display);
  }

  async function handleSubmit() {
    if (!display.trim()) {
      setError('Problem description is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const resource = {
        resourceType: 'Condition',
        clinicalStatus: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
              code: 'active',
              display: 'Active',
            },
          ],
          text: 'Active',
        },
        verificationStatus: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
              code: 'confirmed',
              display: 'Confirmed',
            },
          ],
        },
        category: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/condition-category',
                code: 'problem-list-item',
                display: 'Problem List Item',
              },
            ],
            text: 'Problem List Item',
          },
        ],
        code: {
          coding: code.trim()
            ? [
                {
                  system: 'http://hl7.org/fhir/sid/icd-10-cm',
                  code: code.trim().toUpperCase(),
                  display: display.trim(),
                },
              ]
            : [],
          text: display.trim(),
        },
        subject: { reference: `Patient/${patientId}` },
        encounter: { reference: `Encounter/${encounterId}` },
        onsetDateTime: onset || undefined,
        recordedDate: today,
        recorder: {
          reference: `Practitioner/${launchContext.practitionerId}`,
          display: launchContext.practitionerName,
        },
        note: note.trim() ? [{ text: note.trim(), time: new Date().toISOString() }] : undefined,
      };
      const created = await getFhirClient().create<{ id?: string }>(resource);
      onSaved(created.id ?? 'unknown', display.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ClinicalEntryModal
      title="Add Problem to Problem List"
      saving={saving}
      error={error}
      onCancel={onCancel}
      onSubmit={handleSubmit}
      submitLabel="Add Problem → FHIR"
      submitDisabled={!display.trim()}
    >
      <div className="text-[11.5px] text-[#5b6770] mb-1">
        Date of Service: <strong>{today}</strong> · Attending:{' '}
        <strong>{launchContext.practitionerName}</strong>
      </div>

      <div className="space-y-2.5">
        <div>
          <label className="block text-[12px] font-semibold text-[#1a1a1a] mb-1">
            Problem Description <span className="text-[#c8102e]">*</span>
          </label>
          <input
            className="w-full border border-[#b7c1ca] rounded-sm px-2.5 py-1.5 text-[12.5px] focus:outline-none focus:border-[#2d4a63]"
            placeholder="e.g. Type 2 Diabetes Mellitus with hyperglycemia"
            value={display}
            onChange={(e) => setDisplay(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-[12px] font-semibold text-[#1a1a1a] mb-1">
            ICD-10 Code <span className="text-[#5b6770] font-normal">(optional)</span>
          </label>
          <input
            className="w-full border border-[#b7c1ca] rounded-sm px-2.5 py-1.5 text-[12.5px] font-mono focus:outline-none focus:border-[#2d4a63] uppercase"
            placeholder="e.g. E11.65"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </div>

        <div>
          <p className="text-[11px] font-semibold text-[#5b6770] mb-1 uppercase tracking-wide">
            Quick-pick ICD-10
          </p>
          <div className="flex flex-wrap gap-1">
            {ICD10_SUGGESTIONS.map((s) => (
              <button
                key={s.code}
                type="button"
                onClick={() => pickSuggestion(s)}
                className="text-[11px] px-2 py-0.5 border border-[#d5dce2] rounded-sm hover:border-[#2d4a63] hover:bg-[#f2f6f9] bg-white"
              >
                {s.code}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[12px] font-semibold text-[#1a1a1a] mb-1">
            Onset Date <span className="text-[#5b6770] font-normal">(optional)</span>
          </label>
          <input
            type="date"
            className="border border-[#b7c1ca] rounded-sm px-2.5 py-1.5 text-[12.5px] focus:outline-none focus:border-[#2d4a63]"
            value={onset}
            onChange={(e) => setOnset(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-[12px] font-semibold text-[#1a1a1a] mb-1">
            Clinical Note <span className="text-[#5b6770] font-normal">(optional)</span>
          </label>
          <textarea
            className="w-full border border-[#b7c1ca] rounded-sm px-2.5 py-1.5 text-[12.5px] min-h-[60px] focus:outline-none focus:border-[#2d4a63] resize-none"
            placeholder="Additional clinical context…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>
    </ClinicalEntryModal>
  );
}
