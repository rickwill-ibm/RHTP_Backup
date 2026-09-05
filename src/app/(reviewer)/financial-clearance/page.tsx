/**
 * Golden Thread — Financial Clearance (increments GT-3/5/6/7 + #1 wiring).
 *
 * Server-rendered. Reads the SMART session patient (when launched) and runs the
 * production thread **orchestrator** (`runFinancialClearance`) — the same path
 * the `/api/financial-clearance` BFF route uses — for two providers of the same
 * lumbar-MRI order (one gold-carded, one not), threading + persisting an
 * Evidence Record. In a real launch the member+order come from FHIR via the BFF;
 * here they come from the seed so the page is self-contained offline.
 */
import { flag } from '@/lib/flags/flags';
import { getSessionPatient } from '@/lib/server/smartSession';
import { loadMockLibrary, type MemberContext } from '@/lib/policy';
import { mockGoldCardDataSource } from '@/lib/policy/goldCardSource';
import { mockDenialRateProvider } from '@/lib/policy/denialRates';
import { createInMemoryEvidenceStore } from '@/lib/evidence/evidenceStore';
import { runFinancialClearance } from '@/lib/goldenThread/threadOrchestrator';
import type { StageOrder } from '@/lib/goldenThread';
import type { CoverageInfo } from '@/lib/goldenThread/eligibility';
import type { ThreadInputs } from '@/lib/goldenThread/fromFhirBundle';
import type { FcStage } from '@/lib/goldenThread';
import { StageRail } from '@/components/goldenThread/StageRail';
import { MedicalNecessityPanel } from '@/components/goldenThread/MedicalNecessityPanel';
import { FinancialClearanceRunner } from '@/components/goldenThread/FinancialClearanceRunner';

const TS = '2026-07-26T00:00:00.000Z';
const PAYER = 'UnitedHealthcare Community Plan';

const SCENARIOS = [
  { heading: 'Provider A — gold-carded for this service', providerNpi: '1730154783' },
  { heading: 'Provider B — not gold-carded', providerNpi: '1518998765' },
];

async function renderScenario(
  s: { heading: string; providerNpi: string },
  memberId: string
): Promise<React.ReactElement> {
  const member: MemberContext = { memberId, diagnoses: [] };
  const order: StageOrder = {
    code: '72148',
    codeSystem: 'CPT',
    display: 'MRI lumbar spine w/o contrast',
    providerNpi: s.providerNpi,
    payer: PAYER,
  };
  const coverage: CoverageInfo = {
    status: 'active',
    payer: PAYER,
    plan: 'Texas STAR',
    type: 'Medicaid managed care',
  };
  const inputs: ThreadInputs = { member, order, coverage };

  const evId = `ev-${memberId}-${s.providerNpi}`;
  const result = await runFinancialClearance(inputs, {
    library: loadMockLibrary(),
    goldCardSource: mockGoldCardDataSource,
    denialRates: mockDenialRateProvider,
    store: createInMemoryEvidenceStore(),
    ts: TS,
    ids: {
      evidence: evId,
      determination: `${evId}-det`,
      goldCard: `${evId}-gc`,
      propensity: `${evId}-prop`,
      eligibility: `${evId}-elig`,
      estimation: `${evId}-est`,
    },
  });

  const { eligibility, medicalNecessity: mn, estimate, workItem, evidence } = result;
  const skipped: FcStage[] = result.netRequiresPA ? [] : ['PriorAuth'];
  const completed: FcStage[] = ['Eligibility', 'MedicalNecessity'];

  return (
    <section className="space-y-4 rounded-lg border border-slate-300 p-4">
      <h2 className="text-xl font-semibold">{s.heading}</h2>
      <StageRail current="PatientEstimation" completed={completed} skipped={skipped} />

      <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
        <span className="font-medium">Eligibility: </span>
        {eligibility.payer} · {eligibility.plan} — {eligibility.note}
      </div>

      <MedicalNecessityPanel vm={mn.vm} />

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded border border-slate-200 p-3 text-sm">
          <p className="font-medium">Patient Estimation (GFE)</p>
          <p className="mt-1">
            Allowed ${estimate.allowedAmount} · member owes{' '}
            <span className="font-semibold">${estimate.memberResponsibility}</span> (deductible $
            {estimate.appliedToDeductible} + coinsurance ${estimate.coinsurance}), plan pays $
            {estimate.planPays}.
          </p>
          <p className="text-xs text-slate-500">
            Payment-readiness score: {estimate.propensityToPay.band} —{' '}
            {estimate.propensityToPay.note}
          </p>
        </div>
        <div className="rounded border border-slate-200 p-3 text-sm">
          <p className="font-medium">Work queue routing</p>
          <p className="mt-1">
            Queue <span className="font-semibold">{workItem.queue}</span> · {workItem.disposition} ·
            SLA {workItem.slaHours}h (due {workItem.dueBy.slice(0, 10)}).
          </p>
          <p className="text-xs text-slate-500">{workItem.note}</p>
          <p className="mt-1 text-xs text-slate-400">
            Evidence Record persisted: {evidence.id} ({evidence.entries.length} entries)
          </p>
        </div>
      </div>
    </section>
  );
}

export default async function FinancialClearancePage(): Promise<React.ReactElement> {
  if (!flag('goldenThread')) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-slate-600">Financial Clearance is not enabled.</p>
      </main>
    );
  }
  const sessionPatient = await getSessionPatient().catch(() => null);
  if (!sessionPatient) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-slate-600">
          No member in session - financial clearance requires an authenticated member context.
        </p>
      </main>
    );
  }
  const memberId = sessionPatient;
  const scenarios = await Promise.all(SCENARIOS.map((s) => renderScenario(s, memberId)));

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Golden Thread — Financial Clearance</h1>
        <p className="mt-1 text-sm text-slate-600">
          SMART-launched: Eligibility → Medical Necessity → Prior Auth → Patient Estimation, unified
          by a persisted Evidence Record. Gold carding, submission-readiness scoring, and work-queue
          routing.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          {sessionPatient
            ? `Launched for member ${sessionPatient} (SMART session).`
            : 'No SMART session — showing the seed member. Launch from the EHR to run on a live patient.'}
        </p>
        <p className="mt-2 text-sm">
          <a className="text-blue-700 hover:underline" href="/work-queue">
            → Open the reviewer work queue
          </a>
        </p>
      </header>

      <FinancialClearanceRunner />

      <h2 className="pt-2 text-lg font-semibold">Pre-computed scenarios</h2>
      {scenarios.map((el, i) => (
        <div key={SCENARIOS[i].providerNpi}>{el}</div>
      ))}
      <p className="text-xs italic text-slate-500">
        Runs the production `runFinancialClearance` orchestrator (same path as
        `/api/financial-clearance`). Submission-readiness scores and estimates are decision-support
        only; the payer ClaimResponse is authoritative.
      </p>
    </main>
  );
}
