/**
 * Policy lifecycle state machine — legal transitions, the happy path, and maker/checker separation.
 */
import { describe, it, expect } from 'vitest';
import {
  canTransition,
  applyTransition,
  nextStatuses,
  isTerminal,
  TransitionError,
  type PolicyWorkflowRecord,
} from '@/lib/policy/workflow/lifecycle';

describe('policy lifecycle', () => {
  it('permits only defined transitions by the right actor', () => {
    expect(canTransition('uploaded', 'extracting', 'system')).toBe(true);
    expect(canTransition('in-review', 'ready-for-approval', 'maker')).toBe(true);
    expect(canTransition('ready-for-approval', 'approved', 'checker')).toBe(true);
    expect(canTransition('in-review', 'approved', 'maker')).toBe(false); // maker can't approve
    expect(canTransition('uploaded', 'approved', 'system')).toBe(false);
  });

  it('walks the happy path with maker then a different checker', () => {
    let rec: PolicyWorkflowRecord = { policyId: 'p', status: 'uploaded' };
    rec = applyTransition(rec, 'extracting', 'system', 'system');
    rec = applyTransition(rec, 'in-review', 'system', 'system');
    rec = applyTransition(rec, 'ready-for-approval', 'maker', 'Practitioner/maker-1');
    expect(rec.submittedBy).toBe('Practitioner/maker-1');
    rec = applyTransition(rec, 'approved', 'checker', 'Practitioner/checker-2');
    expect(rec.status).toBe('approved');
    expect(rec.approvedBy).toBe('Practitioner/checker-2');
    rec = applyTransition(rec, 'published', 'system', 'system');
    expect(isTerminal(rec.status)).toBe(true);
  });

  it('blocks the maker from approving their own submission', () => {
    const rec: PolicyWorkflowRecord = {
      policyId: 'p',
      status: 'ready-for-approval',
      submittedBy: 'Practitioner/maker-1',
    };
    expect(() => applyTransition(rec, 'approved', 'checker', 'Practitioner/maker-1')).toThrow(
      TransitionError
    );
    // a different checker is fine
    expect(applyTransition(rec, 'approved', 'checker', 'Practitioner/checker-2').status).toBe(
      'approved'
    );
  });

  it('throws on an illegal transition', () => {
    const rec: PolicyWorkflowRecord = { policyId: 'p', status: 'uploaded' };
    expect(() => applyTransition(rec, 'approved', 'system', 'system')).toThrow(TransitionError);
  });

  it('exposes the reachable next statuses', () => {
    expect(
      nextStatuses('ready-for-approval')
        .map((t) => t.to)
        .sort()
    ).toEqual(['approved', 'in-review', 'rejected']);
    expect(nextStatuses('published')).toEqual([]);
  });
});
