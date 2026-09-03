'use client';
/**
 * Provider View — Document & Close column.
 * Documentation (DocumentReference write-back), New Orders (ServiceRequest
 * write-back), Referrals, Sign / Return to Cerner session summary.
 * CMS-0057-F Prior Authorization: PA submit + ClaimResponse status polling.
 */
import React, { useEffect, useRef, useState } from 'react';
import MPageCard from './MPageCard';
import { statusTextCls } from './theme';
import { getFhirClient } from '@/lib/services/fhirClient';
import { useDocuments, useClaimResponseByRequest, useServiceRequests } from '@/lib/fhir/hooks';
import { ccText, fmtDate } from '@/lib/fhir/types';
import type { SmartLaunchContext } from '@/lib/smartFhirTypes';
import { submitPriorAuthClaim, type PaOutcome } from '@/lib/services/pasService';
import type { FhirClaimResponse } from '@/lib/fhir/types';

interface DocumentColumnProps {
  patientId: string;
  encounterId?: string;
  launchContext: SmartLaunchContext;
  sessionActions: string[];
  /** QuestionnaireResponse attached by DtrLaunchModal; enables PA submit */
  questionnaireResponseId?: string;
  onWriteComplete: (kind: 'note' | 'order' | 'referral', display: string, resourceId: string) => void;
  onOpenResource: (resourceType: string, resourceId: string, label: string) => void;
  onSignAndReturn: () => void;
}

// ── PA status badge ───────────────────────────────────────────────────────────
function PaStatusBadge({ claimId }: { claimId: string }) {
  const { data, loading, refresh } = useClaimResponseByRequest(claimId);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cr = (data as FhirClaimResponse[])[0];

  // Poll until terminal state
  useEffect(() => {
    const isTerminal = cr?.outcome === 'complete' || cr?.outcome === 'error';
    if (isTerminal) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    const ms = Number(process.env.NEXT_PUBLIC_PA_POLL_INTERVAL ?? 5000);
    intervalRef.current = setInterval(refresh, ms);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [cr?.outcome, refresh]);

  if (loading && !cr) {
    return <span className="text-[11px] text-[#5b6770]">Checking PA status…</span>;
  }
  if (!cr) {
    return <span className="text-[11px] text-[#5b6770]">Awaiting payer response…</span>;
  }

  const isApproved = cr.outcome === 'complete' && !cr.disposition?.toLowerCase().includes('denied');
  const isDenied   = cr.outcome === 'complete' && cr.disposition?.toLowerCase().includes('denied');
  const isPended   = cr.outcome === 'queued';

  return (
    <div className="mt-2 p-2 border rounded-sm text-[11.5px]" style={{
      background: isApproved ? '#f0fdf4' : isDenied ? '#fef2f2' : '#fffbeb',
      borderColor: isApproved ? '#86efac' : isDenied ? '#fca5a5' : '#fcd34d',
    }}>
      <p className={`font-semibold ${isApproved ? 'text-[#166534]' : isDenied ? 'text-[#991b1b]' : 'text-[#92400e]'}`}>
        PA Status: {isApproved ? 'Approved ✓' : isDenied ? 'Denied ✗' : isPended ? 'Pended ◷' : cr.outcome}
      </p>
      {cr.disposition && <p className="text-[#5b6770] mt-0.5">{cr.disposition}</p>}
      {cr.created && <p className="text-[#8a949c] mt-0.5">{fmtDate(cr.created)}</p>}
    </div>
  );
}

const QUICK_ORDERS = [
  { code: '4548-4', system: 'http://loinc.org', display: 'HbA1c', label: 'HbA1c (repeat)' },
  { code: '24323-8', system: 'http://loinc.org', display: 'Comprehensive metabolic panel', label: 'BMP/CMP — recheck K+' },
  { code: '9318-7', system: 'http://loinc.org', display: 'Albumin/Creatinine ratio urine', label: 'Urine microalbumin' },
  { code: '306285006', system: 'http://snomed.info/sct', display: 'Referral to nephrology service', label: 'Nephrology referral', referral: true },
  { code: '183524004', system: 'http://snomed.info/sct', display: 'Referral to endocrinology service', label: 'Endocrinology referral', referral: true },
];

export default function ProviderViewDocument({
  patientId,
  encounterId,
  launchContext,
  sessionActions,
  questionnaireResponseId,
  onWriteComplete,
  onOpenResource,
  onSignAndReturn,
}: DocumentColumnProps) {
  const docs = useDocuments(patientId);
  const serviceRequests = useServiceRequests(patientId);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  // PA state
  const [paSubmitting, setPaSubmitting] = useState(false);
  const [paClaimId, setPaClaimId] = useState<string | null>(null);
  const [paError, setPaError] = useState<string | null>(null);

  const referrals = serviceRequests.data.filter((sr) =>
    sr.category?.some((c) => ccText(c).toLowerCase().includes('referral')),
  );
  const orders = serviceRequests.data.filter(
    (sr) => !sr.category?.some((c) => ccText(c).toLowerCase().includes('referral')),
  );

  async function signNote() {
    if (!noteText.trim()) return;
    setSaving('note');
    setWriteError(null);
    try {
      const created = await getFhirClient().create<{ id?: string }>({
        resourceType: 'DocumentReference',
        status: 'current',
        type: {
          coding: [{ system: 'http://loinc.org', code: '11506-3', display: 'Progress note' }],
          text: 'Progress Note',
        },
        subject: { reference: `Patient/${patientId}` },
        date: new Date().toISOString(),
        author: [{ display: launchContext.practitionerName }],
        description: `Progress note — ${new Date().toLocaleDateString('en-US')}`,
        content: [
          {
            attachment: {
              contentType: 'text/plain',
              data: typeof window !== 'undefined' ? window.btoa(unescape(encodeURIComponent(noteText))) : '',
              title: `Progress Note ${new Date().toISOString().slice(0, 10)}`,
            },
          },
        ],
        context: encounterId ? { encounter: [{ reference: `Encounter/${encounterId}` }] } : undefined,
      });
      onWriteComplete('note', 'Progress note signed', created.id ?? 'unknown');
      setNoteText('');
      setNoteOpen(false);
      docs.refresh();
    } catch (err) {
      setWriteError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  }

  async function placeOrder(q: (typeof QUICK_ORDERS)[number]) {
    setSaving(q.code);
    setWriteError(null);
    try {
      const created = await getFhirClient().create<{ id?: string }>({
        resourceType: 'ServiceRequest',
        status: 'active',
        intent: 'order',
        priority: 'routine',
        category: q.referral
          ? [{ coding: [{ system: 'http://snomed.info/sct', code: '3457005', display: 'Patient referral' }], text: 'referral' }]
          : [{ coding: [{ system: 'http://snomed.info/sct', code: '15220000', display: 'Laboratory test' }], text: 'laboratory' }],
        code: { coding: [{ system: q.system, code: q.code, display: q.display }], text: q.label },
        subject: { reference: `Patient/${patientId}` },
        encounter: encounterId ? { reference: `Encounter/${encounterId}` } : undefined,
        requester: {
          reference: `Practitioner/${launchContext.practitionerId}`,
          display: launchContext.practitionerName,
        },
        authoredOn: new Date().toISOString(),
      });
      onWriteComplete(q.referral ? 'referral' : 'order', q.label, created.id ?? 'unknown');
      serviceRequests.refresh();
    } catch (err) {
      setWriteError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div>
      {/* ── Documentation ── */}
      <MPageCard
        title="Documentation"
        count={docs.data.length}
        fetchedAt={docs.fetchedAt}
        loading={docs.loading}
        error={docs.error}
        onRefresh={docs.refresh}
        actions={
          <button
            className="text-[11px] px-2 rounded-sm bg-white/15 border border-white/40 text-white hover:bg-white/25 leading-5"
            onClick={() => setNoteOpen((o) => !o)}
          >
            + New Note
          </button>
        }
      >
        {noteOpen && (
          <div className="p-2 border-b border-[#e2e7eb] bg-[#f7f9fa]">
            <textarea
              className="w-full border border-[#b7c1ca] rounded-sm p-2 text-[12.5px] min-h-[110px] focus:outline-none focus:border-[#2d4a63]"
              placeholder="Progress note — assessment & plan…"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
            />
            <div className="flex gap-2 mt-1.5">
              <button
                className="text-[11.5px] px-3 py-1 bg-[#2d4a63] text-white rounded-sm hover:bg-[#3a5a77] disabled:opacity-50"
                disabled={!noteText.trim() || saving === 'note'}
                onClick={signNote}
              >
                {saving === 'note' ? 'Signing…' : 'Sign Note → FHIR'}
              </button>
              <button
                className="text-[11.5px] px-3 py-1 border border-[#b7c1ca] rounded-sm hover:bg-white"
                onClick={() => setNoteOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        <table className="w-full">
          <tbody>
            {docs.data.map((d) => (
              <tr key={d.id} className="border-b border-[#eef1f4] last:border-0">
                <td className="px-3 py-1">
                  <button
                    className="text-[#00539b] hover:underline text-left"
                    onClick={() => d.id && onOpenResource('DocumentReference', d.id, ccText(d.type))}
                  >
                    {ccText(d.type)}
                  </button>
                  <div className="text-[11px] text-[#5b6770]">{d.author?.[0]?.display}</div>
                </td>
                <td className="px-2 py-1 text-right text-[11.5px] text-[#5b6770] whitespace-nowrap">
                  {fmtDate(d.date)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </MPageCard>

      {/* ── New Orders ── */}
      <MPageCard title="New Orders" count={orders.length}>
        {writeError && (
          <div className="px-3 py-1.5 text-[#c8102e] text-[11.5px] border-b border-[#eef1f4]">
            Write failed: {writeError}
          </div>
        )}
        <div className="p-2 grid grid-cols-1 gap-1">
          {QUICK_ORDERS.map((q) => (
            <button
              key={q.code}
              className="text-left text-[12px] px-2 py-1 border border-[#d5dce2] rounded-sm hover:border-[#2d4a63] hover:bg-[#f2f6f9] disabled:opacity-50"
              disabled={saving === q.code}
              onClick={() => placeOrder(q)}
            >
              {saving === q.code ? 'Placing…' : `＋ ${q.label}`}
            </button>
          ))}
        </div>
        {orders.length > 0 && (
          <table className="w-full border-t border-[#e2e7eb]">
            <tbody>
              {orders.map((sr) => (
                <tr key={sr.id} className="border-b border-[#eef1f4] last:border-0">
                  <td className="px-3 py-1">
                    <button
                      className={`hover:underline text-left ${statusTextCls(sr.status)}`}
                      onClick={() => sr.id && onOpenResource('ServiceRequest', sr.id, ccText(sr.code))}
                    >
                      {ccText(sr.code)}
                    </button>
                  </td>
                  <td className="px-2 py-1 text-right text-[11.5px] text-[#5b6770] whitespace-nowrap">
                    {sr.status} · {fmtDate(sr.authoredOn)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </MPageCard>

      {/* ── Referrals ── */}
      <MPageCard
        title="Referrals"
        count={referrals.length}
        fetchedAt={serviceRequests.fetchedAt}
        loading={serviceRequests.loading}
        error={serviceRequests.error}
        onRefresh={serviceRequests.refresh}
      >
        {referrals.length === 0 ? (
          <div className="px-3 py-1.5 italic text-[#5b6770]">No active referrals</div>
        ) : (
          <table className="w-full">
            <tbody>
              {referrals.map((sr) => (
                <tr key={sr.id} className="border-b border-[#eef1f4] last:border-0">
                  <td className="px-3 py-1">
                    <button
                      className="text-[#00539b] hover:underline text-left"
                      onClick={() => sr.id && onOpenResource('ServiceRequest', sr.id, ccText(sr.code))}
                    >
                      {ccText(sr.code)}
                    </button>
                    {sr.note?.[0]?.text && (
                      <div className="text-[11px] text-[#5b6770]">{sr.note[0].text}</div>
                    )}
                  </td>
                  <td className="px-2 py-1 text-right text-[11.5px] whitespace-nowrap">
                    <span className={statusTextCls(sr.status)}>{sr.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </MPageCard>

      {/* ── Prior Authorization (CMS-0057-F) ── */}
      <MPageCard title="Prior Authorization">
        <div className="px-3 py-2">
          {!paClaimId ? (
            <>
              <p className="text-[12px] text-[#5b6770] mb-2">
                Submit a prior authorization request for orders that require payer approval.
              </p>
              {paError && (
                <p className="text-[11.5px] text-[#c8102e] mb-2">Error: {paError}</p>
              )}
              <button
                className="text-[12px] px-3 py-1.5 bg-[#2d4a63] text-white rounded-sm hover:bg-[#3a5a77] disabled:opacity-50 w-full"
                disabled={paSubmitting || serviceRequests.data.length === 0}
                onClick={async () => {
                  const sr = serviceRequests.data[0];
                  if (!sr) return;
                  setPaSubmitting(true);
                  setPaError(null);
                  try {
                    const result = await submitPriorAuthClaim({
                      serviceRequest: sr as unknown as import('@/lib/smartFhirTypes').FhirServiceRequest,
                      patientId,
                      practitionerId: launchContext.practitionerId,
                      questionnaireResponseId,
                    });
                    setPaClaimId(result.claimId);
                    onWriteComplete('order', `PA submitted — ${result.outcome}`, result.claimResponseId);
                  } catch (err) {
                    setPaError(err instanceof Error ? err.message : String(err));
                  } finally {
                    setPaSubmitting(false);
                  }
                }}
              >
                {paSubmitting
                  ? 'Submitting PA…'
                  : questionnaireResponseId
                  ? '✓ Submit Prior Authorization (DTR complete)'
                  : 'Submit Prior Authorization'}
              </button>
              {serviceRequests.data.length === 0 && !serviceRequests.loading && (
                <p className="text-[11px] text-[#5b6770] mt-1">
                  No signed orders found. Sign orders first to submit a PA request.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-[12px] font-semibold text-[#1a1a1a] mb-1">
                PA submitted — Claim/{paClaimId}
              </p>
              <PaStatusBadge claimId={paClaimId} />
            </>
          )}
        </div>
      </MPageCard>

      {/* ── Sign & Return ── */}
      <MPageCard title="Sign / Return to Cerner">
        <div className="px-3 py-2">
          {sessionActions.length === 0 ? (
            <div className="italic text-[#5b6770] text-[11.5px] mb-2">
              No actions taken this session yet.
            </div>
          ) : (
            <ul className="mb-2 space-y-0.5">
              {sessionActions.map((a, i) => (
                <li key={i} className="text-[11.5px] text-[#1a1a1a]">
                  ✓ {a}
                </li>
              ))}
            </ul>
          )}
          <button
            className="w-full text-[12px] font-semibold px-3 py-1.5 bg-[#2d4a63] text-white rounded-sm hover:bg-[#3a5a77]"
            onClick={onSignAndReturn}
          >
            Review Session & Return to Cerner →
          </button>
        </div>
      </MPageCard>
    </div>
  );
}
