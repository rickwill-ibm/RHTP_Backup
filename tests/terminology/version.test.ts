import { afterEach, describe, expect, it } from 'vitest';
import * as clock from '@/lib/clock';
import {
  createSeedTerminologyService,
  makeSemanticValidator,
} from '@/lib/terminology';
import type { NormalizedRecord } from '@/lib/pipeline/types';

/**
 * I8A-ii wave A: version + retirement. A code valid in an older version but
 * RETIRED/removed in the CURRENT bound version returns `retired` (invalid for
 * admission) with the bound version noted. The "current version at check time" is
 * deterministic via an injected clock. E9: a retired code must NOT pass as valid.
 */
afterEach(() => clock.setClock(null));

const IN_WINDOW = () => new Date('2026-06-01T00:00:00Z');

/** A PHI-free record carrying one ICD-10-CM condition coding. */
function conditionRecord(code: string): NormalizedRecord {
  return {
    domain: 'behavioral-health',
    memberId: 'mem-x',
    resourceType: 'Condition',
    fhirResourceId: 'Condition/c-1',
    eventType: 'condition.recorded',
    tier: 'T1',
    idempotencyKey: 'cond:c-1',
    provenance: 'provider-authoritative',
    consent: { part2Restricted: false, segmentLabels: [] },
    source: { feed: 'test', system: 'test' } as unknown as NormalizedRecord['source'],
    occurredAt: '2026-06-01T00:00:00Z',
    payload: {
      condition: { system: 'http://hl7.org/fhir/sid/icd-10-cm', code },
    },
  };
}

describe('version/retirement: a retired code is rejected with the bound version', () => {
  const svc = createSeedTerminologyService({ now: IN_WINDOW });

  it('returns retired (invalid) for a code removed in the current version', () => {
    const v = svc.validateCode('ICD-10-CM', 'R51');
    expect(v.valid).toBe(false);
    expect(v.status).toBe('retired');
    expect(v.binding).toMatchObject({ assetId: 'icd-10-cm-fy2026', version: 'FY2026', current: true });
  });

  it('the same code is valid in the prior version but never passes as valid now', () => {
    // R51 is a member of FY2025 (see expand.test); against the CURRENT bound
    // version it is retired, so validateCode must not return valid.
    const v = svc.validateCode('ICD-10-CM', 'R51');
    expect(v.valid).toBe(false);
  });

  it('a retired HCC code is rejected against the active CMS-HCC V28', () => {
    const v = svc.validateCode('HCC', 'HCC58');
    expect(v).toMatchObject({ valid: false, status: 'retired' });
    expect(v.binding).toMatchObject({ assetId: 'cms-hcc-v28', version: 'V28' });
  });
});

describe('version/retirement: the semantic gate quarantines a retired code', () => {
  it('emits a PHI-safe semantic-retired-code finding', () => {
    const svc = createSeedTerminologyService({ now: IN_WINDOW });
    const gate = makeSemanticValidator(svc);
    const result = gate.validate(conditionRecord('R51'));
    expect(result.ok).toBe(false);
    expect(result.issues.map((i) => i.reasonCode)).toContain('semantic-retired-code');
    // PHI-safe: reason + field path only.
    expect(JSON.stringify(result.issues)).not.toContain('mem-x');
  });

  it('a current member passes the gate', () => {
    const svc = createSeedTerminologyService({ now: IN_WINDOW });
    const gate = makeSemanticValidator(svc);
    expect(gate.validate(conditionRecord('E11.9')).ok).toBe(true);
  });
});

describe('version/retirement: "current version at check time" is clock-driven', () => {
  it('binds FY2026 inside its window and no active version before it is effective', () => {
    const inWindow = createSeedTerminologyService({ now: () => new Date('2026-06-01T00:00:00Z') });
    expect(inWindow.validateCode('ICD-10-CM', 'E11.9').binding?.version).toBe('FY2026');

    // 2025-06-01 is before FY2026 is effective and FY2025 is superseded: no active
    // version binds, proving the version resolves at the injected check time.
    const early = createSeedTerminologyService({ now: () => new Date('2025-06-01T00:00:00Z') });
    expect(early.validateCode('ICD-10-CM', 'E11.9').binding).toBeUndefined();
  });
});
