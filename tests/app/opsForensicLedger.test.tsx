// @vitest-environment jsdom
/**
 * E13 test-link for GAP 4 — the transparent forensic re-derivation. Asserts that "Re-derive hash"
 * surfaces the recomputed vs stored hash + prev-link verdict inline, that a per-row expand renders the
 * sealed-provenance drill (ForensicEntryDetail), and that a PEND entry (reproducible:false) still
 * verifies ok:true and is presented as a design annotation, NOT a broken chain.
 */
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { createSim, verifyEntryDetail } from '@/lib/goldenThread/flowSim';
import { OpsForensicLedger } from '@/components/goldenThread/flow/OpsForensicLedger';
import { ForensicEntryDetail } from '@/components/goldenThread/flow/ForensicEntryDetail';

afterEach(cleanup);

describe('OpsForensicLedger — chain-consistency transparency', () => {
  it('Re-derive hash shows recomputed vs stored hash and the prev-link verdict', () => {
    const s = createSim(20260914);
    const { container } = render(<OpsForensicLedger s={s} />);
    fireEvent.click(screen.getAllByText('↻ Re-derive hash (chain-consistency)')[0]);
    const text = container.textContent ?? '';
    expect(text).toMatch(/HASH MATCHES/);
    expect(text).toMatch(/recomputed [0-9a-f]{8}/);
    expect(text).toMatch(/stored [0-9a-f]{8}/);
    expect(text).toMatch(/prev-link ok/);
  });

  it('a per-row expand renders the sealed-provenance drill', () => {
    const s = createSim(20260914);
    const { container } = render(<OpsForensicLedger s={s} />);
    fireEvent.click(screen.getAllByRole('button', { name: /Expand provenance/ })[0]);
    const text = container.textContent ?? '';
    expect(text).toMatch(/How to read this/);
    expect(text).toMatch(/Reproducible \(design annotation\)/);
    expect(text).toMatch(/Decision \(member-facing reason\)/);
  });

  it('a PEND entry (reproducible:false) still verifies and reads as a design annotation, not broken', () => {
    const s = createSim(20260914);
    const pend = s.ledger.find((e) => e.reproducible === false);
    expect(pend).toBeTruthy();
    // The chain is intact for the PEND entry — reproducible:false does NOT mean the chain broke.
    const detail = verifyEntryDetail(s, pend!.seq);
    expect(detail).toBeTruthy();
    expect(detail!.ok).toBe(true);
    expect(detail!.prevOk).toBe(true);
    // And the provenance drill frames it as a design annotation that still verifies.
    const { container } = render(<ForensicEntryDetail e={pend!} s={s} />);
    const text = container.textContent ?? '';
    expect(text).toMatch(/design annotation/i);
    expect(text).toMatch(/still sealed|still verifies/i);
  });
});
