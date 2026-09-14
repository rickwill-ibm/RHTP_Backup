'use client';
/**
 * Cerner-style chart menu pages — Results Review (with trends),
 * Medication List, Problems & Diagnoses, Allergies, Vital Signs,
 * Documentation, Histories, Immunizations, Care Plan.
 * All FHIR-fed via the domain hooks.
 */
import React, { useMemo, useState } from 'react';
import AddConditionForm from '../AddConditionForm';
import AddAllergyForm from '../AddAllergyForm';
import AddMedicationForm from '../AddMedicationForm';
import { mapAllergiesToMtm } from '@/lib/agents/mtm/allergyMapper';
import type { SmartLaunchContext } from '@/lib/smartFhirTypes';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import MPageCard from './MPageCard';
import { interpChip, statusTextCls } from './theme';
import {
  useActiveMedications,
  useAllergies,
  useCarePlans,
  useCoverageAll,
  useDiagnosticReports,
  useDocuments,
  useEncounterHistory,
  useExplanationOfBenefit,
  useClaimResponses,
  useFamilyHistory,
  useGoals,
  useImmunizations,
  useLabs,
  useObservationTrend,
  useProblemList,
  useProcedures,
  useVitals,
} from '@/lib/fhir/hooks';
import {
  adherencePdc,
  ccText,
  codeOf,
  fmtDate,
  interpCode,
  quantityText,
  type FhirCoverage,
  type FhirExplanationOfBenefit,
  type FhirClaimResponse,
  type FhirObservation,
} from '@/lib/fhir/types';

type OpenResourceFn = (resourceType: string, resourceId: string, label: string) => void;

interface PageProps {
  patientId: string;
  onOpenResource: OpenResourceFn;
  /** Optional — required only for write-capable pages */
  launchContext?: SmartLaunchContext;
  encounterId?: string;
  onClinicalWrite?: (
    kind: 'condition-added' | 'allergy-added' | 'medication-added',
    display: string,
    resourceId: string
  ) => void;
}

// ── Results Review ───────────────────────────────────────────────────────────

const TRENDABLE = [
  { code: '4548-4', label: 'HbA1c', target: 8.0, unit: '%' },
  { code: '62238-1', label: 'eGFR', target: 60, unit: 'mL/min' },
];

function TrendChart({
  patientId,
  code,
  label,
  target,
  unit,
}: {
  patientId: string;
  code: string;
  label: string;
  target: number;
  unit: string;
}) {
  const trend = useObservationTrend(patientId, code);
  const points = useMemo(
    () =>
      [...trend.data]
        .filter((o) => o.valueQuantity?.value !== undefined)
        .sort((a, b) => (a.effectiveDateTime ?? '').localeCompare(b.effectiveDateTime ?? ''))
        .map((o) => ({
          date: fmtDate(o.effectiveDateTime),
          value: o.valueQuantity!.value!,
        })),
    [trend.data]
  );
  if (trend.loading) return <div className="px-3 py-2 italic text-[#5b6770]">Loading trend…</div>;
  if (points.length < 2) return null;
  return (
    <div className="px-2 py-1">
      <div className="text-[11.5px] font-semibold text-[#33404a] px-1">
        {label} trend ({unit}) — target {target}
      </div>
      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: -18 }}>
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
            <Tooltip contentStyle={{ fontSize: 11 }} />
            <ReferenceLine y={target} stroke="#1e7e34" strokeDasharray="4 3" />
            <Line type="monotone" dataKey="value" stroke="#2d4a63" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function ResultsReviewPage({ patientId, onOpenResource }: PageProps) {
  const labs = useLabs(patientId);
  const reports = useDiagnosticReports(patientId);
  const [filter, setFilter] = useState<'all' | 'abnormal'>('all');

  const rows = labs.data.filter((l) => (filter === 'abnormal' ? !!interpCode(l) : true));

  return (
    <div>
      <MPageCard
        title="Results Review — Laboratory"
        count={rows.length}
        fetchedAt={labs.fetchedAt}
        loading={labs.loading}
        error={labs.error}
        onRefresh={labs.refresh}
        actions={
          <button
            className="text-[11px] px-2 rounded-sm bg-white/15 border border-white/40 text-white hover:bg-white/25 leading-5"
            onClick={() => setFilter((f) => (f === 'all' ? 'abnormal' : 'all'))}
          >
            {filter === 'all' ? 'Abnormal only' : 'Show all'}
          </button>
        }
      >
        <table className="w-full">
          <thead>
            <tr className="text-left text-[11px] uppercase text-[#5b6770] border-b border-[#d5dce2]">
              <th className="px-3 py-1 font-semibold">Test</th>
              <th className="px-2 py-1 font-semibold">Result</th>
              <th className="px-2 py-1 font-semibold">Ref Range</th>
              <th className="px-2 py-1 font-semibold">Performer</th>
              <th className="px-2 py-1 font-semibold text-right">Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => {
              const chip = interpChip(interpCode(l));
              return (
                <tr key={l.id} className="border-b border-[#eef1f4] last:border-0">
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
                  <td className="px-2 py-1 text-[11.5px] text-[#5b6770]">
                    {l.referenceRange?.[0]?.text ?? '—'}
                  </td>
                  <td className="px-2 py-1 text-[11.5px] text-[#5b6770]">
                    {l.performer?.[0]?.display ?? '—'}
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

      <MPageCard title="Trends">
        {TRENDABLE.map((t) => (
          <TrendChart key={t.code} patientId={patientId} {...t} />
        ))}
      </MPageCard>

      <MPageCard
        title="Diagnostic Reports"
        count={reports.data.length}
        fetchedAt={reports.fetchedAt}
        loading={reports.loading}
        error={reports.error}
        onRefresh={reports.refresh}
      >
        <table className="w-full">
          <tbody>
            {reports.data.map((r) => (
              <tr key={r.id} className="border-b border-[#eef1f4] last:border-0 align-top">
                <td className="px-3 py-1">
                  <button
                    className="text-[#00539b] hover:underline"
                    onClick={() => r.id && onOpenResource('DiagnosticReport', r.id, ccText(r.code))}
                  >
                    {ccText(r.code)}
                  </button>
                  {r.conclusion && (
                    <div className="text-[11.5px] text-[#5b6770]">{r.conclusion}</div>
                  )}
                </td>
                <td className="px-2 py-1 text-right text-[11.5px] text-[#5b6770] whitespace-nowrap">
                  {fmtDate(r.effectiveDateTime)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </MPageCard>
    </div>
  );
}

// ── Medication List ──────────────────────────────────────────────────────────

export function MedicationListPage({
  patientId,
  onOpenResource,
  launchContext,
  encounterId,
  onClinicalWrite,
}: PageProps) {
  const meds = useActiveMedications(patientId);
  const allergies = useAllergies(patientId);
  const [showAdd, setShowAdd] = useState(false);
  return (
    <>
      {showAdd && launchContext && (
        <AddMedicationForm
          patientId={patientId}
          encounterId={encounterId ?? ''}
          launchContext={launchContext}
          currentMedications={meds.data.map((m) => ({
            rxcui: m.medicationCodeableConcept?.coding?.[0]?.code ?? '',
            name:
              m.medicationCodeableConcept?.text ??
              m.medicationCodeableConcept?.coding?.[0]?.display ??
              '',
            lastFillDate: m.authoredOn,
          }))}
          allergies={mapAllergiesToMtm(allergies.data)}
          onSaved={(id, display) => {
            meds.refresh();
            onClinicalWrite?.('medication-added', display, id);
            setShowAdd(false);
          }}
          onCancel={() => setShowAdd(false)}
        />
      )}
      <MPageCard
        title="Medication List — Active"
        count={meds.data.length}
        fetchedAt={meds.fetchedAt}
        loading={meds.loading}
        error={meds.error}
        onRefresh={meds.refresh}
        actions={
          launchContext ? (
            <button
              className="text-[11px] px-2 rounded-sm bg-white/15 border border-white/40 text-white hover:bg-white/25 leading-5"
              onClick={() => setShowAdd(true)}
            >
              + Add Med
            </button>
          ) : undefined
        }
      >
        <table className="w-full">
          <thead>
            <tr className="text-left text-[11px] uppercase text-[#5b6770] border-b border-[#d5dce2]">
              <th className="px-3 py-1 font-semibold">Medication</th>
              <th className="px-2 py-1 font-semibold">Sig</th>
              <th className="px-2 py-1 font-semibold">Prescriber</th>
              <th className="px-2 py-1 font-semibold">Start</th>
              <th className="px-2 py-1 font-semibold">Refills</th>
              <th className="px-2 py-1 font-semibold text-right">Adherence</th>
            </tr>
          </thead>
          <tbody>
            {meds.data.map((m) => {
              const pdc = adherencePdc(m);
              return (
                <tr key={m.id} className="border-b border-[#eef1f4] last:border-0">
                  <td className="px-3 py-1">
                    <button
                      className={`hover:underline text-left text-[#00539b] ${statusTextCls(m.status)}`}
                      onClick={() =>
                        m.id &&
                        onOpenResource(
                          'MedicationRequest',
                          m.id,
                          ccText(m.medicationCodeableConcept)
                        )
                      }
                    >
                      {ccText(m.medicationCodeableConcept)}
                    </button>
                  </td>
                  <td className="px-2 py-1">{m.dosageInstruction?.[0]?.text ?? '—'}</td>
                  <td className="px-2 py-1 text-[11.5px]">{m.requester?.display ?? '—'}</td>
                  <td className="px-2 py-1 text-[11.5px] whitespace-nowrap">
                    {fmtDate(m.authoredOn)}
                  </td>
                  <td className="px-2 py-1 text-[11.5px]">
                    {m.dispenseRequest?.numberOfRepeatsAllowed ?? '—'}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {pdc !== undefined && (
                      <span
                        className={`text-[11px] px-1.5 rounded-sm border font-semibold ${
                          pdc < 70
                            ? 'bg-[#fdecea] text-[#c8102e] border-[#c8102e]'
                            : 'bg-[#eef6ee] text-[#1e7e34] border-[#9fce9f]'
                        }`}
                      >
                        {pdc}%
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </MPageCard>
    </>
  );
}

// ── Problems & Diagnoses ─────────────────────────────────────────────────────

export function ProblemsPage({
  patientId,
  onOpenResource,
  launchContext,
  encounterId,
  onClinicalWrite,
}: PageProps) {
  const problems = useProblemList(patientId);
  const [showAdd, setShowAdd] = useState(false);
  return (
    <>
      {showAdd && launchContext && (
        <AddConditionForm
          patientId={patientId}
          encounterId={encounterId ?? ''}
          launchContext={launchContext}
          onSaved={(id, display) => {
            problems.refresh();
            onClinicalWrite?.('condition-added', display, id);
            setShowAdd(false);
          }}
          onCancel={() => setShowAdd(false)}
        />
      )}
      <MPageCard
        title="Problems and Diagnoses"
        count={problems.data.length}
        fetchedAt={problems.fetchedAt}
        loading={problems.loading}
        error={problems.error}
        onRefresh={problems.refresh}
        actions={
          launchContext ? (
            <button
              className="text-[11px] px-2 rounded-sm bg-white/15 border border-white/40 text-white hover:bg-white/25 leading-5"
              onClick={() => setShowAdd(true)}
            >
              + Add Problem
            </button>
          ) : undefined
        }
      >
        <table className="w-full">
          <thead>
            <tr className="text-left text-[11px] uppercase text-[#5b6770] border-b border-[#d5dce2]">
              <th className="px-3 py-1 font-semibold">Problem</th>
              <th className="px-2 py-1 font-semibold">ICD-10</th>
              <th className="px-2 py-1 font-semibold">Onset</th>
              <th className="px-2 py-1 font-semibold">Status</th>
              <th className="px-2 py-1 font-semibold">Notes</th>
            </tr>
          </thead>
          <tbody>
            {problems.data.map((p) => (
              <tr key={p.id} className="border-b border-[#eef1f4] last:border-0 align-top">
                <td className="px-3 py-1">
                  <button
                    className="text-[#00539b] hover:underline text-left font-medium"
                    onClick={() => p.id && onOpenResource('Condition', p.id, ccText(p.code))}
                  >
                    {ccText(p.code)}
                  </button>
                </td>
                <td className="px-2 py-1 font-mono text-[11.5px]">
                  {codeOf(p.code, 'http://hl7.org/fhir/sid/icd-10-cm') ?? '—'}
                </td>
                <td className="px-2 py-1 text-[11.5px] whitespace-nowrap">
                  {fmtDate(p.onsetDateTime)}
                </td>
                <td className="px-2 py-1 text-[11.5px]">{ccText(p.clinicalStatus)}</td>
                <td className="px-2 py-1 text-[11.5px] text-[#5b6770]">
                  {p.note?.[0]?.text ?? ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </MPageCard>
    </>
  );
}

// ── Allergies ────────────────────────────────────────────────────────────────

export function AllergiesPage({
  patientId,
  onOpenResource,
  launchContext,
  onClinicalWrite,
}: PageProps) {
  const allergies = useAllergies(patientId);
  const [showAdd, setShowAdd] = useState(false);
  return (
    <>
      {showAdd && launchContext && (
        <AddAllergyForm
          patientId={patientId}
          launchContext={launchContext}
          onSaved={(id, display) => {
            allergies.refresh();
            onClinicalWrite?.('allergy-added', display, id);
            setShowAdd(false);
          }}
          onCancel={() => setShowAdd(false)}
        />
      )}
      <MPageCard
        title="Allergies"
        count={allergies.data.length}
        fetchedAt={allergies.fetchedAt}
        loading={allergies.loading}
        error={allergies.error}
        onRefresh={allergies.refresh}
        actions={
          launchContext ? (
            <button
              className="text-[11px] px-2 rounded-sm bg-white/15 border border-white/40 text-white hover:bg-white/25 leading-5"
              onClick={() => setShowAdd(true)}
            >
              + Add Allergy
            </button>
          ) : undefined
        }
      >
        <table className="w-full">
          <thead>
            <tr className="text-left text-[11px] uppercase text-[#5b6770] border-b border-[#d5dce2]">
              <th className="px-3 py-1 font-semibold">Substance</th>
              <th className="px-2 py-1 font-semibold">Category</th>
              <th className="px-2 py-1 font-semibold">Reaction</th>
              <th className="px-2 py-1 font-semibold">Severity</th>
              <th className="px-2 py-1 font-semibold text-right">Recorded</th>
            </tr>
          </thead>
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
                <td className="px-2 py-1 text-[11.5px]">{a.category?.join(', ') ?? '—'}</td>
                <td className="px-2 py-1 text-[11.5px]">
                  {a.reaction?.[0]?.manifestation?.map((m) => ccText(m)).join(', ') ?? '—'}
                </td>
                <td className="px-2 py-1">
                  <span
                    className={
                      a.reaction?.[0]?.severity === 'severe'
                        ? 'text-[#c8102e] font-bold'
                        : 'text-[#5b6770]'
                    }
                  >
                    {a.reaction?.[0]?.severity ?? a.criticality ?? '—'}
                  </span>
                </td>
                <td className="px-2 py-1 text-right text-[11.5px] text-[#5b6770]">
                  {fmtDate(a.recordedDate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </MPageCard>
    </>
  );
}

// ── Vital Signs ──────────────────────────────────────────────────────────────

function vitalValue(v: FhirObservation): string {
  if (v.component?.length) {
    const sys = v.component.find((c) => codeOf(c.code) === '8480-6')?.valueQuantity?.value;
    const dia = v.component.find((c) => codeOf(c.code) === '8462-4')?.valueQuantity?.value;
    if (sys !== undefined && dia !== undefined) return `${sys}/${dia} mmHg`;
  }
  return quantityText(v.valueQuantity);
}

export function VitalsPage({ patientId, onOpenResource }: PageProps) {
  const vitals = useVitals(patientId);
  return (
    <MPageCard
      title="Vital Signs"
      count={vitals.data.length}
      fetchedAt={vitals.fetchedAt}
      loading={vitals.loading}
      error={vitals.error}
      onRefresh={vitals.refresh}
    >
      <table className="w-full">
        <thead>
          <tr className="text-left text-[11px] uppercase text-[#5b6770] border-b border-[#d5dce2]">
            <th className="px-3 py-1 font-semibold">Vital</th>
            <th className="px-2 py-1 font-semibold">Value</th>
            <th className="px-2 py-1 font-semibold">Ref</th>
            <th className="px-2 py-1 font-semibold text-right">Date/Time</th>
          </tr>
        </thead>
        <tbody>
          {vitals.data.map((v) => {
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
                  {vitalValue(v)}
                  {chip && (
                    <span className={`ml-1.5 text-[10.5px] px-1 rounded-sm ${chip.cls}`}>
                      {chip.label}
                    </span>
                  )}
                </td>
                <td className="px-2 py-1 text-[11.5px] text-[#5b6770]">
                  {v.referenceRange?.[0]?.text ?? '—'}
                </td>
                <td className="px-2 py-1 text-right text-[11.5px] text-[#5b6770] whitespace-nowrap">
                  {v.effectiveDateTime
                    ? new Date(v.effectiveDateTime).toLocaleString('en-US', {
                        month: '2-digit',
                        day: '2-digit',
                        year: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </MPageCard>
  );
}

// ── Documentation ────────────────────────────────────────────────────────────

export function DocumentationPage({ patientId, onOpenResource }: PageProps) {
  const docs = useDocuments(patientId);
  return (
    <MPageCard
      title="Documentation"
      count={docs.data.length}
      fetchedAt={docs.fetchedAt}
      loading={docs.loading}
      error={docs.error}
      onRefresh={docs.refresh}
    >
      <table className="w-full">
        <thead>
          <tr className="text-left text-[11px] uppercase text-[#5b6770] border-b border-[#d5dce2]">
            <th className="px-3 py-1 font-semibold">Document</th>
            <th className="px-2 py-1 font-semibold">Author</th>
            <th className="px-2 py-1 font-semibold">Description</th>
            <th className="px-2 py-1 font-semibold text-right">Date</th>
          </tr>
        </thead>
        <tbody>
          {docs.data.map((d) => (
            <tr key={d.id} className="border-b border-[#eef1f4] last:border-0 align-top">
              <td className="px-3 py-1">
                <button
                  className="text-[#00539b] hover:underline text-left"
                  onClick={() => d.id && onOpenResource('DocumentReference', d.id, ccText(d.type))}
                >
                  {ccText(d.type)}
                </button>
              </td>
              <td className="px-2 py-1 text-[11.5px]">{d.author?.[0]?.display ?? '—'}</td>
              <td className="px-2 py-1 text-[11.5px] text-[#5b6770]">{d.description ?? ''}</td>
              <td className="px-2 py-1 text-right text-[11.5px] text-[#5b6770] whitespace-nowrap">
                {fmtDate(d.date)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </MPageCard>
  );
}

// ── Histories ────────────────────────────────────────────────────────────────

export function HistoriesPage({ patientId, onOpenResource }: PageProps) {
  const procedures = useProcedures(patientId);
  const family = useFamilyHistory(patientId);
  const visits = useEncounterHistory(patientId);
  return (
    <div>
      <MPageCard
        title="Procedure History"
        count={procedures.data.length}
        fetchedAt={procedures.fetchedAt}
        loading={procedures.loading}
        error={procedures.error}
        onRefresh={procedures.refresh}
      >
        <table className="w-full">
          <tbody>
            {procedures.data.map((p) => (
              <tr key={p.id} className="border-b border-[#eef1f4] last:border-0">
                <td className="px-3 py-1">
                  <button
                    className="text-[#00539b] hover:underline"
                    onClick={() => p.id && onOpenResource('Procedure', p.id, ccText(p.code))}
                  >
                    {ccText(p.code)}
                  </button>
                </td>
                <td className="px-2 py-1 text-right text-[11.5px] text-[#5b6770]">
                  {fmtDate(p.performedDateTime)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </MPageCard>

      <MPageCard
        title="Family History"
        count={family.data.length}
        fetchedAt={family.fetchedAt}
        loading={family.loading}
        error={family.error}
        onRefresh={family.refresh}
      >
        <table className="w-full">
          <tbody>
            {family.data.map((f) => (
              <tr key={f.id} className="border-b border-[#eef1f4] last:border-0">
                <td className="px-3 py-1 font-medium">{ccText(f.relationship)}</td>
                <td className="px-2 py-1 text-[11.5px]">
                  {f.condition?.map((c) => ccText(c.code)).join(', ') ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </MPageCard>

      <MPageCard title="Visit History" count={visits.data.length}>
        <table className="w-full">
          <tbody>
            {visits.data.map((e) => (
              <tr key={e.id} className="border-b border-[#eef1f4] last:border-0">
                <td className="px-3 py-1 text-[11.5px] whitespace-nowrap">
                  {fmtDate(e.period?.start)}
                </td>
                <td className="px-2 py-1">
                  <button
                    className={`hover:underline ${
                      e.class?.code === 'EMER' ? 'text-[#c8102e] font-semibold' : 'text-[#00539b]'
                    }`}
                    onClick={() => e.id && onOpenResource('Encounter', e.id, ccText(e.type?.[0]))}
                  >
                    {e.reasonCode?.[0] ? ccText(e.reasonCode[0]) : ccText(e.type?.[0])}
                  </button>
                </td>
                <td className="px-2 py-1 text-right text-[11.5px] text-[#5b6770]">
                  {e.serviceProvider?.display ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </MPageCard>
    </div>
  );
}

// ── Immunizations ────────────────────────────────────────────────────────────

export function ImmunizationsPage({ patientId, onOpenResource }: PageProps) {
  const imms = useImmunizations(patientId);
  return (
    <MPageCard
      title="Immunizations"
      count={imms.data.length}
      fetchedAt={imms.fetchedAt}
      loading={imms.loading}
      error={imms.error}
      onRefresh={imms.refresh}
    >
      <table className="w-full">
        <thead>
          <tr className="text-left text-[11px] uppercase text-[#5b6770] border-b border-[#d5dce2]">
            <th className="px-3 py-1 font-semibold">Vaccine</th>
            <th className="px-2 py-1 font-semibold">Status</th>
            <th className="px-2 py-1 font-semibold text-right">Date</th>
          </tr>
        </thead>
        <tbody>
          {imms.data.map((i) => (
            <tr key={i.id} className="border-b border-[#eef1f4] last:border-0">
              <td className="px-3 py-1">
                <button
                  className="text-[#00539b] hover:underline"
                  onClick={() =>
                    i.id && onOpenResource('Immunization', i.id, ccText(i.vaccineCode))
                  }
                >
                  {ccText(i.vaccineCode)}
                </button>
              </td>
              <td className="px-2 py-1 text-[11.5px]">{i.status}</td>
              <td className="px-2 py-1 text-right text-[11.5px] text-[#5b6770]">
                {fmtDate(i.occurrenceDateTime)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </MPageCard>
  );
}

// ── Care Plan (FHIR) ─────────────────────────────────────────────────────────

export function CarePlanFhirPage({ patientId, onOpenResource }: PageProps) {
  const plans = useCarePlans(patientId);
  const goals = useGoals(patientId);
  return (
    <div>
      {plans.data.map((cp) => (
        <MPageCard
          key={cp.id}
          title={cp.title ?? 'Care Plan'}
          fetchedAt={plans.fetchedAt}
          loading={plans.loading}
          error={plans.error}
          onRefresh={plans.refresh}
          actions={
            <button
              className="text-[11px] px-2 rounded-sm bg-white/15 border border-white/40 text-white hover:bg-white/25 leading-5"
              onClick={() => cp.id && onOpenResource('CarePlan', cp.id, cp.title ?? 'CarePlan')}
            >
              FHIR
            </button>
          }
        >
          <div className="px-3 py-1.5">
            <div className="text-[11.5px] text-[#5b6770] mb-1">
              Active since {fmtDate(cp.period?.start)} · addresses {cp.addresses?.length ?? 0}{' '}
              condition(s)
            </div>
            <table className="w-full">
              <tbody>
                {(cp.activity ?? []).map((a, i) => (
                  <tr key={i} className="border-b border-[#eef1f4] last:border-0">
                    <td className="px-1 py-1">{a.detail?.description}</td>
                    <td className="px-2 py-1 text-right">
                      <span className={`text-[11.5px] ${statusTextCls(a.detail?.status)}`}>
                        {a.detail?.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </MPageCard>
      ))}
      <MPageCard title="Goals" count={goals.data.length} loading={goals.loading}>
        <table className="w-full">
          <tbody>
            {goals.data.map((g) => (
              <tr key={g.id} className="border-b border-[#eef1f4] last:border-0">
                <td className="px-3 py-1">
                  <button
                    className="text-[#00539b] hover:underline"
                    onClick={() => g.id && onOpenResource('Goal', g.id, ccText(g.description))}
                  >
                    {ccText(g.description)}
                  </button>
                </td>
                <td className="px-2 py-1 text-[11.5px]">{g.lifecycleStatus}</td>
                <td className="px-2 py-1 text-right text-[11.5px] text-[#5b6770]">
                  Due {fmtDate(g.target?.[0]?.dueDate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </MPageCard>
    </div>
  );
}

// ── Coverage & Claims ────────────────────────────────────────────────────────

function moneyText(amount?: { value?: number; currency?: string }): string {
  if (!amount?.value) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: amount.currency ?? 'USD',
  }).format(amount.value);
}

/** CMS-0057-F Patient Access — Coverage & Benefits */
export function CoveragePage({ patientId, onOpenResource }: PageProps) {
  const { data: coverages, loading, error, fetchedAt, refresh } = useCoverageAll(patientId);
  return (
    <MPageCard
      title="Coverage & Benefits"
      count={coverages.length}
      loading={loading}
      error={error}
      fetchedAt={fetchedAt}
      onRefresh={refresh}
    >
      {coverages.length === 0 && !loading && (
        <div className="px-3 py-2 italic text-[#5b6770] text-[12.5px]">
          No coverage records found.
        </div>
      )}
      <table className="w-full">
        <tbody>
          {coverages.map((c: FhirCoverage) => {
            const payorName = c.payor?.[0]?.display ?? c.payor?.[0]?.reference ?? '—';
            const planType = ccText(c.type);
            return (
              <tr key={c.id} className="border-b border-[#eef1f4] last:border-0">
                <td className="px-3 py-2">
                  <button
                    className="text-[#00539b] hover:underline font-semibold text-[12.5px]"
                    onClick={() =>
                      c.id && onOpenResource('Coverage', c.id, `Coverage: ${payorName}`)
                    }
                  >
                    {payorName}
                  </button>
                  <div className="text-[11px] text-[#5b6770]">
                    {planType !== '—' ? planType : 'Unknown plan type'}
                    {c.subscriberId ? ` · Subscriber ID: ${c.subscriberId}` : ''}
                  </div>
                </td>
                <td className="px-2 py-2 text-right">
                  <span
                    className={`text-[11.5px] font-semibold ${c.status === 'active' ? 'text-[#1e7e34]' : 'text-[#5b6770]'}`}
                  >
                    {c.status ?? '—'}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="px-3 py-1.5 border-t border-[#eef1f4] text-[10.5px] text-[#8a949c]">
        CMS-0057-F Patient Access — Coverage resource
      </div>
    </MPageCard>
  );
}

/** CMS-0057-F Patient Access — Claims & EOBs */
export function ClaimsPage({ patientId, onOpenResource }: PageProps) {
  const eob = useExplanationOfBenefit(patientId);
  const cr = useClaimResponses(patientId);

  return (
    <div>
      {/* ExplanationOfBenefit */}
      <MPageCard
        title="Claims (Explanation of Benefit)"
        count={eob.data.length}
        loading={eob.loading}
        error={eob.error}
        fetchedAt={eob.fetchedAt}
        onRefresh={eob.refresh}
      >
        {eob.data.length === 0 && !eob.loading && (
          <div className="px-3 py-2 italic text-[#5b6770] text-[12.5px]">No EOB records found.</div>
        )}
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-[#e2e7eb]">
              <th className="px-3 py-1.5 text-left text-[11px] font-semibold text-[#5b6770]">Service date</th>
              <th className="px-3 py-1.5 text-left text-[11px] font-semibold text-[#5b6770]">Service</th>
              <th className="px-3 py-1.5 text-right text-[11px] font-semibold text-[#5b6770]">Amount paid</th>
              <th className="px-3 py-1.5 text-center text-[11px] font-semibold text-[#5b6770]">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {(eob.data as FhirExplanationOfBenefit[]).map((e) => {
              const item = e.item?.[0];
              const paid =
                e.payment?.amount ?? e.total?.find((t) => ccText(t.category) === 'benefit')?.amount;
              return (
                <tr key={e.id} className="border-b border-[#eef1f4] last:border-0 hover:bg-[#f7f9fa]">
                  <td className="px-3 py-1.5 whitespace-nowrap text-[#5b6770]">
                    {fmtDate(item?.servicedDate ?? e.billablePeriod?.start ?? e.created)}
                  </td>
                  <td className="px-3 py-1.5">
                    <button
                      className="text-[#00539b] hover:underline text-left"
                      onClick={() =>
                        e.id && onOpenResource('ExplanationOfBenefit', e.id, `EOB ${e.id}`)
                      }
                    >
                      {ccText(item?.productOrService) !== '—'
                        ? ccText(item?.productOrService)
                        : ccText(e.type)}
                    </button>
                    {e.insurer?.display && (
                      <div className="text-[11px] text-[#5b6770]">{e.insurer.display}</div>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap font-semibold">
                    {moneyText(paid)}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <span
                      className={`text-[11px] font-semibold ${e.outcome === 'complete' ? 'text-[#1e7e34]' : 'text-[#5b6770]'}`}
                    >
                      {e.outcome ?? '—'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="px-3 py-1.5 border-t border-[#eef1f4] text-[10.5px] text-[#8a949c]">
          CMS-0057-F Patient Access — ExplanationOfBenefit resource
        </div>
      </MPageCard>

      {/* ClaimResponse (PA decisions) */}
      <MPageCard
        title="Prior Auth Decisions (ClaimResponse)"
        count={cr.data.length}
        loading={cr.loading}
        error={cr.error}
        fetchedAt={cr.fetchedAt}
        onRefresh={cr.refresh}
      >
        {cr.data.length === 0 && !cr.loading && (
          <div className="px-3 py-2 italic text-[#5b6770] text-[12.5px]">
            No prior authorization decisions found.
          </div>
        )}
        <table className="w-full text-[12px]">
          <tbody>
            {(cr.data as FhirClaimResponse[]).map((r) => {
              const outcomeColor =
                r.outcome === 'complete'
                  ? r.disposition?.toLowerCase().includes('denied')
                    ? 'text-[#c8102e]'
                    : 'text-[#1e7e34]'
                  : r.outcome === 'queued'
                    ? 'text-[#8a5300]'
                    : 'text-[#5b6770]';
              return (
                <tr key={r.id} className="border-b border-[#eef1f4] last:border-0">
                  <td className="px-3 py-1.5">
                    <button
                      className="text-[#00539b] hover:underline"
                      onClick={() =>
                        r.id && onOpenResource('ClaimResponse', r.id, `ClaimResponse ${r.id}`)
                      }
                    >
                      {ccText(r.type) !== '—' ? ccText(r.type) : `ClaimResponse/${r.id}`}
                    </button>
                    <div className="text-[11px] text-[#5b6770]">
                      {r.disposition ?? ''}
                      {r.created ? ` · ${fmtDate(r.created)}` : ''}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <span className={`font-semibold text-[11.5px] ${outcomeColor}`}>
                      {r.outcome ?? '—'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="px-3 py-1.5 border-t border-[#eef1f4] text-[10.5px] text-[#8a949c]">
          CMS-0057-F Patient Access + Prior Auth — ClaimResponse resource
        </div>
      </MPageCard>
    </div>
  );
}
