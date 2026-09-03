'use client';
/**
 * Cerner PowerChart-style patient demographics banner.
 * Two rows, persistent at top. All content FHIR-fed:
 * Patient, Encounter, AllergyIntolerance, Flag, Coverage, Observation (wt/BMI).
 * Row 2 also shows $member-match status (Provider Access — CMS-0057-F).
 */
import React, { useEffect, useState } from 'react';
import {
  useAllergies,
  useCoverage,
  useEncounter,
  useFlags,
  usePatient,
  useVitals,
} from '@/lib/fhir/hooks';
import { getFhirClient } from '@/lib/services/fhirClient';
import {
  ageFromDob,
  bannerName,
  ccText,
  fmtDate,
  quantityText,
  type FhirObservation,
} from '@/lib/fhir/types';

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

  // ── CMS-0057-F Provider Access: $member-match status ─────────────────────
  const [memberMatchRef, setMemberMatchRef] = useState<string | null>(null);
  const [memberMatchPending, setMemberMatchPending] = useState(false);
  useEffect(() => {
    if (!patientId || !coverages.length) return;
    let cancelled = false;
    setMemberMatchPending(true);
    getFhirClient()
      .memberMatch({
        memberPatient: { resourceType: 'Patient', id: patientId },
        coverageToMatch: { id: coverages[0].id, resourceType: 'Coverage', beneficiary: { reference: `Patient/${patientId}` }, payor: coverages[0].payor },
        consentToAccess: {
          resourceType: 'Consent',
          status: 'active',
          patient: { reference: `Patient/${patientId}` },
          policy: [{ uri: 'http://hl7.org/fhir/us/davinci-hrex/StructureDefinition/hrex-consent' }],
          provision: { type: 'permit' },
        },
      })
      .then((ref) => { if (!cancelled) setMemberMatchRef(ref); })
      .catch(() => { if (!cancelled) setMemberMatchRef(null); })
      .finally(() => { if (!cancelled) setMemberMatchPending(false); });
    return () => { cancelled = true; };
  }, [patientId, coverages]);

  const mrn = patient?.identifier?.find((i) => i.type?.text === 'MRN' || i.system?.includes('mrn'))?.value;
  const age = ageFromDob(patient?.birthDate);
  const sex = patient?.gender ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1) : '—';
  const attending = encounter?.participant?.find((p) =>
    p.type?.some((t) => t.coding?.some((c) => c.code === 'ATND')),
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
      <div className="w-full bg-[#2d4a63] text-white px-4 py-3 text-[13px]">
        Loading patient…
      </div>
    );
  }

  return (
    <div className="w-full shadow-sm" data-testid="patient-banner">
      {/* Row 1 — identity + allergies + flags */}
      <div className="bg-[#2d4a63] text-white px-4 py-1.5 flex items-center gap-x-5 flex-wrap text-[13px] leading-6">
        <button
          className="font-bold text-[15px] tracking-wide hover:underline"
          onClick={() => onOpenResource?.('Patient', patientId, `Patient: ${bannerName(patient?.name)}`)}
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
          className={
            allergies.length > 0
              ? 'font-bold text-[#ffb3b8]'
              : 'text-[#cfe3cf]'
          }
          title="From AllergyIntolerance"
        >
          Allergies: {allergyText}
        </span>
        {flags.map((f) => (
          <button
            key={f.id}
            className="bg-[#fff4e5] text-[#8a5300] border border-[#e8a33d] rounded px-1.5 py-0 text-[11px] font-semibold leading-5 hover:brightness-95"
            onClick={() => f.id && onOpenResource?.('Flag', f.id, `Flag: ${ccText(f.code)}`)}
            title={ccText(f.code)}
          >
            ⚑ {ccText(f.code).split('—')[0].trim()}
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
        {/* CMS-0057-F Provider Access: $member-match chip */}
        {memberMatchPending && (
          <span className="text-white/60 text-[11px]">Member match…</span>
        )}
        {!memberMatchPending && memberMatchRef && (
          <span className="bg-[#1e7e34]/80 text-white text-[11px] px-1.5 rounded-sm border border-white/20" title={`$member-match: ${memberMatchRef}`}>
            Payer Match ✓
          </span>
        )}
        {!memberMatchPending && !memberMatchRef && coverages.length > 0 && (
          <span className="bg-white/10 text-white/70 text-[11px] px-1.5 rounded-sm border border-white/20" title="$member-match not confirmed">
            Match —
          </span>
        )}
      </div>
    </div>
  );
}
