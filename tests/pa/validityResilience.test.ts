/**
 * DTR readiness (E1/E2/M1) + CMS-0057-F decision clock (H2).
 * Lenses: guards-fail-closed (no submit on unresolved / no auto-ready), honest-labeling
 * (attached ≠ met), target-contract (72h / 7d), order-independence, degenerate inputs.
 */
import { describe, it, expect } from 'vitest';
import {
  dtrSubmitReadiness,
  groupPresentation,
  groupPresentationLabel,
} from '@/lib/pa/dtrReadiness';
import { paDecisionClock, slaHoursFor, decisionClockLabel } from '@/lib/pa/paDecisionClock';
import type { DtrMatchResult, DocumentReference } from '@/lib/pa/pa-types';

const doc: DocumentReference = {
  resourceType: 'DocumentReference',
  status: 'current',
  docStatus: 'preliminary',
  type: { coding: [{ system: 'x', code: 'y', display: 'z' }] },
  category: [{ coding: [{ system: 'x', code: 'a', display: 'b' }] }],
  subject: { reference: 'Patient/x' },
  date: '2026-07-20',
  content: [
    {
      attachment: {
        contentType: 'application/pdf',
        title: 'n.pdf',
        size: 1,
        creation: '2026-07-20',
      },
    },
  ],
  context: { related: [] },
};

describe('an upload is "attached — pending", never "Met" (M1/E1)', () => {
  it('presentation distinguishes met / attached-pending / gap', () => {
    expect(groupPresentation({ id: 1, title: 'a', status: 'met' })).toBe('met');
    expect(
      groupPresentation({ id: 2, title: 'b', status: 'pending', uploadedDocumentReference: doc })
    ).toBe('attached-pending');
    expect(groupPresentation({ id: 3, title: 'c', status: 'pending' })).toBe('gap');
    expect(groupPresentation({ id: 4, title: 'd', status: 'gap' })).toBe('gap');
    expect(groupPresentationLabel('attached-pending')).toMatch(/pending payer review/i);
    expect(groupPresentationLabel('met')).toBe('Met');
  });
});

describe('submit is gated on required-group resolution (E2)', () => {
  it('a required gap blocks; attachment resolves; non-required ignored', () => {
    const dtr: DtrMatchResult[] = [
      {
        policyTitle: 'p',
        cptCode: '72148',
        allMet: false,
        groups: [
          { id: 1, title: 'met', status: 'met', required: true },
          { id: 2, title: 'gap', status: 'gap', required: true },
          { id: 3, title: 'optional', status: 'gap', required: false },
        ],
      },
    ];
    const before = dtrSubmitReadiness(dtr);
    expect(before.ready).toBe(false);
    expect(before.blocking).toEqual([{ cpt: '72148', groupId: 2, title: 'gap' }]);

    dtr[0].groups[1] = {
      id: 2,
      title: 'gap',
      status: 'pending',
      required: true,
      uploadedDocumentReference: doc,
    };
    const after = dtrSubmitReadiness(dtr);
    expect(after.ready).toBe(true);
    expect(after.resolved).toBe(2);
  });

  it('no required groups at all ⇒ NOT ready (nothing established)', () => {
    const dtr: DtrMatchResult[] = [
      {
        policyTitle: 'p',
        cptCode: 'x',
        allMet: true,
        groups: [{ id: 1, title: 'o', status: 'gap', required: false }],
      },
    ];
    expect(dtrSubmitReadiness(dtr).ready).toBe(false);
  });

  it('empty input ⇒ not ready (degenerate)', () => {
    expect(dtrSubmitReadiness([]).ready).toBe(false);
  });
});

describe('decision clock (CMS-0057-F 72h / 7d)', () => {
  it('uses 72h expedited and 168h standard, dueBy = submittedAt + SLA', () => {
    expect(slaHoursFor('expedited')).toBe(72);
    expect(slaHoursFor('standard')).toBe(168);
    const c = paDecisionClock('2026-07-20T00:00:00.000Z', 'standard', '2026-07-20T00:00:00.000Z');
    expect(c.dueBy).toBe('2026-07-27T00:00:00.000Z');
    expect(c.remainingHours).toBe(168);
    expect(c.state).toBe('on-track');
  });

  it('transitions on-track → at-risk → breached', () => {
    const sub = '2026-07-20T00:00:00.000Z';
    expect(paDecisionClock(sub, 'expedited', '2026-07-21T06:00:00.000Z').state).toBe('on-track'); // 42h left
    expect(paDecisionClock(sub, 'expedited', '2026-07-22T18:00:00.000Z').state).toBe('at-risk'); // 6h left
    expect(paDecisionClock(sub, 'expedited', '2026-07-23T06:00:00.000Z').state).toBe('breached'); // -6h
  });

  it('labels are honest about overdue', () => {
    const breached = paDecisionClock(
      '2026-07-20T00:00:00.000Z',
      'expedited',
      '2026-07-24T00:00:00.000Z'
    );
    expect(breached.state).toBe('breached');
    expect(decisionClockLabel(breached)).toMatch(/overdue/);
  });
});
