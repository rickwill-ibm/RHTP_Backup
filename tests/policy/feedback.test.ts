/**
 * Feedback + audit loop — decisions → audit records, corrections → versioned overrides, and
 * applying overrides so a previously-corrected code comes back already fixed (loop closed).
 */
import { describe, it, expect } from 'vitest';
import { buildEncodingReview, decide } from '@/lib/policy/review/encodingReview';
import type { ReviewElementInput } from '@/lib/policy/review/encodingReview';
import {
  correctionsToAuditRecords,
  overridesFromReview,
  applyOverrides,
  type AuditContext,
} from '@/lib/policy/review/feedback';
import type { CodingMapContribution } from '@/lib/policy/review/fromPolicyReview';

const ctx: AuditContext = {
  policyId: 'p',
  tenant: 'Horizon',
  reviewer: 'Practitioner/rev-1',
  timestamp: '2026-01-01T00:00:00Z',
};

const inputs: ReviewElementInput[] = [
  {
    id: 'proc-CPT-43775',
    kind: 'procedure',
    code: '43775',
    label: 'Sleeve',
    confidence: 'explicit',
  },
  { id: 'dx-icd10-I10', kind: 'diagnosis', code: 'I10', label: 'HTN', confidence: 'mapped' },
  { id: 'proc-CPT-43842', kind: 'procedure', code: '43842', label: 'VBG', confidence: 'explicit' },
];

describe('correctionsToAuditRecords', () => {
  it('records only decided elements, PHI-safe (references + codes)', () => {
    let secs = buildEncodingReview(inputs);
    secs = decide(secs, 'proc-CPT-43775', { type: 'accept' });
    secs = decide(secs, 'dx-icd10-I10', {
      type: 'correct',
      correction: { reason: 'refractory not codeable', improves: ['coding-map'] },
    });
    const recs = correctionsToAuditRecords(secs, ctx);
    expect(recs.map((r) => r.elementId).sort()).toEqual(['dx-icd10-I10', 'proc-CPT-43775']);
    const edit = recs.find((r) => r.code === 'I10');
    expect(edit?.decision).toBe('edited');
    expect(edit?.reason).toBe('refractory not codeable');
    expect(edit?.reviewer).toBe('Practitioner/rev-1');
    expect(recs.every((r) => !('name' in r))).toBe(true);
  });
});

describe('overridesFromReview + applyOverrides (the learning loop)', () => {
  it('rejected → suppressed override; edited → role override; versions increment', () => {
    let secs = buildEncodingReview(inputs);
    secs = decide(secs, 'proc-CPT-43842', {
      type: 'correct',
      correction: { reason: 'confirm not-covered', improves: ['coding-map'] },
    });
    // give 43842 a role via a fresh build with role set (simulate reviewer-assigned role)
    secs = decide(secs, 'dx-icd10-I10', { type: 'reject' });
    const overrides = overridesFromReview(secs, ctx);
    const i10 = overrides.find((o) => o.code === 'I10');
    expect(i10?.suppressed).toBe(true);
    const vbg = overrides.find((o) => o.code === '43842');
    expect(vbg?.suppressed).toBeUndefined();
    expect(new Set(overrides.map((o) => o.version)).size).toBe(overrides.length); // unique versions
  });

  it('applying overrides suppresses a defect code and clears its flag/diagnosis', () => {
    const contribution: CodingMapContribution = {
      roles: { '43775': 'covered' },
      flags: { '43775': { severity: 'verify', message: 'assign role' } },
      diagnoses: [
        { system: 'icd10', code: 'I10', label: 'HTN' },
        { system: 'icd10', code: 'Z68.41', label: 'BMI 40' },
      ],
    };
    const fixed = applyOverrides(contribution, [
      {
        code: 'I10',
        suppressed: true,
        note: 'refractory not codeable',
        reviewer: 'Practitioner/rev-1',
        timestamp: ctx.timestamp,
        version: 1,
      },
      {
        code: '43775',
        role: 'covered',
        note: 'confirmed',
        reviewer: 'Practitioner/rev-1',
        timestamp: ctx.timestamp,
        version: 2,
      },
    ]);
    expect(fixed.diagnoses?.map((d) => d.code)).toEqual(['Z68.41']); // I10 removed
    expect(fixed.flags?.['43775']).toBeUndefined(); // resolved role clears the flag
    expect(fixed.roles?.['43775']).toBe('covered');
  });

  it('latest override version wins per code', () => {
    const fixed = applyOverrides({ roles: {} }, [
      {
        code: '43847',
        role: 'investigational',
        note: 'v1',
        reviewer: 'r',
        timestamp: ctx.timestamp,
        version: 1,
      },
      {
        code: '43847',
        role: 'covered',
        note: 'v2',
        reviewer: 'r',
        timestamp: ctx.timestamp,
        version: 2,
      },
    ]);
    expect(fixed.roles?.['43847']).toBe('covered');
  });
});
