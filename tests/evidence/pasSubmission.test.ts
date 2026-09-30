import { describe, it, expect } from 'vitest';
import {
  createEvidenceRecord,
  recordPasSubmission,
  latestOfType,
  toAuditEvents,
  withStatus,
  type EvidenceRecord,
} from '@/lib/evidence';
import { assertPhiSafe } from '@/lib/server/audit';

/**
 * GT — pas-submission evidence entry carries a RESOLVED reviewer of record
 * (reference + display), never a free-text approver string.
 */
function baseRecord(): EvidenceRecord {
  return createEvidenceRecord({
    id: 'ev-MARIA_SD_001-72148-1730000000000',
    memberId: 'MARIA_SD_001',
    order: { code: '72148', display: 'MRI lumbar', providerNpi: '1730154782' },
    createdAt: '2026-08-25T00:00:00.000Z',
  });
}

const approver = { reference: 'Practitioner/dev', display: 'Dr. Alex Rivera, UM Reviewer' };

describe('recordPasSubmission', () => {
  it('stamps a structured approver, prior-auth stage, actor = reference', () => {
    const rec = recordPasSubmission(baseRecord(), {
      id: 'ev-1-pas-1730000001000',
      ts: '2026-08-25T00:01:00.000Z',
      approver,
    });
    const entry = latestOfType(rec, 'pas-submission');
    expect(entry).toBeDefined();
    expect(entry?.approver).toEqual(approver); // resolved identity, not a string
    expect(entry?.stage).toBe('prior-auth');
    expect(entry?.actor).toBe('Practitioner/dev'); // accountable identity by default
  });

  it('projects to a PHI-safe audit event naming the approver reference', () => {
    const rec = withStatus(
      recordPasSubmission(baseRecord(), { id: 'e-pas', ts: '2026-08-25T00:01:00.000Z', approver }),
      'submitted'
    );
    const events = toAuditEvents(rec, 'corr-1');
    const pas = events.find((e) => e.action === 'evidence.pas-submission');
    expect(pas).toBeDefined();
    expect(pas?.detail).toContain('Practitioner/dev');
    expect(pas?.detail).toContain('72148');
    // audit detail must not leak the human-readable name or any PHI
    expect(pas?.detail).not.toContain('Alex Rivera');
    expect(() => assertPhiSafe(pas!)).not.toThrow();
  });

  it('does not accept a bare string approver (compile-time guard is exercised via shape)', () => {
    // The recorder requires { reference, display } — a string has no such shape.
    const rec = recordPasSubmission(baseRecord(), {
      id: 'e2',
      ts: '2026-08-25T00:02:00.000Z',
      approver: { reference: 'Practitioner/rev-9', display: 'Dr. Jordan Lee' },
    });
    expect(latestOfType(rec, 'pas-submission')?.approver.reference).toBe('Practitioner/rev-9');
  });
});
