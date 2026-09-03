'use client';
/**
 * Provider View — Chart Review column.
 * Reason for Visit, Problem List, Home Medications, Allergies,
 * Vitals & Measurements, Results, Visits. All FHIR-fed.
 */
import React from 'react';
import MPageCard from './MPageCard';
import { interpChip, statusTextCls } from './theme';
import {
  useActiveMedications,
  useAllergies,
  useEncounter,
  useEncounterDiagnoses,
  useEncounterHistory,
  useLabs,
  useProblemList,
  useVitals,
} from '@/lib/fhir/hooks';
import {
  adherencePdc,
  ccText,
  codeOf,
  fmtDate,
  interpCode,
  quantityText,
  type FhirObservation,
} from '@/lib/fhir/types';

export interface OpenResourceFn {
  (resourceType: string, resourceId: string, label: string): void;
}

interface ReviewColumnProps {
  patientId: string;
  encounterId?: string;
  onOpenResource: OpenResourceFn;
  onMarkReviewed: (what: string, resourceIds: string[]) => void;
  reviewed: Record<string, boolean>;
}

function vitalDisplay(v: FhirObservation): string {
  if (v.component?.length) {
    const sys = v.component.find((c) => codeOf(c.code) === '8480-6')?.valueQuantity?.value;
    const dia = v.component.find((c) => codeOf(c.code) === '8462-4')?.valueQuantity?.value;
    if (sys !== undefined && dia !== undefined) return `${sys}/${dia} mmHg`;
  }
  return quantityText(v.valueQuantity) !== '—'
    ? quantityText(v.valueQuantity)
    : ccText(v.valueCodeableConcept);
}

function ReviewedButton({
  label,
  done,
  onClick,
}: {
  label: string;
  done: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={done}
      className={`text-[10.5px] px-1.5 rounded-sm border leading-4 mr-1 ${
        done
          ? 'bg-[#e6f4ea] text-[#1e7e34] border-[#1e7e34] cursor-default'
          : 'bg-white text-[#00539b] border-[#00539b] hover:bg-[#eaf3fb]'
      }`}
      title={done ? 'Reviewed this visit' : `Mark ${label} reviewed`}
    >
      {done ? '✓ Reviewed' : 'Mark Reviewed'}
    </button>
  );
}

export default function ProviderViewReview({
  patientId,
  encounterId,
  onOpenResource,
  onMarkReviewed,
  reviewed,
}: ReviewColumnProps) {
  const { data: encounter, fetchedAt: encAt } = useEncounter(encounterId);
  const dx = useEncounterDiagnoses(patientId, encounterId);
  const problems = useProblemList(patientId);
  const meds = useActiveMedications(patientId);
  const allergies = useAllergies(patientId);
  const vitals = useVitals(patientId);
  const labs = useLabs(patientId);
  const visits = useEncounterHistory(patientId);

  // Latest instance of each vital sign
  const latestVitals: FhirObservation[] = [];
  const seenVital = new Set<string>();
  for (const v of vitals.data) {
    const code = codeOf(v.code) ?? ccText(v.code);
    if (!seenVital.has(code)) {
      seenVital.add(code);
      latestVitals.push(v);
    }
  }

  // Latest instance of each lab
  const latestLabs: FhirObservation[] = [];
  const seenLab = new Set<string>();
  for (const l of labs.data) {
    const code = codeOf(l.code) ?? ccText(l.code);
    if (!seenLab.has(code)) {
      seenLab.add(code);
      latestLabs.push(l);
    }
  }

  const clinicalProblems = problems.data.filter(
    (p) => !p.code?.coding?.some((c) => c.code?.startsWith('Z')),
  );
  const sdohProblems = problems.data.filter((p) =>
    p.code?.coding?.some((c) => c.code?.startsWith('Z')),
  );

  return (
    <div>
      {/* ── Reason for Visit ── */}
      <MPageCard title="Chief Complaint / Reason for Visit" fetchedAt={encAt}>
        <div className="px-3 py-1.5">
          {(encounter?.reasonCode ?? []).length === 0 ? (
            <span className="italic text-[#5b6770]">No reason for visit documented</span>
          ) : (
            (encounter?.reasonCode ?? []).map((rc, i) => (
              <div key={i} className={i === 0 ? 'font-semibold' : ''}>
                {i === 0 ? '• ' : '• '}
                {ccText(rc)}
              </div>
            ))
          )}
          {dx.data.length > 0 && (
            <div className="mt-1 pt-1 border-t border-[#e2e7eb] text-[#5b6770]">
              Visit dx:{' '}
              {dx.data.map((d, i) => (
                <button
                  key={d.id}
                  className="text-[#00539b] hover:underline"
                  onClick={() => d.id && onOpenResource('Condition', d.id, ccText(d.code))}
                >
                  {ccText(d.code)}
                  {i < dx.data.length - 1 ? '; ' : ''}
                </button>
              ))}
            </div>
          )}
        </div>
      </MPageCard>

      {/* ── Problem List ── */}
      <MPageCard
        title="Problem List"
        count={problems.data.length}
        fetchedAt={problems.fetchedAt}
        loading={problems.loading}
        error={problems.error}
        onRefresh={problems.refresh}
        actions={
          <ReviewedButton
            label="problems"
            done={!!reviewed.problems}
            onClick={() =>
              onMarkReviewed('Problem List', problems.data.map((p) => p.id ?? ''))
            }
          />
        }
      >
        <table className="w-full">
          <tbody>
            {clinicalProblems.map((p) => (
              <tr key={p.id} className="border-b border-[#eef1f4] last:border-0 align-top">
                <td className="px-3 py-1">
                  <button
                    className="text-[#00539b] hover:underline font-medium text-left"
                    onClick={() => p.id && onOpenResource('Condition', p.id, ccText(p.code))}
                  >
                    {ccText(p.code)}
                  </button>
                  {p.note?.[0]?.text && (
                    <div className="text-[11.5px] text-[#5b6770]">{p.note[0].text}</div>
                  )}
                </td>
                <td className="px-2 py-1 text-right whitespace-nowrap text-[#5b6770] text-[11.5px]">
                  Onset {fmtDate(p.onsetDateTime)}
                </td>
              </tr>
            ))}
            {sdohProblems.length > 0 && (
              <tr>
                <td colSpan={2} className="px-3 py-1 bg-[#fbf7ef]">
                  <span className="text-[10.5px] font-bold uppercase text-[#8a5300] mr-2">SDOH</span>
                  {sdohProblems.map((p, i) => (
                    <button
                      key={p.id}
                      className="text-[#8a5300] hover:underline text-[11.5px]"
                      onClick={() => p.id && onOpenResource('Condition', p.id, ccText(p.code))}
                    >
                      {ccText(p.code)}
                      {i < sdohProblems.length - 1 ? '; ' : ''}
                    </button>
                  ))}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </MPageCard>

      {/* ── Home Medications ── */}
      <MPageCard
        title="Home Medications"
        count={meds.data.length}
        fetchedAt={meds.fetchedAt}
        loading={meds.loading}
        error={meds.error}
        onRefresh={meds.refresh}
        actions={
          <ReviewedButton
            label="medications"
            done={!!reviewed.medications}
            onClick={() => onMarkReviewed('Medication List', meds.data.map((m) => m.id ?? ''))}
          />
        }
      >
        <table className="w-full">
          <tbody>
            {meds.data.map((m) => {
              const pdc = adherencePdc(m);
              const lowAdherence = pdc !== undefined && pdc < 70;
              return (
                <tr key={m.id} className="border-b border-[#eef1f4] last:border-0">
                  <td className="px-3 py-1">
                    <button
                      className={`hover:underline text-left ${statusTextCls(m.status)} text-[#00539b]`}
                      onClick={() =>
                        m.id &&
                        onOpenResource('MedicationRequest', m.id, ccText(m.medicationCodeableConcept))
                      }
                    >
                      {ccText(m.medicationCodeableConcept)}
                    </button>
                    <div className="text-[11.5px] text-[#5b6770]">
                      {m.dosageInstruction?.[0]?.text} · {m.requester?.display}
                    </div>
                  </td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">
                    {pdc !== undefined && (
                      <span
                        className={`text-[11px] px-1.5 rounded-sm border font-semibold ${
                          lowAdherence
                            ? 'bg-[#fdecea] text-[#c8102e] border-[#c8102e]'
                            : 'bg-[#eef6ee] text-[#1e7e34] border-[#9fce9f]'
                        }`}
                        title="Adherence — proportion of days covered"
                      >
                        PDC {pdc}%
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </MPageCard>

      {/* ── Allergies ── */}
      <MPageCard
        title="Allergies"
        count={allergies.data.length}
        fetchedAt={allergies.fetchedAt}
        loading={allergies.loading}
        error={allergies.error}
        onRefresh={allergies.refresh}
      >
        {allergies.data.length === 0 ? (
          <div className="px-3 py-1.5 text-[#1e7e34]">No Known Allergies</div>
        ) : (
          <table className="w-full">
            <tbody>
              {allergies.data.map((a) => (
                <tr key={a.id} className="border-b border-[#eef1f4] last:border-0">
                  <td className="px-3 py-1">
                    <button
                      className="text-[#b30000] font-semibold hover:underline"
                      onClick={() =>
                        a.id && onOpenResource('AllergyIntolerance', a.id, ccText(a.code))
                      }
                    >
                      {ccText(a.code)}
                    </button>
                  </td>
                  <td className="px-2 py-1 text-[11.5px] text-[#5b6770]">
                    {a.reaction?.[0]?.manifestation?.map((m) => ccText(m)).join(', ')}
                  </td>
                  <td className="px-2 py-1 text-right text-[11.5px]">
                    <span
                      className={
                        a.reaction?.[0]?.severity === 'severe'
                          ? 'text-[#c8102e] font-bold'
                          : 'text-[#5b6770]'
                      }
                    >
                      {a.reaction?.[0]?.severity ?? a.criticality}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </MPageCard>

      {/* ── Vitals ── */}
      <MPageCard
        title="Vitals & Measurements"
        fetchedAt={vitals.fetchedAt}
        loading={vitals.loading}
        error={vitals.error}
        onRefresh={vitals.refresh}
      >
        <table className="w-full">
          <tbody>
            {latestVitals.map((v) => {
              const chip = interpChip(interpCode(v));
              return (
                <tr key={v.id} className="border-b border-[#eef1f4] last:border-0">
                  <td className="px-3 py-1">
                    <button
                      className="text-[#00539b] hover:underline"
                      onClick={() => v.id && onOpenResource('Observation', v.id, ccText(v.code))}
                    >
                      {ccText(v.code)}
                    </button>
                  </td>
                  <td className="px-2 py-1 font-semibold whitespace-nowrap">
                    {vitalDisplay(v)}
                    {chip && (
                      <span className={`ml-1.5 text-[10.5px] px-1 rounded-sm ${chip.cls}`}>
                        {chip.label}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1 text-right text-[11.5px] text-[#5b6770] whitespace-nowrap">
                    {fmtDate(v.effectiveDateTime)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </MPageCard>

      {/* ── Results ── */}
      <MPageCard
        title="Results — Recent Labs"
        count={latestLabs.length}
        fetchedAt={labs.fetchedAt}
        loading={labs.loading}
        error={labs.error}
        onRefresh={labs.refresh}
        actions={
          <ReviewedButton
            label="results"
            done={!!reviewed.results}
            onClick={() => onMarkReviewed('Results', labs.data.map((l) => l.id ?? ''))}
          />
        }
      >
        <table className="w-full">
          <tbody>
            {latestLabs.map((l) => {
              const chip = interpChip(interpCode(l));
              const critical = interpCode(l) === 'C' || interpCode(l) === 'HH';
              return (
                <tr
                  key={l.id}
                  className={`border-b border-[#eef1f4] last:border-0 ${
                    critical ? 'bg-[#fdecea]' : ''
                  }`}
                >
                  <td className="px-3 py-1">
                    <button
                      className="text-[#00539b] hover:underline"
                      onClick={() => l.id && onOpenResource('Observation', l.id, ccText(l.code))}
                    >
                      {ccText(l.code)}
                    </button>
                  </td>
                  <td className="px-2 py-1 font-semibold whitespace-nowrap">
                    {quantityText(l.valueQuantity)}
                    {chip && (
                      <span className={`ml-1.5 text-[10.5px] px-1 rounded-sm ${chip.cls}`}>
                        {chip.label}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1 text-[11.5px] text-[#5b6770] whitespace-nowrap">
                    Ref {l.referenceRange?.[0]?.text ?? '—'}
                  </td>
                  <td className="px-2 py-1 text-right text-[11.5px] text-[#5b6770] whitespace-nowrap">
                    {fmtDate(l.effectiveDateTime)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </MPageCard>

      {/* ── Visits ── */}
      <MPageCard
        title="Visits"
        count={visits.data.length}
        fetchedAt={visits.fetchedAt}
        loading={visits.loading}
        error={visits.error}
        onRefresh={visits.refresh}
        defaultCollapsed
      >
        <table className="w-full">
          <tbody>
            {visits.data.map((e) => {
              const isEr = e.class?.code === 'EMER';
              return (
                <tr key={e.id} className="border-b border-[#eef1f4] last:border-0">
                  <td className="px-3 py-1 whitespace-nowrap text-[11.5px] text-[#5b6770]">
                    {fmtDate(e.period?.start)}
                  </td>
                  <td className="px-2 py-1">
                    <button
                      className={`hover:underline ${isEr ? 'text-[#c8102e] font-semibold' : 'text-[#00539b]'}`}
                      onClick={() =>
                        e.id && onOpenResource('Encounter', e.id, ccText(e.type?.[0]))
                      }
                    >
                      {isEr ? 'ED — ' : ''}
                      {e.reasonCode?.[0] ? ccText(e.reasonCode[0]) : ccText(e.type?.[0])}
                    </button>
                  </td>
                  <td className="px-2 py-1 text-right text-[11.5px] text-[#5b6770]">
                    {e.serviceProvider?.display}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </MPageCard>
    </div>
  );
}
