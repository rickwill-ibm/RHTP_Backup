// @vitest-environment jsdom
/**
 * RecoveryDecisionPanel — render + behavior tests (Wave-5 UI, E13 test-link).
 *
 * Proves the HITL control POSTs to the REAL decision endpoint with the correct
 * body, renders the REAL outcome/error honestly (no faked success; the mock
 * submission is labeled not-transmitted), and — critically — NEVER renders the
 * member-embedding recovery id into the DOM (PHI discipline), even though it holds
 * it to address the endpoint.
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { RecoveryDecisionPanel } from '@/components/goldenThread/RecoveryDecisionPanel';

const RECOVERY_ID = 'ev-MARIA_SD_001-72148-1756512000000-recovery';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('RecoveryDecisionPanel', () => {
  it('approves via the real endpoint and renders a not-transmitted mock outcome', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ outcome: 'submitted', submissionRef: 'SUB-XYZ', workItemId: RECOVERY_ID }),
    })) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    render(<RecoveryDecisionPanel recoveryId={RECOVERY_ID} filingDeadline="2026-12-28T00:00:00.000Z" />);
    fireEvent.click(screen.getByRole('button', { name: /approve & submit appeal/i }));

    await waitFor(() => screen.getByText(/appeal approved & submission recorded/i));
    // Honest labeling — the mock is not transmitted.
    expect(screen.getByText(/not transmitted end-to-end/i)).toBeTruthy();
    expect(screen.getByText(/SUB-XYZ/)).toBeTruthy();

    // Called the REAL endpoint with the id in the URL and the decision in the body.
    const call = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe(`/api/recovery/${encodeURIComponent(RECOVERY_ID)}/decision`);
    expect(JSON.parse(call[1].body)).toEqual({ decision: 'approved' });
    // The body must NOT carry a decider (set server-side from the session).
    expect(call[1].body).not.toContain('decidedBy');
  });

  it('surfaces a real endpoint error verbatim (no faked success)', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 409,
      json: async () => ({ issue: [{ diagnostics: 'Recovery is past the timely-filing window' }] }),
    })) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    render(<RecoveryDecisionPanel recoveryId={RECOVERY_ID} />);
    fireEvent.click(screen.getByRole('button', { name: /approve & submit appeal/i }));

    await waitFor(() => screen.getByRole('alert'));
    expect(screen.getByText(/past the timely-filing window/i)).toBeTruthy();
    expect(screen.getByText(/HTTP 409/)).toBeTruthy();
    // No success copy leaked.
    expect(screen.queryByText(/submission recorded/i)).toBeNull();
  });

  it('never renders the member-embedding recovery id into the DOM (PHI discipline)', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ outcome: 'submitted', submissionRef: 'SUB-XYZ', workItemId: RECOVERY_ID }),
    })) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<RecoveryDecisionPanel recoveryId={RECOVERY_ID} />);
    // Before the click.
    expect(container.innerHTML).not.toContain('MARIA_SD_001');
    fireEvent.click(screen.getByRole('button', { name: /approve & submit appeal/i }));
    await waitFor(() => screen.getByText(/submission recorded/i));
    // After the outcome renders.
    expect(container.innerHTML).not.toContain('MARIA_SD_001');
    expect(container.innerHTML).not.toContain(RECOVERY_ID);
  });
});
