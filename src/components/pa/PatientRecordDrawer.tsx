'use client';
/**
 * PatientRecordDrawer — full patient chart slide-over panel.
 * Independent of the step navigation — opens over any PA view without
 * navigating away. Wired to RHTP's /api/fhir BFF. No SmartContext.
 * Ported from PA-Standalone-SmartApp.
 */
import { useEffect, useState } from 'react';
import { usePaStore } from '@/lib/pa/usePaStore';
import { fhirGet } from '@/lib/client/bff';

interface RecordItem {
  id: string;
  resourceType: string;
  code: string | null;
  display: string;
  date: string | null;
  status: string | null;
  source: 'emr' | 'pa';
}

interface RecordSection {
  resourceType: string;
  label: string;
  items: RecordItem[];
}

const RESOURCE_TYPES = [
  { resourceType: 'Condition', label: 'Conditions' },
  { resourceType: 'Observation', label: 'Observations' },
  { resourceType: 'Procedure', label: 'Procedures' },
  { resourceType: 'Encounter', label: 'Encounters' },
  { resourceType: 'MedicationRequest', label: 'Medications' },
  { resourceType: 'DiagnosticReport', label: 'Diagnostic Reports' },
  { resourceType: 'AllergyIntolerance', label: 'Allergies' },
  { resourceType: 'Coverage', label: 'Coverage' },
];

type FhirResource = Record<string, unknown>;
type FhirBundle = { resourceType: string; entry?: { resource: FhirResource }[] };

function itemFrom(resource: FhirResource, source: 'emr' | 'pa'): RecordItem {
  const rt = resource.resourceType as string;
  const coding =
    (resource.code as { coding?: { code?: string; display?: string }[] } | undefined)
      ?.coding?.[0] ??
    (
      resource.medicationCodeableConcept as
        { coding?: { code?: string; display?: string }[] } | undefined
    )?.coding?.[0];
  return {
    id: (resource.id as string) ?? '',
    resourceType: rt,
    code: coding?.code ?? null,
    display: coding?.display ?? (resource.description as string) ?? rt,
    date: (resource.effectiveDateTime ??
      resource.recordedDate ??
      resource.onsetDateTime ??
      resource.authoredOn ??
      resource.date) as string | null,
    status: (resource.status ?? resource.clinicalStatus) as string | null,
    source,
  };
}

export default function PatientRecordDrawer() {
  const { patientRecordOpen, closePatientRecord, patient } = usePaStore();
  const [sections, setSections] = useState<RecordSection[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!patientRecordOpen || !patient) return;
    setLoading(true);
    setError(null);

    Promise.all(
      RESOURCE_TYPES.map(async ({ resourceType, label }) => {
        const r = await fhirGet<FhirBundle>(`${resourceType}?patient=${patient.memberId}`);
        const items = (r.data?.entry ?? []).map((e) => itemFrom(e.resource, 'emr'));
        return items.length > 0 ? { resourceType, label, items } : null;
      })
    )
      .then((results) => setSections(results.filter((s): s is RecordSection => s !== null)))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load patient record'))
      .finally(() => setLoading(false));
  }, [patientRecordOpen, patient]);

  if (!patientRecordOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={closePatientRecord} />
      <div className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">
              Full Patient Record
            </p>
            <h2 className="text-lg font-bold text-gray-900">{patient?.name ?? 'Patient chart'}</h2>
            {patient && (
              <p className="text-xs text-gray-500 mt-0.5">
                DOB: {patient.dob} · Member ID: {patient.memberId}
              </p>
            )}
          </div>
          <button
            onClick={closePatientRecord}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none">
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <p className="text-xs text-gray-400 mb-5">
            Unfiltered chart data from EMR and Payer Patient Access — every resource on file, not
            just what a specific policy rule matched on.
          </p>

          {loading && (
            <div className="flex flex-col items-center gap-3 py-12 text-gray-400">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" />
              <p className="text-sm font-semibold">Loading full patient record…</p>
            </div>
          )}
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <strong>Error:</strong> {error}
            </div>
          )}
          {!loading && !error && sections?.length === 0 && (
            <p className="text-sm text-gray-400 italic">
              No resources found for this patient. (FHIR server may be offline in demo mode.)
            </p>
          )}
          {!loading &&
            !error &&
            sections?.map((s) => (
              <div key={s.resourceType} className="mb-6">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                  {s.label}{' '}
                  <span className="font-normal normal-case text-gray-300">({s.items.length})</span>
                </p>
                <div className="space-y-2">
                  {s.items.map((item) => (
                    <div
                      key={`${item.resourceType}-${item.id}`}
                      className="rounded-lg border border-gray-200 bg-gray-50/50 px-3.5 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          {item.code && (
                            <span className="mr-2 inline-block rounded-md border border-gray-200 bg-white px-1.5 py-0.5 font-mono text-xs font-bold text-gray-800">
                              {item.code}
                            </span>
                          )}
                          <span className="text-xs font-semibold text-gray-800">
                            {item.display}
                          </span>
                          {item.date && (
                            <span className="ml-2 text-[11px] text-gray-400">
                              {item.date.slice(0, 10)}
                            </span>
                          )}
                        </div>
                        <span
                          className={`flex-shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${item.source === 'pa' ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}
                        >
                          {item.source === 'pa' ? 'Patient Access' : 'EMR'}
                        </span>
                      </div>
                      {item.status && (
                        <p className="mt-0.5 text-[11px] text-gray-400 capitalize">
                          {String(item.status)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
