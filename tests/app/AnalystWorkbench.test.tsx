// @vitest-environment jsdom
/**
 * AnalystWorkbench — render + behavior tests (Wave-10 LIVE-WIRED, E13 test-link).
 *
 * Proves the thin client drives the REAL endpoints and renders what they return:
 *  - RUN GETs the Wave-8 analysis endpoint with the right party/analysis params and renders
 *    the finding FROM the response (not hardcoded);
 *  - a present-but-empty OK finding is labeled honestly;
 *  - APPROVE POSTs the Wave-9 governed-action route with the mapped actionType + decision and
 *    renders the returned governed-action outcome;
 *  - a PLAN-VALIDATE rejection and an auth/flag error are surfaced truthfully;
 *  - the member-embedding record id is NEVER rendered into the DOM (PHI discipline).
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import {
  AnalystWorkbench,
  governedActionFor,
  type WorkbenchAnalysis,
} from '@/components/goldenThread/AnalystWorkbench';

const RECORD_ID = 'ev-MARIA_SD_001-72148-1756512000000';
const ANALYSES: WorkbenchAnalysis[] = [
  { id: 'denial-rca', label: 'Denial root-cause', party: 'both' },
  { id: 'recovery-verification', label: 'Recovery verification', party: 'payer' },
  { id: 'member-cohort-drilldown', label: 'Member cohort drill-down', party: 'payer' },
];

function jsonRes(ok: boolean, status: number, body: unknown): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}
function fetchReturning(...responses: Response[]): typeof fetch {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  vi.stubGlobal('fetch', fn as unknown as typeof fetch);
  return fn as unknown as typeof fetch;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('governedActionFor mapping (A6 — faithful per-disposition governed types)', () => {
  it('maps a draft-appeal to a payer-facing appeal submission (human-gated)', () => {
    expect(governedActionFor('draft-appeal')).toEqual({ type: 'appeal', submission: true });
  });
  it('does NOT flatten distinct dispositions into a single generic ticket-update', () => {
    // A6: an urgent integrity tamper and a reconciliation escalation each map to their OWN
    // faithful governed type — no longer both collapsed into a generic ticket-update.
    expect(governedActionFor('freeze-and-escalate-integrity')).toEqual({
      type: 'integrity-freeze',
      submission: false,
    });
    expect(governedActionFor('escalate-reconciliation-review')).toEqual({
      type: 'provider-notice',
      submission: false,
    });
    expect(governedActionFor('draft-resubmission')).toEqual({
      type: 'x12-837-corrected',
      submission: true,
    });
    // The genuinely-routine internal dispositions remain ticket-updates.
    expect(governedActionFor('confirm-reconciliation')).toEqual({
      type: 'ticket-update',
      submission: false,
    });
    expect(governedActionFor('monitor')).toEqual({ type: 'ticket-update', submission: false });
    // The three distinct dispositions are NOT the same governed type (no flattening).
    const distinct = new Set(
      [
        'freeze-and-escalate-integrity',
        'escalate-reconciliation-review',
        'confirm-reconciliation',
      ].map((a) => governedActionFor(a).type)
    );
    expect(distinct.size).toBe(3);
  });
});

describe('AnalystWorkbench — RUN renders the real analysis result', () => {
  it('GETs the analysis endpoint with party+analysis params and renders the finding', async () => {
    const fetchMock = fetchReturning(
      jsonRes(true, 200, {
        analysis: {
          analysisId: 'denial-rca',
          party: 'payer',
          outcome: 'ok',
          finding: {
            analysisId: 'denial-rca',
            kind: 'rca',
            party: 'payer',
            recordRef: 'evidence-record',
            tier: 'C2',
            summary: 'carc=[45] groups=[CO] liability=payer appealable=100/100',
            anomaly: false,
            data: { hasRemittance: true },
          },
          action: {
            actionType: 'draft-appeal',
            priority: 'high',
            isSubmission: false,
            rung: 'A1',
            requiresHuman: true,
            resolved: false,
            reason: 'human gate',
          },
        },
        // A routed queue item is present only when the record carries a persisted recovery
        // draft — the precondition the governed Approve (ActionBlock) needs (FIX-2).
        routedEscalation: { queueItem: { recordRef: 'evidence-record' } },
      }) as Response
    );

    render(<AnalystWorkbench recordId={RECORD_ID} analyses={ANALYSES} />);
    fireEvent.click(screen.getByRole('button', { name: /run analysis/i }));

    await waitFor(() => screen.getByText(/liability=payer appealable=100\/100/i));
    // The finding text came FROM the response, not a literal in the component.
    expect(screen.getByText(/carc=\[45\]/)).toBeTruthy();
    // The interlock rung is rendered from the response.
    expect(screen.getByText(/A1/)).toBeTruthy();

    const call = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toContain(`/api/evidence/${encodeURIComponent(RECORD_ID)}`);
    expect(call[0]).toContain('party=payer');
    expect(call[0]).toContain('analysis=denial-rca');
  });

  it('labels a present-but-empty OK finding honestly (seed record has no matching data)', async () => {
    fetchReturning(
      jsonRes(true, 200, {
        analysis: {
          analysisId: 'denial-rca',
          party: 'payer',
          outcome: 'ok',
          finding: {
            analysisId: 'denial-rca',
            kind: 'rca',
            party: 'payer',
            recordRef: 'evidence-record',
            tier: 'C2',
            summary: 'no remittance on record — no denial to analyze',
            anomaly: false,
            data: { hasRemittance: false },
          },
          action: {
            actionType: 'monitor',
            priority: 'routine',
            isSubmission: false,
            rung: 'A0',
            requiresHuman: true,
            resolved: false,
            reason: 'monitor',
          },
        },
      }) as Response
    );
    render(<AnalystWorkbench recordId={RECORD_ID} analyses={ANALYSES} />);
    fireEvent.click(screen.getByRole('button', { name: /run analysis/i }));
    await waitFor(() => screen.getByText(/present, no matching data/i));
    expect(screen.getByText(/no remittance on record/i)).toBeTruthy();
  });
});

describe('AnalystWorkbench — APPROVE triggers the real governed action', () => {
  it('POSTs the Wave-9 route with the mapped actionType + decision and renders the outcome', async () => {
    const fetchMock = fetchReturning(
      jsonRes(true, 200, {
        analysis: {
          analysisId: 'denial-rca',
          party: 'payer',
          outcome: 'ok',
          finding: {
            analysisId: 'denial-rca',
            kind: 'rca',
            party: 'payer',
            recordRef: 'evidence-record',
            tier: 'C2',
            summary: 'no remittance on record — no denial to analyze',
            anomaly: false,
            data: { hasRemittance: false },
          },
          action: {
            actionType: 'monitor',
            priority: 'routine',
            isSubmission: false,
            rung: 'A0',
            requiresHuman: true,
            resolved: false,
            reason: 'monitor',
          },
        },
        // Persisted recovery present → the governed Approve is offered (FIX-2).
        routedEscalation: { queueItem: { recordRef: 'evidence-record' } },
      }) as Response,
      jsonRes(true, 200, {
        outcome: 'executed',
        actionType: 'ticket-update',
        rung: 'A0',
        isSubmission: false,
        workItemId: `${RECORD_ID}-recovery`,
      }) as Response
    );

    render(<AnalystWorkbench recordId={RECORD_ID} analyses={ANALYSES} />);
    fireEvent.click(screen.getByRole('button', { name: /run analysis/i }));
    await waitFor(() => screen.getByRole('button', { name: /approve & execute governed action/i }));
    fireEvent.click(screen.getByRole('button', { name: /approve & execute governed action/i }));

    await waitFor(() => screen.getByText(/governed action executed/i));
    expect(screen.getByText(/durable ticket lifecycle updated/i)).toBeTruthy();

    const post = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(post[0]).toBe(`/api/recovery/${encodeURIComponent(RECORD_ID)}-recovery/action`);
    expect(JSON.parse(post[1].body)).toEqual({ actionType: 'ticket-update', decision: 'approved' });
    expect(post[1].body).not.toContain('decidedBy');
  });

  it('FIX-2: with NO persisted recovery (no routed queue item) it does NOT offer Approve', async () => {
    // The analysis ran over a record with no recovery draft (e.g. a seed skeleton): the run has
    // an action but NO routed queue item. The workbench must NOT offer a governed Approve that
    // would 404 on the store — it surfaces the honest "nothing to submit" state instead.
    fetchReturning(
      jsonRes(true, 200, {
        analysis: {
          analysisId: 'denial-rca',
          party: 'payer',
          outcome: 'ok',
          finding: {
            analysisId: 'denial-rca',
            kind: 'rca',
            party: 'payer',
            recordRef: 'evidence-record',
            tier: 'C2',
            summary: 'no remittance on record — no denial to analyze',
            anomaly: false,
            data: { hasRemittance: false },
          },
          action: {
            actionType: 'monitor',
            priority: 'routine',
            isSubmission: false,
            rung: 'A0',
            requiresHuman: true,
            resolved: false,
            reason: 'monitor',
          },
        },
        // no routedEscalation.queueItem → the record carries no persisted recovery draft
      }) as Response
    );
    render(<AnalystWorkbench recordId={RECORD_ID} analyses={ANALYSES} />);
    fireEvent.click(screen.getByRole('button', { name: /run analysis/i }));
    await waitFor(() => screen.getByText(/no persisted recovery draft/i));
    expect(screen.queryByRole('button', { name: /approve & execute governed action/i })).toBeNull();
  });
});

describe('AnalystWorkbench — honest rejection / error states', () => {
  it('surfaces a PLAN-VALIDATE rejection from the response', async () => {
    fetchReturning(
      jsonRes(true, 200, {
        analysis: {
          analysisId: 'member-cohort-drilldown',
          party: 'payer',
          outcome: 'plan-rejected',
          ticket: {
            kind: 'plan-rejected',
            reason:
              "analysis 'member-cohort-drilldown' would read non-projected/PHI field(s): memberId",
            routed: { gate: 'hitl' },
          },
        },
      }) as Response
    );
    render(<AnalystWorkbench recordId={RECORD_ID} analyses={ANALYSES} />);
    // pick the PHI-reading analysis
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'member-cohort-drilldown' },
    });
    fireEvent.click(screen.getByRole('button', { name: /run analysis/i }));
    await waitFor(() => screen.getByText(/PLAN-VALIDATE rejected/i));
    expect(screen.getByText(/non-projected\/PHI field/i)).toBeTruthy();
  });

  it('surfaces an auth/flag error verbatim (no faked success)', async () => {
    fetchReturning(
      jsonRes(false, 403, {
        issue: [{ diagnostics: 'Requested member is outside the session scope' }],
      }) as Response
    );
    render(<AnalystWorkbench recordId={RECORD_ID} analyses={ANALYSES} />);
    fireEvent.click(screen.getByRole('button', { name: /run analysis/i }));
    await waitFor(() => screen.getByRole('alert'));
    expect(screen.getByText(/outside the session scope/i)).toBeTruthy();
    expect(screen.getByText(/HTTP 403/)).toBeTruthy();
  });
});

describe('AnalystWorkbench — PHI discipline', () => {
  it('never renders the member-embedding record id into the DOM', async () => {
    fetchReturning(
      jsonRes(true, 200, {
        analysis: {
          analysisId: 'denial-rca',
          party: 'payer',
          outcome: 'ok',
          finding: {
            analysisId: 'denial-rca',
            kind: 'rca',
            party: 'payer',
            recordRef: 'evidence-record',
            tier: 'C2',
            summary: 'no remittance on record',
            anomaly: false,
            data: { hasRemittance: false },
          },
        },
      }) as Response
    );
    const { container } = render(<AnalystWorkbench recordId={RECORD_ID} analyses={ANALYSES} />);
    expect(container.innerHTML).not.toContain('MARIA_SD_001');
    fireEvent.click(screen.getByRole('button', { name: /run analysis/i }));
    await waitFor(() => screen.getByText(/no remittance on record/i));
    expect(container.innerHTML).not.toContain('MARIA_SD_001');
    expect(container.innerHTML).not.toContain(RECORD_ID);
  });
});
