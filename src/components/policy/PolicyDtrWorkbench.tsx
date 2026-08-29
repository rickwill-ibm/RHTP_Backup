'use client';

/**
 * Policy → DTR authoring workbench (policy-expert facing) — STAGED workflow orchestrator.
 *
 * A gated maker→checker pipeline, one stage visible at a time (Ingest → Review → Sign-off → Generate
 * → Promote). This file owns the state + transitions and renders the active stage; the stage bodies
 * live in `./workbench/*` and the shared parts in `./workbench/workbenchParts` (extracted for the
 * file-size cap). All stage/gate logic lives in the tested `@/lib/policy/workflow/stageflow` +
 * `lifecycle`; this shell is thin. Imports only TYPES from server modules.
 */
import { useMemo, useState } from 'react';
import { useAppContext } from '@/lib/appContext';
import type { PolicyReview } from '@/lib/policy/policyReview';
import type { ReviewProgress } from '@/lib/policy/review/encodingReview';
import { applyTransition, type PolicyWorkflowRecord } from '@/lib/policy/workflow/lifecycle';
import {
  approvalFromRecord,
  checkerApprove,
  makerSubmit,
  resolveActiveStage,
  type WorkbenchStage,
  type WorkbenchState,
} from '@/lib/policy/workflow/stageflow';
import { GenerateArtifactsStage } from '@/components/policy/workbench/GenerateArtifactsStage';
import { EncodingReviewPanel } from '@/components/policy/EncodingReviewPanel';
import { EncodingAssistantPanel } from '@/components/policy/EncodingAssistantPanel';
import { WorkflowStepper } from '@/components/policy/WorkflowStepper';
import {
  Pill,
  MAKER_REF,
  codeKey,
  type ReviewState,
} from '@/components/policy/workbench/workbenchParts';
import { IngestStage } from '@/components/policy/workbench/IngestStage';
import { CodeTableReviewStage } from '@/components/policy/workbench/CodeTableReviewStage';
import { SignoffStage } from '@/components/policy/workbench/SignoffStage';

interface OoIssue {
  issue?: { diagnostics?: string }[];
}

export function PolicyDtrWorkbench(): React.ReactElement {
  const [review, setReview] = useState<PolicyReview | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [tenant, setTenant] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(50);
  const [reviewState, setReviewState] = useState<Record<string, ReviewState>>({});
  const [record, setRecord] = useState<PolicyWorkflowRecord>({
    policyId: '',
    status: 'in-review',
  });
  const [requested, setRequested] = useState<WorkbenchStage>('ingest');
  const [, setProgress] = useState<ReviewProgress | null>(null);
  const [approver, setApprover] = useState('');
  const [signError, setSignError] = useState<string | null>(null);
  const { user } = useAppContext();
  // The encoding / DTR-authoring workbench is a payer MEDICAL-POLICY function — not patient care
  // coordination. Whoever operates it encodes medical-necessity criteria and coverage codes and acts
  // as the "maker" in the maker→checker control. So the role shown is that workbench role, NOT the
  // app's global care-coordination persona (`user.role` = care_manager).
  const operatorRole = 'Clinical Policy Analyst, UM';

  const approvals = approvalFromRecord(record);
  const wbState: WorkbenchState = {
    hasPromotableDoc: review?.promotable ?? false,
    submitted: approvals.submitted,
    approved: approvals.approved,
    promoted: approvals.promoted,
  };
  const active = resolveActiveStage(wbState, requested);

  async function runExtraction(file: File): Promise<void> {
    setLoading(true);
    setError(null);
    setReview(null);
    setReviewState({});
    setSignError(null);
    setApprover('');
    setFileName(file.name);
    setLastFile(file);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (tenant.trim()) fd.append('tenant', tenant.trim());
      const res = await fetch('/api/policy/dtr', { method: 'POST', body: fd });
      const body = (await res.json()) as unknown;
      if (!res.ok) {
        setError((body as OoIssue)?.issue?.[0]?.diagnostics ?? 'Extraction failed');
        return;
      }
      const parsed = body as PolicyReview;
      setReview(parsed);
      setRecord({ policyId: parsed.policyId, status: 'in-review' });
      setRequested('ingest');
      if (parsed.kind === 'code-table' && parsed.productSections) {
        const seed: Record<string, ReviewState> = {};
        parsed.productSections.forEach((s) =>
          s.procedures.forEach((p) =>
            p.codes.forEach((c, i) => {
              const k = codeKey(s.product, p.procedure, c.code, i);
              seed[k] = (c.confidence ?? 100) <= threshold ? 'pending' : 'accepted';
            })
          )
        );
        setReviewState(seed);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  function reset(): void {
    setReview(null);
    setError(null);
    setReviewState({});
    setRecord({ policyId: '', status: 'in-review' });
    setRequested('ingest');
    setApprover('');
    setSignError(null);
    setLastFile(null);
    setFileName(null);
  }

  const snippetFor = useMemo(() => {
    const map = new Map<string, string>();
    (review?.provenance ?? []).forEach((p) => {
      if (!map.has(p.value)) map.set(p.value, p.snippet);
    });
    return (code: string): string | undefined => map.get(code);
  }, [review]);

  const flagged = useMemo(() => {
    let total = 0;
    let reviewed = 0;
    if (review?.kind === 'code-table' && review.productSections) {
      review.productSections.forEach((s) =>
        s.procedures.forEach((p) =>
          p.codes.forEach((c, i) => {
            if ((c.confidence ?? 100) <= threshold) {
              total += 1;
              const st = reviewState[codeKey(s.product, p.procedure, c.code, i)];
              if (st === 'accepted' || st === 'flagged') reviewed += 1;
            }
          })
        )
      );
    }
    return { total, reviewed };
  }, [review, reviewState, threshold]);

  function setSt(k: string, s: ReviewState): void {
    setReviewState((r) => ({ ...r, [k]: s }));
  }

  function submitForSignoff(): void {
    const r = makerSubmit(record, MAKER_REF);
    setRecord(r.record);
    setSignError(r.error);
    setRequested('signoff');
  }
  function approve(): void {
    if (!approver) {
      setSignError('Select an approving reviewer.');
      return;
    }
    const r = checkerApprove(record, approver);
    setRecord(r.record);
    setSignError(r.error);
    if (!r.error) setRequested('generate');
  }
  function promote(): void {
    try {
      setRecord((rec) => applyTransition(rec, 'published', 'system', 'system'));
    } catch {
      /* published is a legal system transition from approved; ignore otherwise */
    }
  }

  const kindLabel =
    review?.kind === 'code-table'
      ? 'Code table (CRD coverage)'
      : review?.kind === 'criteria'
        ? 'Clinical guideline (DTR criteria)'
        : 'Unrecognized';
  const codeTableSubmittable = flagged.reviewed >= flagged.total;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Policy encoding workbench
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700">
              {user.name
                .split(' ')
                .map((w) => w.charAt(0))
                .join('')}
            </span>
            <span className="font-semibold text-slate-800">{user.name}</span>
            <span className="text-slate-300">·</span>
            <span className="font-medium text-slate-600">{operatorRole} · Maker</span>
          </span>
        </div>
        <WorkflowStepper state={wbState} active={active} onGo={setRequested} />

        {review && (
          <section className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
            <span className="flex h-9 w-9 items-center justify-center rounded bg-teal-50 text-teal-700">
              📄
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold">{review.title}</div>
              <div className="text-[11px] text-slate-400">
                {review.tenant ? `${review.tenant} · ` : ''}
                {review.sourceFile}
              </div>
            </div>
            <div className="ml-auto flex flex-wrap gap-1.5">
              <Pill tone="bg-violet-100 text-violet-800">{kindLabel}</Pill>
              <Pill
                tone={
                  review.promotable
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }
              >
                {review.promotable ? 'promotable' : 'not promotable'}
              </Pill>
              {review.kind === 'criteria' && (
                <Pill tone="bg-slate-100 text-slate-600">
                  {review.stats.criteria ?? 0} criteria
                </Pill>
              )}
              <Pill tone="bg-slate-100 text-slate-600">{review.stats.codes} codes</Pill>
            </div>
          </section>
        )}

        {/* ===== ① INGEST ===== */}
        {active === 'ingest' && (
          <IngestStage
            tenant={tenant}
            setTenant={setTenant}
            runExtraction={(f) => void runExtraction(f)}
            fileName={fileName}
            loading={loading}
            error={error}
            review={review}
            lastFile={lastFile}
            onReset={reset}
            onContinue={() => setRequested('review')}
          />
        )}

        {/* ===== ② REVIEW ===== */}
        {active === 'review' && review && (
          <>
            {review.warnings.length > 0 && (
              <section className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <ul className="list-disc space-y-1 pl-5">
                  {review.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </section>
            )}

            {review.kind === 'criteria' && (
              <EncodingReviewPanel
                review={review}
                onSubmit={submitForSignoff}
                onProgressChange={setProgress}
              />
            )}

            {review.kind === 'code-table' && (
              <CodeTableReviewStage
                review={review}
                threshold={threshold}
                setThreshold={setThreshold}
                reviewState={reviewState}
                setSt={setSt}
                flagged={flagged}
                snippetFor={snippetFor}
                submittable={codeTableSubmittable}
                onSubmit={submitForSignoff}
              />
            )}
          </>
        )}

        {/* ===== ③ SIGN-OFF ===== */}
        {active === 'signoff' && review && (
          <SignoffStage
            approved={approvals.approved}
            approver={approver}
            setApprover={setApprover}
            onApprove={approve}
            signError={signError}
            onBack={() => setRequested('review')}
            onContinue={() => setRequested('generate')}
          />
        )}

        {/* ===== ④ GENERATE — two sibling artifacts: CRD coverage rules + DTR package ===== */}
        {active === 'generate' && review && (
          <GenerateArtifactsStage
            coverageRules={review.coverageRules}
            questionnaireCanonical={review.questionnaireCanonical}
            items={review.item}
            onBack={() => setRequested('signoff')}
            onContinue={() => setRequested('promote')}
          />
        )}

        {/* ===== ⑤ PROMOTE ===== */}
        {active === 'promote' && review && (
          <section className="space-y-3 rounded-lg border border-slate-300 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold">Promote to tenant</h3>
            <p className="text-sm text-slate-600">
              Publish the signed-off policy version so the CRD/DTR artifacts go live
              {review.tenant ? ` for ${review.tenant}` : ''}. Versioned and audited.
            </p>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">
                {approvals.promoted
                  ? 'Promoted — live for the tenant. The CRD→DTR→PAS flow now serves these criteria.'
                  : 'Signed off and ready to publish.'}
              </span>
              <button
                type="button"
                disabled={approvals.promoted}
                onClick={promote}
                className="ml-auto rounded bg-blue-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {approvals.promoted ? '✓ Promoted' : 'Promote to production'}
              </button>
            </div>
          </section>
        )}
      </div>

      <div className="lg:sticky lg:top-4 lg:self-start">
        <div className="h-[70vh] lg:h-[calc(100vh-6rem)]">
          <EncodingAssistantPanel review={review} />
        </div>
      </div>
    </div>
  );
}

export default PolicyDtrWorkbench;
