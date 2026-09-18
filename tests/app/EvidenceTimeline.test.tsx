// @vitest-environment jsdom
/**
 * EvidenceTimeline — component/render tests (Wave-2 W2-5).
 *
 * Proves the ADDITIVE golden-thread extension:
 *  - the 5 new financial entry types produce non-empty, PHI-safe summaries
 *    (references / codes / amounts only — never a memberId, name, or narrative);
 *  - existing (Wave-1) entry types render their summary text unchanged;
 *  - a record carrying a seal surfaces the record-level "Sealed" indicator, and
 *    the optional `integrity` prop surfaces the server-verified intact/signed state.
 *
 * StatusBadge is compiled with jsx:preserve (Next.js) and not processed by the
 * vitest transform, so it is mocked to a light stand-in (same idiom as the
 * value-set governance console tests) — the mock renders its `label` as text so
 * chip labels are assertable.
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';

// StatusBadge is compiled with jsx:preserve (Next.js) and not processed by the
// vitest transform; mock it to a light stand-in that renders its `label` as text
// so chip labels are assertable.
vi.mock('@/components/ui/StatusBadge', () => ({
  default: (p: { label: string }) => React.createElement('span', null, p.label),
}));

import { render, screen, cleanup } from '@testing-library/react';
import {
  EvidenceTimeline,
  summarizeEntry,
  STAGE_LABEL,
} from '@/components/goldenThread/EvidenceTimeline';
import type { EvidenceEntry, EvidenceRecord } from '@/lib/evidence';

afterEach(cleanup);

const MEMBER_ID = 'member-SECRET-123';

function baseRecord(entries: EvidenceEntry[], seal?: EvidenceRecord['seal']): EvidenceRecord {
  return {
    id: 'rec-1',
    memberId: MEMBER_ID,
    order: { code: '70551', display: 'MRI brain' },
    createdAt: '2026-09-11T10:00:00.000Z',
    status: 'open',
    entries,
    ...(seal ? { seal } : {}),
  };
}

const NEW_ENTRIES: EvidenceEntry[] = [
  {
    id: 'e-claim',
    ts: '2026-09-11T10:01:00.000Z',
    stage: 'claim',
    type: 'claim-submission',
    claimRef: 'CLM-9001',
    total: 1200,
  },
  {
    id: 'e-remit',
    ts: '2026-09-11T10:02:00.000Z',
    stage: 'remittance',
    type: 'remittance',
    remittanceId: 'RA-555',
    paidAmount: 800,
    adjustments: [
      { group: 'CO', amount: 300 },
      { group: 'CO', amount: 50 },
      { group: 'PR', amount: 50 },
    ],
    carcCodes: ['45', '97'],
    rarcCodes: ['N130'],
    carcGroups: ['CO', 'PR'],
  },
  {
    id: 'e-recon',
    ts: '2026-09-11T10:03:00.000Z',
    stage: 'reconciliation',
    type: 'reconciliation',
    verdict: 'underpaid',
    contractedAllowed: 1000,
    paidAmount: 800,
    delta: 200,
    toleranceApplied: 5,
  },
  {
    id: 'e-under',
    ts: '2026-09-11T10:04:00.000Z',
    stage: 'reconciliation',
    type: 'underpayment',
    delta: 200,
    basis: 'contracted-rate',
  },
  {
    id: 'e-recov',
    ts: '2026-09-11T10:05:00.000Z',
    stage: 'recovery',
    type: 'recovery',
    action: 'draft-appeal',
    status: 'draft',
    rung: 'A2',
  },
];

const SEAL: NonNullable<EvidenceRecord['seal']> = {
  alg: 'HMAC-SHA256',
  recordId: 'rec-1',
  memberId: MEMBER_ID,
  chainHead: 'abc123',
  entryCount: 5,
  signature: 'deadbeef',
  keyId: 'demo-key-1',
  ts: '2026-09-11T10:06:00.000Z',
};

describe('summarizeEntry — new golden-thread stages (PHI-safe)', () => {
  it('every new entry type yields a non-empty summary with no PHI', () => {
    for (const e of NEW_ENTRIES) {
      const summary = summarizeEntry(e);
      expect(summary.length).toBeGreaterThan(0);
      // PHI-safe: never leaks the memberId (or any free-text member data).
      expect(summary).not.toContain(MEMBER_ID);
      expect(summary.toLowerCase()).not.toContain('member');
    }
  });

  it('claim-submission → claimRef + total', () => {
    expect(summarizeEntry(NEW_ENTRIES[0])).toBe('Claim CLM-9001 · total 1200');
  });

  it('remittance → id, paid, per-group adjustment totals, CARC/RARC codes', () => {
    const s = summarizeEntry(NEW_ENTRIES[1]);
    expect(s).toContain('Remittance RA-555');
    expect(s).toContain('paid 800');
    // Per-group totals: CO summed to 350, PR 50.
    expect(s).toContain('CO:350');
    expect(s).toContain('PR:50');
    expect(s).toContain('CARC [45, 97]');
    expect(s).toContain('RARC [N130]');
  });

  it('reconciliation → verdict + delta + tolerance', () => {
    expect(summarizeEntry(NEW_ENTRIES[2])).toBe(
      'Reconciliation underpaid · delta 200 · tolerance 5'
    );
  });

  it('underpayment → delta + basis', () => {
    expect(summarizeEntry(NEW_ENTRIES[3])).toBe('Underpayment delta 200 · basis contracted-rate');
  });

  it('recovery → action + status + rung', () => {
    expect(summarizeEntry(NEW_ENTRIES[4])).toBe('Recovery draft-appeal · draft · rung A2');
  });

  it('STAGE_LABEL adds human-readable labels for the new stages', () => {
    expect(STAGE_LABEL.claim).toBe('Claim');
    expect(STAGE_LABEL.remittance).toBe('Remittance');
    expect(STAGE_LABEL.reconciliation).toBe('Reconciliation');
    expect(STAGE_LABEL.recovery).toBe('Recovery');
  });

  it('unmapped types still fall through to empty string (Wave-1 default)', () => {
    const unknown = { id: 'x', ts: 't', stage: 'claim', type: 'not-a-real-type' } as unknown as EvidenceEntry;
    expect(summarizeEntry(unknown)).toBe('');
  });
});

describe('summarizeEntry — existing entry types render unchanged', () => {
  it('eligibility / note text is byte-identical to Wave-1', () => {
    const elig: EvidenceEntry = {
      id: 'e1',
      ts: 't',
      stage: 'eligibility',
      type: 'eligibility',
      requiresPA: true,
      note: 'CPT covered',
    };
    expect(summarizeEntry(elig)).toBe('Coverage requires PA — CPT covered');

    const note: EvidenceEntry = {
      id: 'e2',
      ts: 't',
      stage: 'eligibility',
      type: 'note',
      text: 'reviewer note',
    };
    expect(summarizeEntry(note)).toBe('reviewer note');
  });
});

describe('EvidenceTimeline — render', () => {
  it('renders new-stage summaries and no seal indicator when unsealed', () => {
    render(<EvidenceTimeline record={baseRecord(NEW_ENTRIES)} />);
    expect(screen.getByText('Claim CLM-9001 · total 1200')).toBeTruthy();
    expect(screen.getByText(/Recovery draft-appeal/)).toBeTruthy();
    // No seal → no integrity indicator (current behavior preserved).
    expect(screen.queryByTestId('seal-indicator')).toBeNull();
  });

  it('shows the "Sealed" indicator when the record carries a seal', () => {
    render(<EvidenceTimeline record={baseRecord(NEW_ENTRIES, SEAL)} />);
    const indicator = screen.getByTestId('seal-indicator');
    expect(indicator).toBeTruthy();
    // Seal present but no server verdict → the NEUTRAL "not verified" wording.
    expect(screen.getByText('Sealed (not verified)')).toBeTruthy();
    // PHI-safe: the seal binds memberId internally but it must never be rendered.
    expect(indicator.textContent ?? '').not.toContain(MEMBER_ID);
  });

  it('surfaces server-verified intact/signed state when integrity prop is supplied', () => {
    render(
      <EvidenceTimeline
        record={baseRecord(NEW_ENTRIES, SEAL)}
        integrity={{ intact: true, signed: false }}
      />
    );
    expect(screen.getByText('Sealed')).toBeTruthy();
    expect(screen.getByText('Integrity intact')).toBeTruthy();
    // Finding 8: honest symmetric-seal wording (no "verified" non-repudiation read).
    expect(screen.getByText('Seal signature mismatch')).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // W2 re-attack HIGH: the seal indicator must be HONEST about all three states,
  // so a TAMPERED record can never render a positive verdict. These pin the exact
  // gap that let the page (which now forwards `integrity`) go green on tampering.
  // ---------------------------------------------------------------------------

  it('sealed + integrity intact=false → visible "Integrity broken" tamper warning, NOT a positive verdict', () => {
    render(
      <EvidenceTimeline
        record={baseRecord(NEW_ENTRIES, SEAL)}
        integrity={{ intact: false, signed: false }}
      />
    );
    const indicator = screen.getByTestId('seal-indicator');
    // Tamper is unmistakably surfaced.
    expect(screen.getByText('Integrity broken')).toBeTruthy();
    expect(screen.getByText('Seal signature mismatch')).toBeTruthy();
    // And the UI does NOT claim the seal is good.
    expect(screen.queryByText('Integrity intact')).toBeNull();
    expect(indicator.textContent ?? '').not.toContain('Seal signature matches');
    expect((indicator.textContent ?? '').includes('not verified')).toBe(false);
  });

  it('sealed + integrity UNDEFINED → NEUTRAL "not verified", NOT a positive verdict', () => {
    render(<EvidenceTimeline record={baseRecord(NEW_ENTRIES, SEAL)} />);
    expect(screen.getByText('Sealed (not verified)')).toBeTruthy();
    // No positive/verified language when verification was never performed.
    expect(screen.queryByText('Integrity intact')).toBeNull();
    expect(screen.queryByText('Seal signature matches (symmetric)')).toBeNull();
  });

  it('sealed + integrity intact=true → positive "Integrity intact" verdict', () => {
    render(
      <EvidenceTimeline
        record={baseRecord(NEW_ENTRIES, SEAL)}
        integrity={{ intact: true, signed: true }}
      />
    );
    expect(screen.getByText('Integrity intact')).toBeTruthy();
    expect(screen.getByText('Seal signature matches (symmetric)')).toBeTruthy();
    // Never the tamper or unverified wording in the good state.
    expect(screen.queryByText('Integrity broken')).toBeNull();
    expect(screen.queryByText('Sealed (not verified)')).toBeNull();
  });

  it('renders a per-entry tier chip (D0 for a raw remittance, D3 for recovery)', () => {
    render(<EvidenceTimeline record={baseRecord(NEW_ENTRIES)} />);
    // tierOfEntry: remittance → D0, recovery → D3.
    expect(screen.getAllByText('D0').length).toBeGreaterThan(0);
    expect(screen.getAllByText('D3').length).toBeGreaterThan(0);
  });
});
