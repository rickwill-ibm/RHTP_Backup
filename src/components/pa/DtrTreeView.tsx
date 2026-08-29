'use client';
/**
 * DtrTreeView — Step 3: Medical Necessity Match (Documentation Templates & Rules).
 * Two-column: Policy Requirement (left) vs. Patient Record Match (right).
 * Ported from PA-Standalone-SmartApp.
 */
import { useRef } from 'react';
import { usePaStore } from '@/lib/pa/usePaStore';
import PolicyRuleSummary from '@/components/pa/PolicyRuleSummary';
import type { DtrGroup, DtrLeaf, DtrResultEntry } from '@/lib/pa/pa-types';
import {
  groupPresentation,
  groupPresentationLabel,
  dtrSubmitReadiness,
} from '@/lib/pa/dtrReadiness';

export default function DtrTreeView() {
  const { dtrLoading, dtrResults, dtrError, resolveDtrGap, setView, openPatientRecord } =
    usePaStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingGap = useRef<{ cptCode: string; groupId: number } | null>(null);

  function handleUploadClick(cptCode: string, groupId: number) {
    pendingGap.current = { cptCode, groupId };
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !pendingGap.current) return;
    resolveDtrGap(pendingGap.current.cptCode, pendingGap.current.groupId, {
      name: file.name,
      type: file.type,
      size: file.size,
    });
    e.target.value = '';
    pendingGap.current = null;
  }

  if (dtrLoading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-5">DTR — Medical Necessity Match</h1>
        <div className="rounded-xl border border-gray-200 bg-white p-12 shadow-sm flex flex-col items-center gap-4 text-gray-400">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" />
          <p className="text-sm font-semibold">
            Fetching Questionnaire Package(s) and matching criteria…
          </p>
          <p className="text-xs">Matching documented evidence to this policy&apos;s criteria</p>
        </div>
      </div>
    );
  }

  if (dtrError) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-5">DTR — Medical Necessity Match</h1>
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          <strong>Error:</strong> {dtrError}
        </div>
      </div>
    );
  }

  if (!dtrResults || dtrResults.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-5">DTR — Medical Necessity Match</h1>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">
          <p className="mb-4">
            No DTR results yet — complete Steps 1–2 first (Order → CRD Checklist → Proceed to DTR).
          </p>
          <button
            onClick={() => setView('order')}
            className="inline-flex items-center gap-2 rounded-lg bg-[#1669c1] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0f52a0] transition-colors"
          >
            ← Back to Order
          </button>
        </div>
      </div>
    );
  }

  const readiness = dtrSubmitReadiness(dtrResults);
  const totalGroups = dtrResults.reduce((n, d) => n + d.groups.length, 0);
  const totalResolved = dtrResults.reduce(
    (n, d) => n + d.groups.filter((g) => groupPresentation(g) !== 'gap').length,
    0
  );

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">DTR — Medical Necessity Match</h1>
          <p className="text-sm text-gray-500 mt-1">
            Documentation Templates and Rules · medical-necessity criteria matched for this member
          </p>
        </div>
        <button
          onClick={openPatientRecord}
          className="inline-flex flex-shrink-0 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-bold text-gray-700 hover:border-[#1669c1] hover:text-[#1669c1] transition-colors whitespace-nowrap"
        >
          View Full Patient Record
        </button>
      </div>

      {dtrResults.length > 1 && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-gradient-to-b from-gray-50 to-blue-50/40 px-5 py-4">
          <p className="text-sm text-gray-500">
            {dtrResults.length} procedures matched against their own policy criteria
          </p>
          <div className="flex items-center gap-3 rounded-full border border-gray-200 bg-white px-4 py-2">
            <span className="text-sm font-bold text-gray-700">
              {totalResolved} of {totalGroups} requirement groups resolved overall
            </span>
          </div>
        </div>
      )}

      {dtrResults.map((dtr) => (
        <PolicyTree key={dtr.cptCode} dtr={dtr} onUpload={handleUploadClick} />
      ))}

      <div className="flex items-center justify-between flex-wrap gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-gray-500 max-w-lg">
          {readiness.ready
            ? 'All required requirement groups are resolved (met or attached for payer review). Ready to build the prior authorization submission.'
            : `${readiness.blocking.length} required group(s) still need documentation before you can submit.`}
        </p>
        <button
          onClick={() => setView('review')}
          disabled={!readiness.ready}
          className="inline-flex items-center gap-2 rounded-lg bg-[#1669c1] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0f52a0] transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
        >
          Continue to Submit →
        </button>
      </div>

      <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
    </div>
  );
}

function PolicyTree({
  dtr,
  onUpload,
}: {
  dtr: DtrResultEntry;
  onUpload: (cptCode: string, groupId: number) => void;
}) {
  const resolvedCount = dtr.groups.filter((g) => groupPresentation(g) !== 'gap').length;
  const pct = dtr.groups.length ? Math.round((resolvedCount / dtr.groups.length) * 100) : 0;

  return (
    <div className="mb-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-gradient-to-b from-gray-50 to-blue-50/40 px-5 py-4">
        <div>
          <p className="font-bold text-gray-900">{dtr.policyTitle}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            CPT {dtr.cptCode} · each required group must resolve to Met or Attached
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-full border border-gray-200 bg-white px-4 py-2">
          <span className="text-sm font-bold text-gray-700">
            {resolvedCount} of {dtr.groups.length} resolved
          </span>
          <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-[#1e8e5a] transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
      <div className="space-y-3">
        {dtr.groups.map((group) => (
          <GroupCard
            key={group.id}
            group={group}
            onUpload={() => onUpload(dtr.cptCode, group.id)}
          />
        ))}
      </div>
    </div>
  );
}

const PRESENTATION_STYLE = {
  met: {
    border: 'border-gray-200',
    header: 'bg-white',
    badge: 'bg-green-50 text-green-700 border-green-200',
  },
  'attached-pending': {
    border: 'border-indigo-200',
    header: 'bg-indigo-50/60',
    badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  gap: {
    border: 'border-amber-200',
    header: 'bg-amber-50/60',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
  },
} as const;

function GroupCard({ group, onUpload }: { group: DtrGroup; onUpload: () => void }) {
  // An upload marks a group ATTACHED — pending payer review, a distinct state from Met (M1/E1).
  const pres = groupPresentation(group);
  const style = PRESENTATION_STYLE[pres];
  const hasRequirementContent = !!(group.description || group.fhirQuery || group.sourceExcerpt);

  return (
    <div className={`rounded-xl border overflow-hidden ${style.border}`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-5 py-4 ${style.header}`}>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Group {group.id}
          </span>
          <span className="text-sm font-bold text-gray-900">{group.title}</span>
          {group.required === false && (
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">
              Optional
            </span>
          )}
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-xs font-bold ${style.badge}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {groupPresentationLabel(pres)}
        </span>
      </div>

      {/* Two-column body */}
      <div className="border-t border-gray-100 bg-gray-50/50 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-200">
        <div className="px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
            Policy Requirement
          </p>
          {hasRequirementContent ? (
            <PolicyRuleSummary
              description={group.description}
              fhirQuery={group.fhirQuery}
              sourceExcerpt={group.sourceExcerpt}
            />
          ) : (
            <p className="text-xs text-gray-400 italic">
              No requirement detail available for this group.
            </p>
          )}
        </div>
        <div className="px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
            Patient Record Match
          </p>
          {pres === 'met' && group.leaf && (
            <EvidenceBlock leaf={group.leaf} uploadedEvidence={group.uploadedEvidence} />
          )}
          {pres === 'met' && group.uploadedEvidence && !group.leaf && (
            <p className="text-sm font-semibold text-green-700">{group.uploadedEvidence}</p>
          )}
          {pres === 'attached-pending' && (
            <div>
              <p className="text-sm font-semibold text-indigo-700">
                {group.uploadedEvidence ?? 'Documentation attached'}
              </p>
              <p className="text-xs text-gray-500 mt-1.5">
                Submitted for payer review — not yet adjudicated as met. The payer will review the
                attached documentation against this criterion.
              </p>
            </div>
          )}
          {pres === 'gap' && (
            <div>
              {group.candidateCodes && group.candidateCodes.length > 0 && (
                <>
                  <p className="text-xs text-gray-500 mb-3">
                    Acceptable diagnosis codes (any one required):
                  </p>
                  <ul className="space-y-1.5 mb-4">
                    {group.candidateCodes.map((c) => (
                      <li key={c.code} className="flex items-center gap-2.5 text-sm text-gray-500">
                        <span className="h-2 w-2 rounded-full border-[1.5px] border-red-300 flex-shrink-0" />
                        <code className="rounded border border-gray-200 bg-white px-1.5 py-0.5 font-mono text-xs text-gray-800">
                          {c.code}
                        </code>
                        {c.label}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p className="text-xs italic text-gray-400 mb-3">
                No matching diagnosis found in EMR or Patient Access data.
              </p>
              <button
                onClick={onUpload}
                className="inline-flex items-center gap-2 rounded-lg border border-[#1669c1] px-4 py-2 text-xs font-bold text-[#1669c1] hover:bg-blue-50 transition-colors"
              >
                Upload Supporting Documentation
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EvidenceBlock({ leaf, uploadedEvidence }: { leaf: DtrLeaf; uploadedEvidence?: string }) {
  const hasDate = !!(leaf.dateOfService || leaf.recordedDate);
  return (
    <div>
      <span className="inline-block rounded-md border border-gray-200 bg-white px-2 py-0.5 font-mono text-xs font-bold text-gray-800">
        {leaf.code}
      </span>
      <p className="text-sm text-gray-700 mt-1.5">{leaf.label}</p>
      {(hasDate || leaf.performerName) && (
        <dl className="mt-2 space-y-1">
          {leaf.dateOfService ? (
            <div className="flex gap-1.5 text-xs">
              <dt className="flex-shrink-0 font-semibold text-gray-600">Date of Service:</dt>
              <dd className="text-gray-500">{fmtDate(leaf.dateOfService)}</dd>
            </div>
          ) : leaf.recordedDate ? (
            <div className="flex gap-1.5 text-xs">
              <dt className="flex-shrink-0 font-semibold text-gray-600">Recorded:</dt>
              <dd className="text-gray-500">{fmtDate(leaf.recordedDate)}</dd>
            </div>
          ) : null}
          {leaf.performerName && (
            <div className="flex gap-1.5 text-xs">
              <dt className="flex-shrink-0 font-semibold text-gray-600">Performing Provider:</dt>
              <dd className="text-gray-500">{leaf.performerName}</dd>
            </div>
          )}
        </dl>
      )}
      <p className="text-xs text-gray-400 mt-1.5">
        <strong className="text-gray-600">Evidence:</strong> {uploadedEvidence ?? leaf.evidence}
        {leaf.source && (
          <span className="ml-2 inline-block rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">
            {leaf.source === 'pa' ? 'Patient Access' : leaf.source === 'emr' ? 'EMR' : 'Uploaded'}
          </span>
        )}
      </p>
    </div>
  );
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}
