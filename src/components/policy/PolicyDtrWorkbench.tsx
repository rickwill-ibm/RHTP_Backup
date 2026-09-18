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
import { buildReleaseSummary, type ReleaseSummary } from '@/lib/policy/workflow/release';
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
import { CriteriaReviewPanel } from '@/components/policy/CriteriaReviewPanel';
import { AssistantDock } from '@/components/policy/workbench/AssistantDock';
import { projectCoverageRules } from '@/components/policy/workbench/generateInputs';
import type { CodeDisposition } from '@/lib/policy/crd/coverageDisposition';
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
import { summarizeDispositions, defaultDispositions } from '@/lib/policy/review/codeDisposition';
import { PromoteStage } from '@/components/policy/workbench/PromoteStage';

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
  // The maker's FINAL per-code coverage decisions, seeded from the section-inferred defaults and
  // overridden in the review panel. These — not the frozen ingest snapshot — drive the generated CRD.
  const [dispositions, setDispositions] = useState<Record<string, CodeDisposition>>({});
  // Seed for the Encoding Assistant when a reviewer clicks "Explain <code>" in a row's research drawer.
  // The nonce lets the same code be re-asked (re-fires the assistant's effect).
  const [assistantSeed, setAssistantSeed] = useState<{ code: string; nonce: number } | null>(null);
  const explainCode = (code: string): void =>
    setAssistantSeed((s) => ({ code, nonce: (s?.nonce ?? 0) + 1 }));
  const [record, setRecord] = useState<PolicyWorkflowRecord>({
    policyId: '',
    status: 'in-review',
  });
  const [requested, setRequested] = useState<WorkbenchStage>('ingest');
  const [, setProgress] = useState<ReviewProgress | null>(null);
  const [approver, setApprover] = useState('');
  const [signError, setSignError] = useState<string | null>(null);
  // The operational conclusion of a promotion — version, release window, effective date, change id,
  // and the queued stakeholder notifications. Computed once, when the policy is published.
  const [release, setRelease] = useState<ReleaseSummary | null>(null);
  const [showRollback, setShowRollback] = useState(false);
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
      setDispositions(parsed.dispositions ?? {});
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
    setDispositions({});
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
      const published = applyTransition(record, 'published', 'system', 'system');
      setRecord(published);
      // Stamp the release: a versioned, queued change with a future effective date — not "live now".
      setRelease(
        buildReleaseSummary({
          now: new Date(),
          policyId: published.policyId || (review?.guidelineId ?? 'authored-policy'),
          guidelineId: review?.guidelineId ?? undefined,
          priorVersion: null, // first authored release in this demo session
          submittedBy: published.submittedBy,
          approvedBy: published.approvedBy,
        })
      );
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
      {/* min-w-0: without it this 1fr grid item defaults to min-width:auto and won't shrink below its
          content's min-content width, so a long truncating descriptor forces the page to scroll sideways. */}
      <div className="min-w-0 space-y-5">
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
              {review.warnings.length > 0 && (
                <Pill tone="bg-amber-100 text-amber-800">
                  ⚠ {review.warnings.length} warning{review.warnings.length > 1 ? 's' : ''}
                </Pill>
              )}
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
              <>
                <CriteriaReviewPanel review={review} onSubmit={submitForSignoff} />
                <EncodingReviewPanel
                  review={review}
                  dispositions={dispositions}
                  onDispositionsChange={setDispositions}
                  onExplainCode={explainCode}
                  onSubmit={submitForSignoff}
                  onProgressChange={setProgress}
                />
              </>
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
            summary={summarizeDispositions(
              dispositions,
              defaultDispositions(review?.guidelineCodes, review?.notMedicallyNecessary)
            )}
          />
        )}

        {/* ===== ④ GENERATE — two sibling artifacts: CRD coverage rules + DTR package ===== */}
        {active === 'generate' && review && (
          <GenerateArtifactsStage
            coverageRules={projectCoverageRules(
              review.coverageRules ?? [],
              dispositions,
              review.questionnaireCanonical
            )}
            questionnaireCanonical={review.questionnaireCanonical}
            items={review.item}
            policyTitle={review.title}
            policyId={review.policyId}
            review={review}
            onBack={() => setRequested('signoff')}
            onContinue={() => setRequested('promote')}
          />
        )}

        {/* ===== ⑤ PROMOTE ===== */}
        {active === 'promote' && review && (
          <PromoteStage
            review={review}
            release={release}
            onSubmit={promote}
            showRollback={showRollback}
            onToggleRollback={() => setShowRollback((v) => !v)}
          />
        )}
      </div>

      <AssistantDock review={review} seededQuestion={assistantSeed ?? undefined} />
    </div>
  );
}

export default PolicyDtrWorkbench;
