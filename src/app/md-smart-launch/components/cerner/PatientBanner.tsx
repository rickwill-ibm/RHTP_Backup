'use client';
/**
 * Cerner PowerChart-style patient demographics banner.
 * Two rows, persistent at top. All content FHIR-fed:
 * Patient, Encounter, AllergyIntolerance, Flag, Coverage, Observation (wt/BMI).
 *
 * Flag gap-day computation: days are derived live from Flag.period.start so
 * the banner always shows the current age of a gap — no hardcoded numbers
 * in FHIR data.
 */
import React from 'react';
import {
  useAllergies,
  useCoverage,
  useEncounter,
  useFlags,
  usePatient,
  useVitals,
} from '@/lib/fhir/hooks';
import {
  ageFromDob,
  bannerName,
  ccText,
  fmtDate,
  quantityText,
  type FhirFlag,
  type FhirObservation,
} from '@/lib/fhir/types';

/**
 * Compute the number of whole days between a date string and today.
 * Returns undefined when the date is missing or unparseable.
 */
function daysOpen(dateStr: string | undefined): number | undefined {
  if (!dateStr) return undefined;
  const ms = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(ms / 86_400_000);
  return days >= 0 ? days : undefined;
}

/**
 * Build the banner label for a single Flag.
 * Appends " — X days" when Flag.period.start is present; otherwise renders
 * code.text verbatim so flags without a time anchor still display cleanly.
 */
function flagLabel(flag: FhirFlag): string {
  const base = ccText(flag.code);
  const days = daysOpen(flag.period?.start);
  return days !== undefined ? `${base} — ${days} days` : base;
}

interface PatientBannerProps {
  patientId: string;
  encounterId?: string;
  finNumber?: string;
  onOpenResource?: (resourceType: string, resourceId: string, label: string) => void;
}

function latestByLoinc(vitals: FhirObservation[], code: string): FhirObservation | undefined {
  return vitals.find((v) => v.code?.coding?.some((c) => c.code === code));
}

export default function PatientBanner({
  patientId,
  encounterId,
  finNumber,
  onOpenResource,
}: PatientBannerProps) {
  const { data: patient, loading } = usePatient(patientId);
  const { data: encounter } = useEncounter(encounterId);
  const { data: allergies } = useAllergies(patientId);
  const { data: flags } = useFlags(patientId);
  const { data: coverages } = useCoverage(patientId);
  const { data: vitals } = useVitals(patientId);

  const mrn = patient?.identifier?.find(
    (i) => i.type?.text === 'MRN' || i.system?.includes('mrn')
  )?.value;
  const age = ageFromDob(patient?.birthDate);
  const sex = patient?.gender
    ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1)
    : '—';
  const attending =
    encounter?.participant?.find((p) =>
      p.type?.some((t) => t.coding?.some((c) => c.code === 'ATND'))
    )?.individual?.display ?? encounter?.participant?.[0]?.individual?.display;
  const location = encounter?.location?.[0]?.location?.display;
  const weight = latestByLoinc(vitals, '29463-7');
  const bmi = latestByLoinc(vitals, '39156-5');

  const allergyText =
    allergies.length === 0
      ? 'No Known Allergies'
      : allergies
          .map((a) => {
            const sev = a.reaction?.[0]?.severity;
            return `${ccText(a.code)}${sev ? ` (${sev})` : ''}`;
          })
          .join(', ');

  if (loading && !patient) {
    return (
      <div className="w-full bg-[#2d4a63] text-white px-4 py-3 text-[13px]">Loading patient…</div>
    );
  }

  return (
    <div className="w-full shadow-sm" data-testid="patient-banner">
      {/* Row 1 — identity + allergies + flags */}
      <div className="bg-[#2d4a63] text-white px-4 py-1.5 flex items-center gap-x-5 flex-wrap text-[13px] leading-6">
        <button
          className="font-bold text-[15px] tracking-wide hover:underline"
          onClick={() =>
            onOpenResource?.('Patient', patientId, `Patient: ${bannerName(patient?.name)}`)
          }
          title="Open Patient resource"
        >
          {bannerName(patient?.name)}
        </button>
        <span>
          {age !== undefined ? `${age} years` : '—'} · {fmtDate(patient?.birthDate)}
        </span>
        <span>Sex: {sex}</span>
        <span>MRN: {mrn ?? '—'}</span>
        <span>FIN: {finNumber ?? encounterId ?? '—'}</span>
        <span
          className={allergies.length > 0 ? 'font-bold text-[#ffb3b8]' : 'text-[#cfe3cf]'}
          title="From AllergyIntolerance"
        >
          Allergies: {allergyText}
        </span>
        {flags.map((f) => (
          <button
            key={f.id}
            className="bg-[#fff4e5] text-[#8a5300] border border-[#e8a33d] rounded px-1.5 py-0 text-[11px] font-semibold leading-5 hover:brightness-95"
            onClick={() => f.id && onOpenResource?.('Flag', f.id, `Flag: ${flagLabel(f)}`)}
            title={flagLabel(f)}
          >
            ⚑ {flagLabel(f).split('—')[0].trim()}
          </button>
        ))}
      </div>
      {/* Row 2 — encounter context */}
      <div className="bg-[#3a5a77] text-white/95 px-4 py-1 flex items-center gap-x-5 flex-wrap text-[12px] leading-5">
        <span>Loc: {location ?? '—'}</span>
        <span>Attending: {attending ?? '—'}</span>
        <span>
          Enc: {encounter?.type?.[0] ? ccText(encounter.type[0]) : '—'}
          {encounter?.class?.display ? ` (${encounter.class.display})` : ''}
        </span>
        <span>Payer: {coverages[0] ? ccText(coverages[0].type) : '—'}</span>
        <span>Wt: {weight?.valueQuantity ? quantityText(weight.valueQuantity) : '—'}</span>
        <span>BMI: {bmi?.valueQuantity?.value ?? '—'}</span>
        <span>Visit: {encounter?.period?.start ? fmtDate(encounter.period.start) : '—'}</span>
      </div>
    </div>
  );
}
