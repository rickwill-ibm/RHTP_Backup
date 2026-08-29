'use client';
/**
 * ReviewSubmitView — Step 4: Confirm evidence and submit the PAS bundle.
 * HITL gate: the authenticated reviewer must explicitly attest before submission —
 * an agent may PREPARE the request but cannot submit autonomously. The approver of
 * record is NOT a name typed here; it is bound server-side from the authenticated
 * session (src/lib/authz/approvalAuthority.ts). This control captures the human's
 * intent to approve, not their identity.
 * Ported from PA-Standalone-SmartApp.
 */
import { useState } from 'react';
import { usePaStore } from '@/lib/pa/usePaStore';
import { submitPriorAuth } from '@/lib/pa/pasService';
import { toast } from 'sonner';
import type { PaCase, PaStatus, TimelineEntry } from '@/lib/pa/pa-types';
import { dtrSubmitReadiness } from '@/lib/pa/dtrReadiness';

export default function ReviewSubmitView() {
  const {
    order,
    patient,
    crdResults,
    dtrResults,
    channel,
    setChannel,
    submitLoading,
    setSubmitLoading,
    submittedCase,
    setSubmittedCase,
    setView,
  } = usePaStore();

  const [approvalConfirmed, setApprovalConfirmed] = useState(false);

  async function handleSubmit() {
    if (!order || !patient || !crdResults || !dtrResults) return;
    if (!approvalConfirmed) {
      toast.error('Confirm the human-approval attestation before submitting.');
      return;
    }
    // Gate on genuine DTR resolution, not mere presence (E2/M3): every required group met or attached.
    const readiness = dtrSubmitReadiness(dtrResults);
    if (!readiness.ready) {
      toast.error(`Resolve ${readiness.blocking.length} required DTR group(s) before submitting.`);
      return;
    }
    setSubmitLoading(true);
    try {
      const submission = await submitPriorAuth({
        channel,
        order,
        patient,
        crd: crdResults,
        dtr: dtrResults,
      });
      // Truthful status (M2/A5): an errored transport does not become a green success or a fake PA #.
      const outcome = submission.outcome ?? 'submitted';
      if (outcome === 'error') {
        toast.error(submission.disposition ?? 'Submission failed — not accepted by the payer.');
        return;
      }
      const caseStatus: PaStatus = outcome === 'pended' ? 'Pended' : 'Submitted';
      const timelineColor: TimelineEntry['color'] = outcome === 'pended' ? 'amber' : 'blue';
      const serviceSummary = order.procedures.map((p) => p.cptDesc).join('; ');
      const cptSummary = order.procedures.map((p) => p.cpt).join(', ');
      const multi = order.procedures.length > 1;
      const newCase: PaCase = {
        authId: submission.paNumber,
        patient: patient.name,
        memberId: patient.memberId,
        service: serviceSummary,
        cpt: cptSummary,
        procedures: order.procedures,
        dateRequested: new Date().toLocaleDateString('en-US'),
        channel: channel === 'fhir' ? 'FHIR' : 'EDI',
        status: caseStatus,
        checklist: crdResults.flatMap((entry) =>
          Object.values(entry.result).map((c) => ({
            label: multi ? `${c.label} (CPT ${entry.cpt})` : c.label,
            detail: c.detail,
            pass: c.pass,
            source: c.source,
          }))
        ),
        dtr: dtrResults.flatMap((dtr) =>
          dtr.groups.map((g) => ({
            title: multi ? `${g.title} (CPT ${dtr.cptCode})` : g.title,
            // Three honest states: met; attached (evidence uploaded, pending payer review); gap
            // (genuinely missing). NEVER collapse attached into gap — they are opposite dispositions.
            status: (g.status === 'met'
              ? 'met'
              : g.uploadedDocumentReference || g.uploadedEvidence
                ? 'attached'
                : 'gap') as 'met' | 'gap' | 'attached',
            evidence: g.uploadedEvidence ?? g.leaf?.evidence ?? '',
            source:
              g.status === 'pending' && g.uploadedDocumentReference
                ? 'upload'
                : (g.leaf?.source ?? null),
          }))
        ),
        submission,
        timeline: [{ status: caseStatus, ts: submission.timestamp, color: timelineColor }],
      };
      setSubmittedCase(newCase);
      toast.success(`Prior Authorization ${caseStatus.toLowerCase()} — ${submission.paNumber}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Submission failed');
    } finally {
      setSubmitLoading(false);
    }
  }

  if (!order || !crdResults || !dtrResults) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-5">Review &amp; Submit</h1>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">
          <p className="mb-4">
            Nothing to review yet — complete Steps 1–3 (Order → CRD → DTR) first.
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

  const totalCrd = crdResults.reduce((n, e) => n + Object.keys(e.result).length, 0);
  const passedCrd = crdResults.reduce(
    (n, e) => n + Object.values(e.result).filter((c) => c.pass).length,
    0
  );
  const totalDtr = dtrResults.reduce((n, d) => n + d.groups.length, 0);
  const metDtr = dtrResults.reduce(
    (n, d) => n + d.groups.filter((g) => g.status === 'met').length,
    0
  );
  const readiness = dtrSubmitReadiness(dtrResults);
  const resolvedDtr = dtrResults.reduce(
    (n, d) => n + d.groups.filter((g) => g.status !== 'gap').length,
    0
  );
  const submittedPended = submittedCase?.status === 'Pended';

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Review &amp; Submit</h1>
        <p className="text-sm text-gray-500 mt-1">
          Confirm details and choose a submission channel before sending the prior authorization
          request.
        </p>
      </div>

      {patient && (
        <div className="mb-4 rounded-xl border border-l-[5px] border-l-[#5d7a94] border-gray-200 bg-gradient-to-b from-gray-50 to-blue-50/30 px-5 py-4">
          <div className="flex flex-wrap gap-6 items-center mb-2">
            <div className="font-bold text-gray-900">{patient.name}</div>
            <div className="text-sm text-gray-500">
              <span className="font-semibold text-gray-700">DOB:</span> {patient.dob}
            </div>
            <div className="text-sm text-gray-500">
              <span className="font-semibold text-gray-700">Member ID:</span> {patient.memberId}
            </div>
          </div>
          <div className="text-sm text-gray-500">
            <span className="font-semibold text-gray-700">Procedures:</span>{' '}
            {order.procedures.map((p) => `${p.cptDesc} (CPT ${p.cpt})`).join('; ')}
          </div>
        </div>
      )}

      <SummaryCard
        title="Part I · CRD Checklist"
        pill={`${passedCrd} of ${totalCrd}`}
        green={passedCrd === totalCrd}
      >
        <p
          className={`text-xs ${passedCrd === totalCrd ? 'text-gray-400' : 'text-amber-600 font-semibold'}`}
        >
          {passedCrd === totalCrd
            ? `All coverage checks passed across ${crdResults.length} procedure${crdResults.length > 1 ? 's' : ''}.`
            : `${totalCrd - passedCrd} of ${totalCrd} coverage checks did not pass — review before submitting.`}
        </p>
      </SummaryCard>

      <SummaryCard
        title="Part II · DTR Match Results"
        pill={`${resolvedDtr} of ${totalDtr} resolved`}
        green={readiness.ready}
      >
        <p
          className={`text-xs ${!readiness.ready ? 'text-amber-600 font-semibold' : 'text-gray-400'}`}
        >
          {!readiness.ready
            ? `${readiness.blocking.length} required group(s) unresolved — upload supporting documentation in DTR.`
            : `${metDtr} met, ${resolvedDtr - metDtr} attached for payer review — all required groups resolved.`}
        </p>
      </SummaryCard>

      {/* Channel selection */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm mb-4">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">
          Submission Channel
        </p>
        {(
          [
            {
              value: 'fhir' as const,
              title: 'Submit as FHIR PAS Bundle (Claim/$submit)',
              sub: 'Recommended — payer supports FHIR-based Prior Authorization Support (PAS)',
              recommended: true,
            },
            {
              value: 'edi' as const,
              title: 'Submit as X12 275/278 (EDI)',
              sub: 'Legacy transaction set, routed through clearinghouse',
              recommended: false,
            },
          ] as const
        ).map((opt) => (
          <label
            key={opt.value}
            className={`flex items-start gap-3 rounded-lg border-[1.5px] p-4 mb-2 cursor-pointer transition-colors ${channel === opt.value ? 'border-[#1669c1] bg-blue-50/40' : 'border-gray-200 hover:border-[#1669c1]'}`}
          >
            <input
              type="radio"
              name="channel"
              value={opt.value}
              checked={channel === opt.value}
              onChange={() => setChannel(opt.value)}
              className="mt-0.5 accent-[#1669c1]"
            />
            <div>
              <p className="text-sm font-bold text-gray-900">{opt.title}</p>
              <p
                className={`text-xs mt-0.5 ${opt.recommended ? 'text-green-700 font-semibold' : 'text-gray-400'}`}
              >
                {opt.sub}
              </p>
            </div>
          </label>
        ))}
      </div>

      {/* HITL approval attestation — intent, not identity. The approver of record is
          bound server-side from the authenticated reviewer session. */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm mb-4">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">
          Human Approval Required
        </p>
        <p className="text-xs text-gray-500 mb-3">
          An agent may prepare the request but cannot submit autonomously. The approver of record is
          recorded from your authenticated reviewer session — not entered here.
        </p>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={approvalConfirmed}
            onChange={(e) => setApprovalConfirmed(e.target.checked)}
            className="mt-0.5 accent-[#1669c1]"
          />
          <span className="text-sm text-gray-700">
            I am the reviewer of record and I approve this prior-authorization submission.
          </span>
        </label>
      </div>

      {/* Submit / Success */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm text-center">
        {submittedCase ? (
          <div>
            <div
              className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border-2 ${submittedPended ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'}`}
            >
              <svg
                className={`h-6 w-6 ${submittedPended ? 'text-amber-600' : 'text-green-600'}`}
                viewBox="0 0 16 16"
                fill="none"
              >
                <path
                  d="M3 8.5L6.2 11.5L13 4.5"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p className="text-xs text-gray-400 mb-1">Prior Authorization {submittedCase.status}</p>
            <p className="text-2xl font-bold text-[#1669c1] mb-1">{submittedCase.authId}</p>
            <p className="text-xs text-gray-400 mb-4">{submittedCase.submission.timestamp}</p>
            {submittedCase.submission.disposition && (
              <p className="text-xs text-gray-500 mb-3">{submittedCase.submission.disposition}</p>
            )}
            <div
              className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold mb-5 ${submittedPended ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-green-200 bg-green-50 text-green-700'}`}
            >
              Case added to PA Portal with status {submittedCase.status}
            </div>
            <br />
            <button
              onClick={() => setView('portal')}
              className="inline-flex items-center gap-2 rounded-lg bg-[#1669c1] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#0f52a0] transition-colors"
            >
              View in PA Portal →
            </button>
          </div>
        ) : submitLoading ? (
          <div className="flex flex-col items-center gap-4 text-gray-400 py-4">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" />
            <p className="text-sm font-semibold">Submitting to payer…</p>
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-500 mb-5">
              Ready to submit. This will generate a Prior Authorization number and route the request
              to the payer.
            </p>
            <button
              onClick={handleSubmit}
              disabled={!approvalConfirmed || !readiness.ready}
              className="inline-flex items-center gap-2 rounded-lg bg-[#1669c1] px-7 py-3.5 text-sm font-bold text-white hover:bg-[#0f52a0] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Approve &amp; Submit Prior Authorization
            </button>
            {!readiness.ready && (
              <p className="mt-2 text-xs text-amber-600">
                {readiness.blocking.length} required DTR group(s) unresolved — resolve them in DTR
                first.
              </p>
            )}
            {readiness.ready && !approvalConfirmed && (
              <p className="mt-2 text-xs text-gray-400">
                Confirm the attestation above to enable submission.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  pill,
  green,
  children,
}: {
  title: string;
  pill: string;
  green: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm mb-4 flex items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-xs font-bold ${green ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {pill}
        </span>
        <span className="text-sm font-bold text-gray-900">{title}</span>
      </div>
      {children}
    </div>
  );
}
