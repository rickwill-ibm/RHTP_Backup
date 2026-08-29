'use client';
/**
 * CaseDetailView — opens when "View →" is clicked in the Authorizations list.
 * Shows checklist, DTR criteria, submission details, and status timeline
 * for the selected PaCase.
 */
import { usePaStore } from '@/lib/pa/usePaStore';
import type { PaCase, TimelineEntry } from '@/lib/pa/pa-types';

const STATUS_STYLE: Record<string, string> = {
  Approved: 'bg-green-50 text-green-700 border-green-200',
  Pended: 'bg-amber-50 text-amber-700 border-amber-200',
  'Partially Approved / Modified': 'bg-teal-50 text-teal-700 border-teal-200',
  Denied: 'bg-red-50 text-red-700 border-red-200',
  Submitted: 'bg-blue-50 text-blue-700 border-blue-200',
  Pending: 'bg-gray-100 text-gray-500 border-gray-200',
};

const TIMELINE_COLOR: Record<string, string> = {
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  amber: 'bg-amber-400',
  teal: 'bg-teal-500',
  red: 'bg-red-500',
  gray: 'bg-gray-400',
};

export default function CaseDetailView() {
  const { cases, activeCaseId, setView } = usePaStore();
  const c: PaCase | undefined = cases.find((x) => x.authId === activeCaseId);

  if (!c) {
    return (
      <div className="text-center py-16 text-sm text-gray-400">
        Case not found.{' '}
        <button
          onClick={() => setView('portal')}
          className="text-[#1669c1] font-semibold hover:underline"
        >
          ← Back to Authorizations
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Back + header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <button
            onClick={() => setView('portal')}
            className="mb-2 inline-flex items-center gap-1 text-xs text-[#1669c1] font-semibold hover:underline"
          >
            ← Back to Authorizations
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{c.patient}</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Member ID: {c.memberId} · Auth ID:{' '}
            <span className="font-mono font-bold text-gray-700">{c.authId}</span>
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${STATUS_STYLE[c.status] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}
        >
          <span className="h-2 w-2 rounded-full bg-current" />
          {c.status}
        </span>
      </div>

      {/* Summary row */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Service', value: c.service },
          { label: 'CPT Code', value: c.cpt },
          { label: 'Date Requested', value: c.dateRequested },
          { label: 'Channel', value: c.channel },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
              {item.label}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-gray-800">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Left column: checklist + DTR */}
        <div className="lg:col-span-2 flex flex-col gap-5">
          {/* Coverage Requirements */}
          <Section title="Coverage Requirements">
            <div className="divide-y divide-gray-100">
              {c.checklist.map((item, i) => (
                <div key={i} className="flex items-start gap-3 py-3">
                  <span
                    className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${item.pass ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                  >
                    {item.pass ? '✓' : '✗'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-800">{item.label}</p>
                    <p className="text-xs text-gray-500">{item.detail}</p>
                  </div>
                  {item.source && (
                    <span className="flex-shrink-0 rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase text-gray-400">
                      {item.source}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Section>

          {/* Clinical Documentation */}
          <Section title="Clinical Documentation">
            <div className="divide-y divide-gray-100">
              {c.dtr.map((item, i) => (
                <div key={i} className="flex items-start gap-3 py-3">
                  <span
                    title={
                      item.status === 'met'
                        ? 'Met'
                        : item.status === 'attached'
                          ? 'Attached — pending payer review'
                          : 'Gap — not satisfied'
                    }
                    className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                      item.status === 'met'
                        ? 'bg-green-100 text-green-700'
                        : item.status === 'attached'
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'bg-red-100 text-red-600'
                    }`}
                  >
                    {item.status === 'met' ? '✓' : item.status === 'attached' ? '●' : '✗'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-800">{item.title}</p>
                    <p className="text-xs text-gray-500">
                      {item.evidence || 'No evidence on record'}
                    </p>
                  </div>
                  {item.source && (
                    <span className="flex-shrink-0 rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase text-gray-400">
                      {item.source}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Section>

          {/* Submission Details */}
          <Section title="Submission Details">
            <div className="divide-y divide-gray-100 text-sm">
              {[
                { label: 'Auth Number', value: c.submission.paNumber },
                { label: 'Channel', value: c.submission.payloadType },
                { label: 'Submitted', value: c.submission.timestamp },
                { label: 'Payer Endpoint', value: c.submission.payerEndpoint },
              ].map((row) => (
                <div key={row.label} className="flex gap-3 py-2.5">
                  <span className="w-32 flex-shrink-0 text-xs font-bold text-gray-400 uppercase tracking-wide pt-0.5">
                    {row.label}
                  </span>
                  <span className="font-mono text-xs text-gray-700 break-all">{row.value}</span>
                </div>
              ))}
            </div>
          </Section>
        </div>

        {/* Right column: status timeline */}
        <div>
          <Section title="Status Timeline">
            <ol className="relative ml-2 border-l border-gray-200 py-1">
              {c.timeline.map((entry, i) => (
                <TimelineItem key={i} entry={entry} isLast={i === c.timeline.length - 1} />
              ))}
            </ol>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 bg-gray-50 px-4 py-2.5">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{title}</h2>
      </div>
      <div className="px-4 pb-2">{children}</div>
    </div>
  );
}

function TimelineItem({ entry, isLast }: { entry: TimelineEntry; isLast: boolean }) {
  return (
    <li className="mb-5 ml-5">
      <span
        className={`absolute -left-2 flex h-4 w-4 items-center justify-center rounded-full ${TIMELINE_COLOR[entry.color] ?? 'bg-gray-400'}`}
      />
      <p className="text-sm font-semibold text-gray-800">{entry.status}</p>
      <p className="text-xs text-gray-400">{entry.ts}</p>
      {!isLast && <div className="mt-1" />}
    </li>
  );
}
