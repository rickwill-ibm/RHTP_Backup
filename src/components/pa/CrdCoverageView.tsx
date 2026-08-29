'use client';
/**
 * CrdCoverageView — the rich CRD (Coverage Requirements Discovery) screen.
 *
 * Da Vinci-conformant CRD surface: coverage determination + PA determination + documentation-needed
 * + the DTR questionnaire pointer + eligibility/benefits (labeled 270/271). It NAMES the clinical
 * criteria but does NOT evaluate them — per-criterion Met/Partial is DTR pre-population, shown after
 * "Complete documentation" launches DTR. Data-driven: one card per ordered procedure, built from the
 * member's context + the published coverage rule via `buildCrdCoverageViewModel` — works for any
 * patient/plan/order, not one hardcoded case.
 *
 * This module is the container: it owns store state and per-procedure view-model assembly, then
 * delegates rendering of each procedure to `CrdProcedureCard`. Behind the `richCrdDtr` flag; the
 * classic CrdChecklistView remains the fallback.
 */
import { usePaStore } from '@/lib/pa/usePaStore';
import { runDtrMatch } from '@/lib/pa/dtrService';
import { toast } from 'sonner';
import { getPatientContextByMemberId } from '@/lib/pa/patientContext';
import { coverageRuleForCode } from '@/lib/pa/publishedCoverage';
import { buildCrdCoverageViewModel, type CrdCoverageViewModel } from '@/lib/pa/crdCoverageView';
import type { CrdResultEntry, DtrResultEntry } from '@/lib/pa/pa-types';
import CrdProcedureCard from './CrdProcedureCard';

export default function CrdCoverageView() {
  const {
    crdLoading,
    crdResults,
    crdError,
    order,
    patient,
    setView,
    setDtrLoading,
    setDtrResults,
    setDtrError,
  } = usePaStore();

  async function completeDocumentation() {
    if (!order || !crdResults) return;
    setDtrLoading(true);
    setView('dtr');
    try {
      const results: DtrResultEntry[] = await Promise.all(
        order.procedures.map((proc) => runDtrMatch(patient?.memberId ?? '', proc.cpt, proc.cptDesc))
      );
      setDtrResults(results);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'DTR launch failed';
      setDtrError(msg);
      toast.error(msg);
    } finally {
      setDtrLoading(false);
    }
  }

  if (crdLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-12 shadow-sm flex flex-col items-center gap-4 text-gray-400">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" />
        <p className="text-sm font-semibold">
          Running Coverage Requirements Discovery against the plan&apos;s coverage rules…
        </p>
      </div>
    );
  }
  if (crdError) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        <p className="mb-4">
          <strong>CRD Error:</strong> {crdError}
        </p>
        <button
          onClick={() => setView('order')}
          className="rounded-lg bg-[#1669c1] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0f52a0]"
        >
          ← Back to Order &amp; Coverage Check
        </button>
      </div>
    );
  }
  if (!crdResults || crdResults.length === 0 || !patient) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">
        <p className="mb-4">No coverage result yet — go to Step 1 and submit an order.</p>
        <button
          onClick={() => setView('order')}
          className="rounded-lg bg-[#1669c1] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0f52a0]"
        >
          ← Back to Order &amp; Coverage Check
        </button>
      </div>
    );
  }

  const ctx = getPatientContextByMemberId(patient.memberId);
  const orderedOn = order?.orderDate ?? new Date().toLocaleDateString('en-US');
  const provider = order?.orderingProvider ?? 'Not specified';

  const vms: CrdCoverageViewModel[] = (crdResults as CrdResultEntry[]).map((entry) => {
    const rule = coverageRuleForCode(entry.cpt);
    const fallbackCtx = ctx ?? {
      patientId: `patient-${patient.memberId}`,
      name: patient.name,
      dob: patient.dob,
      coverage: {
        payer: 'Unverified payer',
        payerId: 'unverified',
        plan: 'Unverified plan',
        memberId: patient.memberId,
        subscriberId: patient.memberId,
        coverageStatus: 'unknown' as const,
      },
    };
    return buildCrdCoverageViewModel({
      ctx: fallbackCtx,
      determination: entry.result,
      rule,
      order: { desc: entry.cptDesc, cpt: entry.cpt, orderedOn, provider },
      referenceId: `CRD-${orderedOn.replace(/\D/g, '')}-${entry.cpt}`,
    });
  });

  return (
    <div className="space-y-6">
      {vms.map((vm, i) => (
        <CrdProcedureCard
          key={vm.order.cpt + i}
          vm={vm}
          onComplete={completeDocumentation}
          single={vms.length === 1}
        />
      ))}
    </div>
  );
}
