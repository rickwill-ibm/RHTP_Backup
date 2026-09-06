'use client';
/**
 * AddAllergyForm — point-of-care AllergyIntolerance entry.
 *
 * Writes a FHIR R4 AllergyIntolerance with:
 *   clinicalStatus: active
 *   verificationStatus: confirmed
 *   patient: Patient/{patientId}
 *   recordedDate: today (Date of Service)
 *   recorder: Practitioner/{practitionerId}  (today's attending)
 *
 * After save, the PatientBanner allergy indicator updates automatically
 * because it uses useAllergies(patientId) which is refreshed by the caller.
 *
 * Works in both mock (in-memory store) and live (HAPI FHIR) modes.
 */
import React, { useState } from 'react';
import ClinicalEntryModal from './ClinicalEntryModal';
import { getFhirClient } from '@/lib/services/fhirClient';
import type { SmartLaunchContext } from '@/lib/smartFhirTypes';

const COMMON_ALLERGENS = [
  'Penicillin',
  'Amoxicillin',
  'Sulfonamides',
  'Aspirin',
  'Ibuprofen',
  'Codeine',
  'Morphine',
  'Latex',
  'Shellfish',
  'Peanuts',
  'Tree nuts',
  'Eggs',
  'Milk',
  'Soy',
  'Wheat',
];

const SEVERITY_OPTIONS = ['mild', 'moderate', 'severe'] as const;
const CRITICALITY_OPTIONS = ['low', 'high', 'unable-to-assess'] as const;
const CATEGORY_OPTIONS = ['food', 'medication', 'environment', 'biologic'] as const;

type Severity = (typeof SEVERITY_OPTIONS)[number];
type Criticality = (typeof CRITICALITY_OPTIONS)[number];
type Category = (typeof CATEGORY_OPTIONS)[number];

interface Props {
  patientId: string;
  launchContext: SmartLaunchContext;
  onSaved: (resourceId: string, display: string) => void;
  onCancel: () => void;
}

export default function AddAllergyForm({ patientId, launchContext, onSaved, onCancel }: Props) {
  const [substance, setSubstance] = useState('');
  const [category, setCategory] = useState<Category>('medication');
  const [reaction, setReaction] = useState('');
  const [severity, setSeverity] = useState<Severity>('moderate');
  const [criticality, setCriticality] = useState<Criticality>('low');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  async function handleSubmit() {
    if (!substance.trim()) {
      setError('Substance / allergen is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const resource = {
        resourceType: 'AllergyIntolerance',
        clinicalStatus: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
              code: 'active',
              display: 'Active',
            },
          ],
          text: 'Active',
        },
        verificationStatus: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
              code: 'confirmed',
              display: 'Confirmed',
            },
          ],
          text: 'Confirmed',
        },
        category: [category],
        criticality,
        code: {
          coding: [
            {
              system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
              display: substance.trim(),
            },
          ],
          text: substance.trim(),
        },
        patient: { reference: `Patient/${patientId}` },
        recordedDate: today,
        recorder: {
          reference: `Practitioner/${launchContext.practitionerId}`,
          display: launchContext.practitionerName,
        },
        reaction: reaction.trim()
          ? [
              {
                manifestation: [
                  {
                    coding: [{ display: reaction.trim() }],
                    text: reaction.trim(),
                  },
                ],
                severity,
              },
            ]
          : undefined,
      };
      const created = await getFhirClient().create<{ id?: string }>(resource);
      onSaved(created.id ?? 'unknown', substance.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ClinicalEntryModal
      title="Add Allergy / Intolerance"
      saving={saving}
      error={error}
      onCancel={onCancel}
      onSubmit={handleSubmit}
      submitLabel="Add Allergy → FHIR"
      submitDisabled={!substance.trim()}
    >
      <div className="text-[11.5px] text-[#5b6770] mb-1">
        Date of Service: <strong>{today}</strong> · Recorded by:{' '}
        <strong>{launchContext.practitionerName}</strong>
      </div>

      <div className="space-y-2.5">
        <div>
          <label className="block text-[12px] font-semibold text-[#1a1a1a] mb-1">
            Substance / Allergen <span className="text-[#c8102e]">*</span>
          </label>
          <input
            className="w-full border border-[#b7c1ca] rounded-sm px-2.5 py-1.5 text-[12.5px] focus:outline-none focus:border-[#2d4a63]"
            placeholder="e.g. Penicillin"
            value={substance}
            onChange={(e) => setSubstance(e.target.value)}
          />
        </div>

        <div>
          <p className="text-[11px] font-semibold text-[#5b6770] mb-1 uppercase tracking-wide">
            Common allergens
          </p>
          <div className="flex flex-wrap gap-1">
            {COMMON_ALLERGENS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setSubstance(a)}
                className="text-[11px] px-2 py-0.5 border border-[#d5dce2] rounded-sm hover:border-[#b30000] hover:bg-[#fff5f5] bg-white"
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[12px] font-semibold text-[#1a1a1a] mb-1">Category</label>
            <select
              className="w-full border border-[#b7c1ca] rounded-sm px-2.5 py-1.5 text-[12.5px] focus:outline-none focus:border-[#2d4a63] bg-white"
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
            >
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-[#1a1a1a] mb-1">
              Criticality
            </label>
            <select
              className="w-full border border-[#b7c1ca] rounded-sm px-2.5 py-1.5 text-[12.5px] focus:outline-none focus:border-[#2d4a63] bg-white"
              value={criticality}
              onChange={(e) => setCriticality(e.target.value as Criticality)}
            >
              {CRITICALITY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[12px] font-semibold text-[#1a1a1a] mb-1">
            Reaction / Manifestation <span className="text-[#5b6770] font-normal">(optional)</span>
          </label>
          <input
            className="w-full border border-[#b7c1ca] rounded-sm px-2.5 py-1.5 text-[12.5px] focus:outline-none focus:border-[#2d4a63]"
            placeholder="e.g. Anaphylaxis, Urticaria, Rash"
            value={reaction}
            onChange={(e) => setReaction(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-[12px] font-semibold text-[#1a1a1a] mb-1">Severity</label>
          <div className="flex gap-2">
            {SEVERITY_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSeverity(s)}
                className={`text-[12px] px-3 py-1 border rounded-sm capitalize ${
                  severity === s
                    ? s === 'severe'
                      ? 'bg-[#fdecea] border-[#c8102e] text-[#c8102e] font-bold'
                      : s === 'moderate'
                        ? 'bg-[#fff8ec] border-[#e8a33d] text-[#8a5300] font-semibold'
                        : 'bg-[#f0fff4] border-[#1e7e34] text-[#1e7e34] font-semibold'
                    : 'border-[#d5dce2] text-[#5b6770] bg-white hover:bg-[#f7f9fa]'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
    </ClinicalEntryModal>
  );
}
