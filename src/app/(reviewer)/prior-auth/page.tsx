'use client';

/**
 * Prior Authorization — CMS-0057-F native experience.
 * CRD → DTR → PAS, human-gated. Multi-view shell replacing the previous stub.
 *
 * Ported PA-Standalone-SmartApp components are wired to RHTP's BFF layer;
 * no separate SMART OAuth or standalone services required.
 */
import AppLayout from '@/components/AppLayout';
import { usePaStore, type AppView } from '@/lib/pa/usePaStore';
import { flag } from '@/lib/flags/flags';
import OrderView from '@/components/pa/OrderView';
import CrdChecklistView from '@/components/pa/CrdChecklistView';
import CrdCoverageView from '@/components/pa/CrdCoverageView';
import DtrTreeView from '@/components/pa/DtrTreeView';
import ReviewSubmitView from '@/components/pa/ReviewSubmitView';
import PaPortalView from '@/components/pa/PaPortalView';
import CaseDetailView from '@/components/pa/CaseDetailView';
import PatientRecordDrawer from '@/components/pa/PatientRecordDrawer';
import { PaHandoffBanner } from '@/components/goldenThread/PaHandoffBanner';

const NAV_STEPS: { view: AppView; label: string; step: number }[] = [
  { view: 'order', label: 'Order & Coverage Check', step: 1 },
  { view: 'checklist', label: 'Coverage Requirements', step: 2 },
  { view: 'dtr', label: 'Clinical Documentation', step: 3 },
  { view: 'review', label: 'Review & Submit', step: 4 },
  { view: 'portal', label: 'Authorizations', step: 5 },
];

// The Da Vinci-conformant CRD screen is served behind the `richCrdDtr` flag; the classic
// checklist view remains the fallback when the flag is off.
const VIEW_COMPONENT: Record<AppView, React.ComponentType> = {
  order: OrderView,
  checklist: flag('richCrdDtr') ? CrdCoverageView : CrdChecklistView,
  dtr: DtrTreeView,
  review: ReviewSubmitView,
  portal: PaPortalView,
  case: CaseDetailView,
};

export default function PriorAuthPage(): React.ReactElement {
  const { view, setView } = usePaStore();

  if (!flag('priorAuth')) {
    return (
      <AppLayout>
        <main className="p-6 text-sm text-slate-600">Prior Authorization is not enabled.</main>
      </AppLayout>
    );
  }

  const Active = VIEW_COMPONENT[view];

  return (
    <AppLayout>
      {/* CMS-0057-F compliance banner */}
      <div className="px-6 pt-4">
        <PaHandoffBanner />
      </div>

      {/* Section header */}
      <div className="border-b border-gray-200 bg-white px-6 pt-4 pb-0">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Prior Authorization</h1>
            <p className="text-xs text-gray-500">
              Coverage check · Clinical documentation · Human-gated submission · CMS-0057-F
              compliant
            </p>
          </div>
          <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-blue-700">
            CMS-0057-F
          </span>
        </div>

        {/* Step nav */}
        <nav className="flex overflow-x-auto gap-0">
          {NAV_STEPS.map((s) => (
            <button
              key={s.view}
              onClick={() => setView(s.view)}
              className={`flex items-center gap-2 border-b-[3px] px-4 py-3 text-sm font-semibold whitespace-nowrap transition-colors ${
                view === s.view
                  ? 'border-[#1669c1] text-[#1669c1]'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              <span
                className={`flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px] font-bold ${
                  view === s.view ? 'bg-[#1669c1] text-white' : 'bg-gray-100 text-gray-400'
                }`}
              >
                {s.step}
              </span>
              {s.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Main content */}
      <main className="mx-auto max-w-[1100px] px-6 py-8 pb-24">
        <Active />
      </main>

      {/* Patient record drawer — mounted once at shell level, never per-view */}
      <PatientRecordDrawer />
    </AppLayout>
  );
}
