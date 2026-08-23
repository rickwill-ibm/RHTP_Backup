// @vitest-environment jsdom
/**
 * Value-Set Governance Console — component/render tests (Iteration 8A-iii,
 * Wave D convergence).
 *
 * The console now reads the REAL Wave-A engine (governanceApi.ts delegates to a
 * seeded ValueSetGovernanceService + the real membership data layer). These tests
 * prove the workflow gates render + gate by role/mode, the SINGLE maker-checker
 * rule disables self-approval (E9: a disabled control must not be a false-enable,
 * and the UI must not perform a forbidden approval), and the replay panel calls
 * the real read API.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';

// Shared UI leaf components are compiled with jsx:preserve (Next.js) under the
// root tsconfig, which the vitest/vite transform does not process. Mock them with
// light stand-ins so the render tree loads without pulling those preserved files.
vi.mock('@/components/ui/StatusBadge', () => ({
  default: (p: { label: string }) => React.createElement('span', null, p.label),
}));
vi.mock('@/components/ui/AppIcon', () => ({ default: () => null }));

import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import ValueSetGovernanceConsole from '@/app/admin-console/value-set-governance/components/Console';
import {
  DEMO_PRINCIPALS,
  evaluateApprovalGate,
  governanceModeForRole,
  listValueSetVersions,
  replayBinding,
} from '@/app/admin-console/value-set-governance/governanceApi';

afterEach(cleanup);

describe('ValueSetGovernanceConsole', () => {
  it('renders the version list with engine lifecycle states and a current badge', () => {
    render(<ValueSetGovernanceConsole principal={DEMO_PRINCIPALS.reviewer} />);
    const table = screen.getByRole('table', { name: /value-set versions/i });
    // The seeded engine versions render, newest first.
    expect(within(table).getByText('FY2028')).toBeTruthy();
    expect(within(table).getByText('FY2026')).toBeTruthy();
    expect(within(table).getByText('FY2025')).toBeTruthy();
    // Engine states (one lifecycle): FY2026 is Approved (Active); FY2025 Superseded.
    expect(within(table).getAllByText(/Approved \(Active\)/i).length).toBeGreaterThan(0);
    expect(within(table).getByText('Superseded')).toBeTruthy();
    expect(within(table).getAllByText('In Review').length).toBeGreaterThan(0);
    // The active (approved) version carries a "Current" badge.
    expect(within(table).getByText('Current')).toBeTruthy();
  });

  it('disables approve for the reviewer on a version THEY submitted (maker-checker self-approval)', () => {
    // FY2028 was submitted by the reviewer (Morgan Lee) — self-approval is blocked.
    const reviewer = DEMO_PRINCIPALS.reviewer;
    const own = listValueSetVersions().find((v) => v.version === 'FY2028')!;
    expect(own.state).toBe('in-review');
    expect(own.submittedBy).toBe(reviewer.id);

    render(<ValueSetGovernanceConsole principal={reviewer} />);
    fireEvent.click(screen.getByText('FY2028'));

    const approve = screen.getByTestId('approve-btn') as HTMLButtonElement;
    expect(approve.disabled).toBe(true); // E9: disabled, not a false-enable.
    expect(approve.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText(/maker-checker/i)).toBeTruthy();

    // E9: clicking performs NO approval (the handler re-checks the shared gate).
    fireEvent.click(approve);
    expect(screen.queryByText(/Approved FY2028/i)).toBeNull();

    const decision = evaluateApprovalGate(own, reviewer);
    expect(decision.enabled).toBe(false);
    expect(decision.reason).toMatch(/maker-checker/i);
  });

  it('enables approve for a reviewer on a version a DIFFERENT maker submitted', () => {
    // FY2027 was submitted by the steward — a reviewer other than the maker may approve.
    const reviewer = DEMO_PRINCIPALS.reviewer;
    const other = listValueSetVersions().find((v) => v.version === 'FY2027')!;
    expect(other.submittedBy).not.toBe(reviewer.id);
    expect(evaluateApprovalGate(other, reviewer).enabled).toBe(true);

    render(<ValueSetGovernanceConsole principal={reviewer} />);
    fireEvent.click(screen.getByText('FY2027'));
    const approve = screen.getByTestId('approve-btn') as HTMLButtonElement;
    expect(approve.disabled).toBe(false);
  });

  it('blocks a steward (not-a-reviewer) from approving even a version they did not submit', () => {
    // Separation of duties: the maker role cannot approve at all.
    const steward = DEMO_PRINCIPALS.steward;
    const other = listValueSetVersions().find((v) => v.version === 'FY2028')!;
    expect(other.submittedBy).not.toBe(steward.id);
    const decision = evaluateApprovalGate(other, steward);
    expect(decision.enabled).toBe(false);
    expect(decision.reason).toMatch(/value-set-reviewer/i);
  });

  it('hides the workflow controls in viewer mode', () => {
    const auditor = DEMO_PRINCIPALS.auditor;
    expect(governanceModeForRole(auditor.govRole)).toBe('viewer');

    render(<ValueSetGovernanceConsole principal={auditor} />);
    expect(screen.queryByTestId('approve-btn')).toBeNull();
    expect(screen.queryByTestId('reject-btn')).toBeNull();
    expect(screen.queryByRole('button', { name: /submit for approval/i })).toBeNull();
    expect(screen.getByText(/approval controls are hidden/i)).toBeTruthy();
    // History + replay remain available to a viewer.
    expect(screen.getByRole('tab', { name: /history/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /replay/i })).toBeTruthy();
  });

  it('renders the replay panel and calls the real read API with the code', () => {
    const spy = vi.fn(replayBinding);
    render(<ValueSetGovernanceConsole principal={DEMO_PRINCIPALS.reviewer} replay={spy} />);

    fireEvent.click(screen.getByRole('tab', { name: /replay/i }));
    expect(screen.getByText(/version replay/i)).toBeTruthy();

    const codeInput = screen.getByLabelText(/sample code/i);
    // R51 is a member of ICD-10-CM FY2025 (the first / newest-selected option is
    // FY2028; select the FY2025 option so the historical binding is a member).
    const versionSelect = screen.getByLabelText(/replay version/i) as HTMLSelectElement;
    const fy2025 = Array.from(versionSelect.options).find((o) => o.text.includes('FY2025'))!;
    fireEvent.change(versionSelect, { target: { value: fy2025.value } });
    fireEvent.change(codeInput, { target: { value: 'R51' } });
    fireEvent.click(screen.getByRole('button', { name: /replay binding/i }));

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][1]).toBe('R51');
    // Historical binding surfaces: R51 IS a member of FY2025 (retired only in FY2026).
    expect(screen.getByText(/in value set/i)).toBeTruthy();
  });

  it('replay does NOT fall back to current for an unmodeled version (E9)', () => {
    // FY2027 has no modeled membership — replay must report not-reproduced, never
    // a current-version answer dressed up as historical.
    const versions = listValueSetVersions();
    const fy2027 = versions.find((v) => v.version === 'FY2027')!;
    const r = replayBinding(fy2027.versionId, 'R51');
    expect(r.reproduced).toBe(false);
    expect(r.member).toBe(false);
    expect(r.asOfState).toBe('not-modeled');
  });
});
