import { describe, it, expect } from 'vitest';
import { makeAuditId, resolveIds } from '@/app/md-smart-launch/launch.helpers';
import { DEMO_PATIENT_ID, DEMO_ENCOUNTER_ID } from '@/lib/fhir/store';
import type { SmartLaunchContext } from '@/lib/smartFhirTypes';

const ctx = (patientId: string, encounterId = 'enc-1'): SmartLaunchContext =>
  ({ patientId, encounterId }) as unknown as SmartLaunchContext;

describe('launch.helpers', () => {
  it('makeAuditId returns a unique AUD-prefixed id', () => {
    const a = makeAuditId();
    const b = makeAuditId();
    expect(a).toMatch(/^AUD-/);
    expect(a).not.toBe(b);
  });

  it('resolveIds maps empty / Maria alias to the demo patient', () => {
    expect(resolveIds(ctx(''), false)).toEqual({
      patientId: DEMO_PATIENT_ID,
      encounterId: DEMO_ENCOUNTER_ID,
    });
    expect(resolveIds(ctx('maria-redhawk-001'), false)).toEqual({
      patientId: DEMO_PATIENT_ID,
      encounterId: DEMO_ENCOUNTER_ID,
    });
  });

  it('resolveIds passes a real patient id through in live mode', () => {
    const r = resolveIds(ctx('patient/abc-123', 'enc-9'), false);
    expect(r.patientId).toBe('abc-123');
    expect(r.encounterId).toBe('enc-9');
  });
});
