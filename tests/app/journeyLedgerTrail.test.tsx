// @vitest-environment jsdom
/**
 * Render test (E13 test-link) for JourneyLedgerTrail: it mounts against a real seeded sim and
 * renders the hash-chain seal status + the NIST AI-RMF function legend + the honesty caption.
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('@/components/ui/StatusBadge', () => ({
  default: (p: { label: string }) => React.createElement('span', null, p.label),
}));

import { render, cleanup } from '@testing-library/react';
import { createSim } from '@/lib/goldenThread/flowSim';
import {
  JourneyLedgerTrail,
  entryBelongsToStage,
} from '@/components/goldenThread/flow/JourneyLedgerTrail';

afterEach(cleanup);

describe('JourneyLedgerTrail', () => {
  it('renders the seal status and the NIST legend', () => {
    const { container } = render(<JourneyLedgerTrail sim={createSim(20260914)} focused={5} />);
    const text = container.textContent ?? '';
    expect(text).toMatch(/seal intact|seal BROKEN/);
    expect(text).toContain('GOVERN');
    expect(text).toContain('MAP');
    expect(text).toContain('MEASURE');
    expect(text).toContain('MANAGE');
    // honesty caption
    expect(text).toMatch(/NIST does not certify AI systems/);
  });

  it('folds payer-ops UM act keys to the stage so the flagship stage is not silently unlit', () => {
    // The engine seals UM work under sub-step act keys, never under 'payer-ops'. The highlight must
    // fold them back — otherwise the one governance-critical stage highlights nothing (the review find).
    for (const fired of ['nurse', 'rfi', 'md', 'deemed-adverse', 'determination', 'intake']) {
      expect(entryBelongsToStage(fired, 'payer-ops')).toBe(true);
    }
    // and it must not over-match: a claim seal does not belong to payer-ops
    expect(entryBelongsToStage('claim', 'payer-ops')).toBe(false);
    // other stages still match on their own key exactly
    expect(entryBelongsToStage('claim', 'claim')).toBe(true);
    expect(entryBelongsToStage('nurse', 'claim')).toBe(false);
  });
});
