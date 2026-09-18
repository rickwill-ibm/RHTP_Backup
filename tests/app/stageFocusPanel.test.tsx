// @vitest-environment jsdom
/**
 * Render test (E13 test-link) for StageFocusPanel: the four governance columns render, the focused
 * stage's sealed auditEntry + evidenceTier→permittedRung appear, and the persistent adverse floor
 * ("always a human") is present.
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('@/components/ui/StatusBadge', () => ({
  default: (p: { label: string }) => React.createElement('span', null, p.label),
}));

import { render, cleanup } from '@testing-library/react';
import { createSim, PATH, execEarnedCeiling } from '@/lib/goldenThread/flowSim';
import { StageFocusPanel } from '@/components/goldenThread/flow/StageFocusPanel';

afterEach(cleanup);

const sim = createSim(20260914);
const PAYER_OPS_IDX = PATH.findIndex((p) => p.stage.key === 'payer-ops');

describe('StageFocusPanel', () => {
  it('renders four columns, the sealed auditEntry, the tier→authority, and the adverse floor', () => {
    const stage = PATH[PAYER_OPS_IDX].stage;
    const { container } = render(<StageFocusPanel sim={sim} focused={PAYER_OPS_IDX} />);
    const text = container.textContent ?? '';
    // four columns (the write column is named "What this stage writes")
    expect(text).toContain('Who acts');
    expect(text).toContain('What this stage writes');
    expect(text).toContain('Authority');
    expect(text).toContain('Hand-off');
    // the sealed ledger entry for this stage
    expect(text).toContain(stage.auditEntry);
    // the persistent adverse floor rail
    expect(text.toLowerCase()).toContain('always a human');
  });

  it('never displays authority above the fleet earned ceiling (cold start = A0)', () => {
    // Under a fresh sim the fleet has earned nothing, so a stage whose STATIC capability is
    // autonomous (A2/A3, non-adverse) must be shown CAPPED — the panel must not assert unearned autonomy.
    const ceiling = execEarnedCeiling(sim); // 0 at cold start
    const highIdx = PATH.findIndex(
      (p) =>
        !p.stage.verdict.requiresHuman &&
        Number(p.stage.verdict.permittedRung.replace(/\D/g, '')) > 1
    );
    expect(highIdx).toBeGreaterThanOrEqual(0);
    const cap = PATH[highIdx].stage.verdict.permittedRung; // e.g. A3
    const { container } = render(<StageFocusPanel sim={sim} focused={highIdx} />);
    const text = container.textContent ?? '';
    // the capped/earned language is present and names the real ceiling
    expect(text.toLowerCase()).toMatch(/capped|not yet earned/);
    expect(text).toContain(`A${ceiling}`);
    // the raw capability is disclosed as "capability", never asserted as the live permitted rung
    expect(text).toContain(cap);
  });
});
