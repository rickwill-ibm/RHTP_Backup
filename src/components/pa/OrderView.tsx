'use client';
/**
 * OrderView — Step 1: Enter a patient and procedure(s), then run CRD.
 * Ported from PA-Standalone-SmartApp; wired to RHTP BFF + appContext.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { usePaStore } from '@/lib/pa/usePaStore';
import { useDemoStore } from '@/uhg/store/demoStore';
import { runCrdChecks } from '@/lib/pa/crdService';
import { fhirGet } from '@/lib/client/bff';
import { toast } from 'sonner';
import type { CrdResultEntry, OrderProcedure } from '@/lib/pa/pa-types';
import { getPatientContext, patientBannerFrom } from '@/lib/pa/patientContext';
import { lookupProcedureCode } from '@/lib/pa/procedureCodeLookup';

interface ProcedureFields {
  procedures: { cpt: string; cptDesc: string; cptSystem: OrderProcedure['cptSystem'] }[];
}

const EMPTY_ROW = { cpt: '', cptDesc: '', cptSystem: 'http://www.ama-assn.org/go/cpt' as const };
const MARIA_PREFILL = [
  {
    cpt: '72148',
    cptDesc: 'MRI Lumbar Spine w/o Contrast',
    cptSystem: 'http://www.ama-assn.org/go/cpt' as const,
  },
];

export default function OrderView() {
  const activeCitizenId = useDemoStore((s) => s.activeCitizenId);
  const {
    patient,
    patientLoading,
    patientError,
    setPatient,
    setPatientLoading,
    setPatientError,
    setOrder,
    setCrdLoading,
    setCrdResults,
    setCrdError,
    setView,
    openPatientRecord,
  } = usePaStore();

  const [orderingProvider, setOrderingProvider] = useState('Dr. James Whitfield MD');
  const [facility, setFacility] = useState('Frontier FQHC — South Dakota');
  const [submitting, setSubmitting] = useState(false);

  const isMaria = activeCitizenId === 'MARIA_SD_001';

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<ProcedureFields>({
    defaultValues: { procedures: isMaria ? MARIA_PREFILL : [EMPTY_ROW] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'procedures' });

  // Code → Description auto-fill, LIVE as the user types (debounced per row so a fast typist
  // doesn't fire a lookup per keystroke) — never overwrites the field for an UNRECOGNIZED code,
  // only a real match replaces it (see procedureCodeLookup's never-fabricate contract). Each
  // procedure row gets its own independent timer, keyed by index, so a form with several
  // procedures resolves every row's code the same way rather than only the one last touched.
  const lookupTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  async function runCodeLookup(index: number) {
    const row = getValues(`procedures.${index}`);
    const display = await lookupProcedureCode(row.cpt, row.cptSystem);
    if (display) setValue(`procedures.${index}.cptDesc`, display, { shouldDirty: true });
  }

  function scheduleCodeLookup(index: number) {
    clearTimeout(lookupTimers.current[index]);
    lookupTimers.current[index] = setTimeout(() => void runCodeLookup(index), 300);
  }

  /** Enter in a procedure field must never implicitly submit the whole form (that ran CRD
   *  before later rows were even touched) — resolve that row's lookup immediately instead. */
  function handleCodeKeyDown(index: number, e: KeyboardEvent) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    clearTimeout(lookupTimers.current[index]);
    void runCodeLookup(index);
  }

  // Pre-populate patient from the seeded coverage context (one universe); fall back to a FHIR
  // read for any patient not in the seeded set. Patient banner + membership come from context —
  // no hardcoded Maria/South Dakota profile.
  useEffect(() => {
    const ctx = getPatientContext(activeCitizenId);
    if (ctx) {
      setPatient(patientBannerFrom(ctx));
      if (isMaria) reset({ procedures: MARIA_PREFILL });
      return;
    }
    if (!activeCitizenId) return;
    setPatientLoading(true);
    fhirGet<{
      resourceType: string;
      name?: { text?: string; family?: string; given?: string[] }[];
      birthDate?: string;
      identifier?: { value?: string }[];
    }>(`Patient/${activeCitizenId}`)
      .then((r) => {
        if (r.ok && r.data) {
          const n = r.data.name?.[0];
          const name =
            n?.text ??
            [n?.given?.join(' '), n?.family].filter(Boolean).join(' ') ??
            activeCitizenId;
          setPatient({
            name,
            dob: r.data.birthDate ?? '',
            memberId: r.data.identifier?.[0]?.value ?? activeCitizenId,
          });
        } else {
          setPatientError('Could not load patient from FHIR.');
        }
      })
      .finally(() => setPatientLoading(false));
  }, [activeCitizenId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onSubmit(values: ProcedureFields) {
    if (!patient) {
      toast.error('Load a patient before running CRD.');
      return;
    }
    const procedures: OrderProcedure[] = values.procedures.map((p) => ({
      cpt: p.cpt.trim(),
      cptSystem: p.cptSystem,
      cptDesc: p.cptDesc.trim() || `Procedure ${p.cpt.trim()}`,
    }));
    setOrder({
      procedures,
      orderingProvider: orderingProvider || 'Not specified',
      facility: facility || 'Not specified',
      orderDate: new Date().toLocaleDateString('en-US'),
    });
    setCrdLoading(true);
    setView('checklist');
    setSubmitting(true);
    try {
      const results: CrdResultEntry[] = await Promise.all(
        procedures.map(async (proc) => ({
          cpt: proc.cpt,
          cptDesc: proc.cptDesc,
          result: await runCrdChecks(activeCitizenId, proc.cpt, {
            serviceDate: new Date().toISOString().slice(0, 10),
            orderingProvider,
            // demo: the seeded ordering providers are verified in-network for the member's plan
            orderingProviderInNetwork: true,
          }),
        }))
      );
      setCrdResults(results);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'CRD check failed';
      setCrdError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
      setCrdLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">New Prior Authorization Request</h1>
        <p className="text-sm text-gray-500 mt-1">
          Enter the patient and one or more procedures, then run Coverage Requirements Discovery
          (CRD) before signing the order.
        </p>
      </div>

      {/* Patient banner */}
      <div className="mb-5 rounded-lg border border-gray-200 border-l-[5px] border-l-[#5d7a94] bg-gradient-to-b from-gray-50 to-blue-50/40 px-5 py-4">
        {patientLoading && <p className="text-sm text-gray-400">Loading patient…</p>}
        {patient && !patientLoading && (
          <div className="flex flex-wrap items-center gap-7">
            <div className="font-bold text-lg text-gray-900">{patient.name}</div>
            <div className="text-sm text-gray-500">
              <span className="font-semibold text-gray-700">DOB:</span> {patient.dob}
            </div>
            <div className="text-sm text-gray-500">
              <span className="font-semibold text-gray-700">Member ID:</span> {patient.memberId}
            </div>
            <button
              type="button"
              onClick={openPatientRecord}
              className="ml-auto text-xs font-semibold text-[#1669c1] hover:underline"
            >
              View Full Patient Record
            </button>
          </div>
        )}
        {patientError && <p className="text-sm text-red-600">{patientError}</p>}
        {!patient && !patientLoading && !patientError && (
          <p className="text-sm text-gray-400">
            No patient loaded — navigate using the Demo Navigator to set a patient.
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm mb-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Procedure{fields.length > 1 ? 's' : ''} ({fields.length})
            </p>
            <button
              type="button"
              onClick={() => append(EMPTY_ROW)}
              className="text-xs font-bold text-[#1669c1] hover:underline"
            >
              + Add another procedure
            </button>
          </div>
          <div className="space-y-3">
            {fields.map((field, i) => (
              <div
                key={field.id}
                className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-100 bg-gray-50/50 p-3"
              >
                <div className="w-28">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                    Code system
                  </label>
                  <select
                    {...register(`procedures.${i}.cptSystem`)}
                    className="w-full rounded-md border border-gray-300 px-2 py-2 text-sm"
                  >
                    <option value="http://www.ama-assn.org/go/cpt">CPT</option>
                    <option value="https://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets">
                      HCPCS
                    </option>
                  </select>
                </div>
                <div className="w-32">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                    Code
                  </label>
                  <input
                    {...register(`procedures.${i}.cpt`, {
                      required: true,
                      pattern: /^[A-Za-z0-9]{4,6}$/,
                      onChange: () => scheduleCodeLookup(i),
                    })}
                    onKeyDown={(e) => handleCodeKeyDown(i, e)}
                    placeholder="72148"
                    className={`w-full rounded-md border px-2 py-2 text-sm font-mono ${errors.procedures?.[i]?.cpt ? 'border-red-400' : 'border-gray-300'}`}
                  />
                </div>
                <div className="flex-1 min-w-[220px]">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                    Description
                  </label>
                  <input
                    {...register(`procedures.${i}.cptDesc`)}
                    placeholder="Procedure description"
                    className="w-full rounded-md border border-gray-300 px-2 py-2 text-sm"
                  />
                </div>
                {fields.length > 1 && (
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="text-xs font-semibold text-red-500 hover:underline pb-2"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
          {errors.procedures && (
            <p className="mt-2 text-xs text-red-600">
              Enter a valid code (4–6 alphanumeric characters) for every row.
            </p>
          )}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                Ordering provider
              </label>
              <input
                value={orderingProvider}
                onChange={(e) => setOrderingProvider(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                Facility
              </label>
              <input
                value={facility}
                onChange={(e) => setFacility(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-7 shadow-sm text-center">
          <p className="text-sm text-gray-500 mb-5 max-w-lg mx-auto">
            Run a Coverage Requirements Discovery (CRD) check for every procedure above, using the
            member&apos;s coverage — eligibility, network status, and prior authorization
            requirements.
          </p>
          <button
            type="submit"
            disabled={!patient || submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-[#1669c1] px-7 py-3.5 text-sm font-bold text-white hover:bg-[#0f52a0] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Running CRD…' : 'Check Prior Auth Requirements (CRD)'}
          </button>
          {!patient && (
            <p className="mt-2 text-xs text-gray-400">
              A patient must be active in the Demo Navigator.
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
