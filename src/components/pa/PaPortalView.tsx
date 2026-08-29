'use client';
/**
 * PaPortalView — Step 5: Running PA authorization queue.
 * Ported from PA-Standalone-SmartApp.
 */
import { usePaStore } from '@/lib/pa/usePaStore';
import type { PaCase, PaStatus } from '@/lib/pa/pa-types';

const TABS = ['All', 'Approved', 'Pended', 'Partially Approved', 'Denied', 'Submitted'];

const STATUS_STYLE: Record<string, string> = {
  Approved: 'bg-green-50 text-green-700 border-green-200',
  Pended: 'bg-amber-50 text-amber-700 border-amber-200',
  'Partially Approved / Modified': 'bg-teal-50 text-teal-700 border-teal-200',
  Denied: 'bg-red-50 text-red-700 border-red-200',
  Submitted: 'bg-blue-50 text-blue-700 border-blue-200',
  Pending: 'bg-gray-100 text-gray-500 border-gray-200',
};

function tabToStatus(tab: string): PaStatus | null {
  if (tab === 'All') return null;
  if (tab === 'Partially Approved') return 'Partially Approved / Modified';
  return tab as PaStatus;
}

export default function PaPortalView() {
  const {
    cases,
    activePortalTab,
    setActivePortalTab,
    setActiveCaseId,
    setActiveCaseTab,
    setView,
    resetWorkflow,
  } = usePaStore();

  const filtered =
    activePortalTab === 'All'
      ? cases
      : cases.filter((c) => c.status === tabToStatus(activePortalTab));

  function openCase(authId: string) {
    setActiveCaseId(authId);
    setActiveCaseTab('checklist');
    setView('case');
  }

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Authorizations</h1>
          <p className="text-sm text-gray-500 mt-1">
            Prior authorization requests submitted via FHIR PAS or X12 EDI 275/278.
          </p>
        </div>
        <button
          onClick={() => {
            resetWorkflow();
            setView('order');
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-[#1669c1] px-4 py-2 text-sm font-bold text-white hover:bg-[#0f52a0] transition-colors"
        >
          + New Request
        </button>
      </div>

      {/* Tab strip */}
      <div className="flex gap-0 border-b border-gray-200 overflow-x-auto mb-0">
        {TABS.map((tab) => {
          const count =
            tab === 'All'
              ? cases.length
              : cases.filter((c) => c.status === tabToStatus(tab)).length;
          return (
            <button
              key={tab}
              onClick={() => setActivePortalTab(tab)}
              className={`border-b-2 px-4 pb-3 pt-3 text-sm font-semibold whitespace-nowrap transition-colors ${activePortalTab === tab ? 'border-[#1669c1] text-[#1669c1]' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
            >
              {tab}{' '}
              <span
                className={`ml-1 text-xs ${activePortalTab === tab ? 'text-[#1669c1]' : 'text-gray-400'}`}
              >
                ({count})
              </span>
            </button>
          );
        })}
      </div>

      {/* Case list */}
      <div className="mt-0 overflow-hidden rounded-b-xl border border-t-0 border-gray-200 bg-white shadow-sm">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No cases in this category.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Auth ID', 'Patient', 'Service', 'Date', 'Channel', 'Status', ''].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-400"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((c) => (
                <CaseRow key={c.authId} c={c} onOpen={() => openCase(c.authId)} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function CaseRow({ c, onOpen }: { c: PaCase; onOpen: () => void }) {
  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3 font-mono text-xs font-bold text-[#1669c1]">{c.authId}</td>
      <td className="px-4 py-3">
        <div className="font-semibold text-gray-900 text-xs">{c.patient}</div>
        <div className="text-[10px] text-gray-400">{c.memberId}</div>
      </td>
      <td className="px-4 py-3">
        <div className="text-xs text-gray-700">{c.service}</div>
        <div className="font-mono text-[10px] text-gray-400">CPT {c.cpt}</div>
      </td>
      <td className="px-4 py-3 text-xs text-gray-500">{c.dateRequested}</td>
      <td className="px-4 py-3">
        <span
          className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${c.channel === 'FHIR' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}
        >
          {c.channel}
        </span>
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[c.status] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {c.status}
        </span>
      </td>
      <td className="px-4 py-3">
        <button
          onClick={onOpen}
          className="text-xs font-bold text-[#1669c1] hover:underline whitespace-nowrap"
        >
          View →
        </button>
      </td>
    </tr>
  );
}
