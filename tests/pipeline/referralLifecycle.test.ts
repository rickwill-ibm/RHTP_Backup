/**
 * Referral LOOP-CLOSURE (iter11 wave C).
 *
 * Proves: the ServiceRequest.status lifecycle (active -> on-hold -> completed |
 * revoked | entered-in-error) is captured as a DATED trail (not a snapshot); a
 * closed-loop signal (scheduled/seen/declined/dropped) is stamped so the closed-loop
 * RATE is computable off the graph; the REFERRED_VIA / REFERRED_TO linkage is intact;
 * and E9 holds — a missing status/signal never silently completes or closes a referral.
 */
import { describe, it, expect } from 'vitest';
import type { C2Event } from '@/lib/outbox';
import { projectEvent, type Mutation, type UpsertEdge, type UpsertNode } from '@/lib/graph';
import { REFERRAL_STATUSES, LOOP_SIGNALS } from '@/lib/graph/mapping/referral';
import { c2, fixedNow } from '../graph/helpers';

const deps = { now: fixedNow };

function srNode(muts: Mutation[]): UpsertNode {
  return muts.find((m): m is UpsertNode => m.op === 'UpsertNode' && m.kind === 'ServiceRequest')!;
}
function edges(muts: Mutation[]): UpsertEdge[] {
  return muts.filter((m): m is UpsertEdge => m.op === 'UpsertEdge');
}

function referral(payload: Record<string, unknown>, memberId = 'M1'): C2Event {
  return c2({
    eventId: `${memberId}-rf`, eventType: 'referral.requested', memberId,
    occurredAt: '2026-06-01T00:00:00Z',
    payload: {
      referralRef: `ServiceRequest/${memberId}-s1`,
      serviceCode: { system: 'snomed', code: '103696004' },
      intent: 'order', authoredOn: '2026-06-01', provenance: 'referring-provider',
      ...payload,
    },
  });
}

describe('referral status lifecycle is captured as a dated trail, not a snapshot', () => {
  it('a statusHistory becomes an ordered, dated statusTrail with the terminal status current', () => {
    const props = srNode(projectEvent(referral({
      status: 'completed',
      statusHistory: [
        { status: 'active', at: '2026-06-01' },
        { status: 'on-hold', at: '2026-06-10' },
        { status: 'completed', at: '2026-06-20' },
      ],
    }), deps)).properties;
    expect(props.statusTrail).toEqual(['active@2026-06-01', 'on-hold@2026-06-10', 'completed@2026-06-20']);
    expect(props.status).toBe('completed');
    expect(props.statusTerminal).toBe(true);
  });

  it('absent a history the single current status is the only phase', () => {
    const props = srNode(projectEvent(referral({ status: 'on-hold' }), deps)).properties;
    expect(props.statusTrail).toEqual(['on-hold@2026-06-01']);
    expect(props.status).toBe('on-hold');
    expect(props.statusTerminal).toBe(false); // on-hold is a non-terminal phase
  });

  it('each terminal status ends the referral; active/on-hold do not', () => {
    for (const status of REFERRAL_STATUSES) {
      const terminal = srNode(projectEvent(referral({ status }), deps)).properties.statusTerminal;
      const isTerminal = status === 'completed' || status === 'revoked' || status === 'entered-in-error';
      expect(terminal).toBe(isTerminal);
    }
  });
});

describe('closed-loop signal makes the closed-loop rate computable', () => {
  it('scheduled is in-progress (loop NOT closed, NOT reached)', () => {
    const props = srNode(projectEvent(referral({ loopStatus: 'scheduled' }), deps)).properties;
    expect(props).toMatchObject({ loopStatus: 'scheduled', loopClosed: false, loopReached: false });
  });

  it('seen closes the loop AND is a reached close (the rate numerator)', () => {
    const props = srNode(projectEvent(referral({ loopStatus: 'seen' }), deps)).properties;
    expect(props).toMatchObject({ loopStatus: 'seen', loopClosed: true, loopReached: true });
  });

  it('declined and dropped close the loop but are NOT reached', () => {
    for (const loopStatus of ['declined', 'dropped']) {
      const props = srNode(projectEvent(referral({ loopStatus }), deps)).properties;
      expect(props).toMatchObject({ loopStatus, loopClosed: true, loopReached: false });
    }
    // The signal vocabulary is exactly the four modelled outcomes.
    expect([...LOOP_SIGNALS]).toEqual(['scheduled', 'seen', 'declined', 'dropped']);
  });

  it('the closed-loop rate is computable across a set of referrals', () => {
    const streams: string[] = ['seen', 'declined', 'scheduled', 'seen'];
    const nodes = streams.map((loopStatus, i) => srNode(projectEvent(referral({ loopStatus }, `M${i}`), deps)).properties);
    const closed = nodes.filter((n) => n.loopClosed === true).length;
    const reached = nodes.filter((n) => n.loopReached === true).length;
    expect({ total: nodes.length, closed, reached }).toEqual({ total: 4, closed: 3, reached: 2 });
    // reached / total = the closed-loop (seen) rate.
    expect(reached / nodes.length).toBe(0.5);
  });
});

describe('E9: a lifecycle default must not silently complete or close a referral', () => {
  it('a referral with NO status and NO loop signal defaults to open, not terminal', () => {
    const props = srNode(projectEvent(referral({}), deps)).properties;
    expect(props.status).toBe('active');       // open, never a terminal state
    expect(props.statusTerminal).toBe(false);
    expect(props.loopStatus).toBe('');         // unknown, never a closed signal
    expect(props.loopClosed).toBe(false);
    expect(props.loopReached).toBe(false);
  });
});

describe('loop-closure preserves the referral linkage', () => {
  it('REFERRED_VIA (member) and REFERRED_TO (performer) still project alongside the lifecycle', () => {
    const muts = projectEvent(referral({ performerRef: 'Organization/org-1', loopStatus: 'seen' }), deps);
    const via = edges(muts).find((e) => e.type === 'REFERRED_VIA')!;
    expect(via.from).toEqual({ kind: 'Member', key: 'M1' });
    expect(via.to).toEqual({ kind: 'ServiceRequest', key: 'ServiceRequest/M1-s1' });
    expect(via.semantics.kind).toBe('associative'); // an order link, not a causal claim
    const to = edges(muts).find((e) => e.type === 'REFERRED_TO')!;
    expect(to.to).toEqual({ kind: 'Organization', key: 'Organization/org-1' });
  });
});
