import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as clock from '@/lib/clock';
import {
  defaultPipelineDeps,
  medicationAdapter,
  runTransform,
  bindSemantics,
  isCodeCarryingDomain,
  CODE_CARRYING_DOMAINS,
  type PipelineDeps,
} from '@/lib/pipeline';
import {
  makeSemanticValidator,
  seedTerminologyService,
  valueSetRegistry,
  type SemanticValidator,
} from '@/lib/terminology';
import { CURRENCY_REASONS } from '@/lib/terminology/registry/currency';
import type { NormalizedRecord } from '@/lib/pipeline/types';

/**
 * Stage-4 semantic gate BOUND at transform (Iteration 8A-ii, Wave C).
 *
 * Code-carrying domains run their governed codings through the SAME stage-4
 * semantic gate at transform. This proves: a bad / retired code is quarantined
 * (never admitted); a good record passes; a record whose bound value-set version
 * is stale quarantines under the enforce (production) posture while it is admitted
 * under the flag posture; and the binding REUSES the semanticValidator rather than
 * duplicating validation logic. PHI-safe throughout; deterministic via injected
 * clock / validator / registry / posture.
 */

// A clock where every governed bound version in the seed registry is active
// (RxNorm 20260804 effective 2026-08-04; ICD-10 FY2026 in window).
const PINNED = () => Date.parse('2026-08-10T00:00:00.000Z');

beforeEach(() => clock.setClock(PINNED));
afterEach(() => clock.setClock(null));

/** A medications NormalizedRecord carrying one RxNorm coding (PHI-free). */
function medRecord(rxCode: string): NormalizedRecord {
  return {
    domain: 'medications',
    memberId: 'mem-xyz',
    resourceType: 'Medication',
    fhirResourceId: 'Medication/mr-1',
    eventType: 'medication.prescribed',
    tier: 'T1',
    idempotencyKey: 'rx:med:mr-1',
    provenance: 'prescriber-authoritative',
    consent: { part2Restricted: false, segmentLabels: [] },
    source: medicationAdapter.source,
    occurredAt: '2026-08-01T00:00:00Z',
    payload: {
      medicationRef: 'Medication/mr-1',
      rxNorm: { system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: rxCode, display: '' },
      status: 'active',
    },
  };
}

/** An ICD-10-CM coded record (behavioral-health), for currency-of-binding tests. */
function icdRecord(icd: string): NormalizedRecord {
  return {
    ...medRecord('310798'),
    domain: 'behavioral-health',
    payload: { dx: { system: 'http://hl7.org/fhir/sid/icd-10-cm', code: icd } },
  };
}

describe('code-carrying domain set', () => {
  it('names exactly the governed clinical domains (incl. Iter11 conditions)', () => {
    expect([...CODE_CARRYING_DOMAINS].sort()).toEqual(
      ['behavioral-health', 'conditions', 'immunizations', 'labs-vitals', 'medications', 'procedures'].sort(),
    );
    expect(isCodeCarryingDomain('medications')).toBe(true);
    expect(isCodeCarryingDomain('conditions')).toBe(true);
    expect(isCodeCarryingDomain('coverage')).toBe(false);
  });
});

describe('bindSemantics reuses the stage-4 semantic gate over the seed allowlist', () => {
  it('admits a good governed code', () => {
    expect(bindSemantics(medRecord('310798'), { posture: 'flag' }).ok).toBe(true);
  });

  it('quarantines a bad code (never admits an unverified code), PHI-safe reason', () => {
    const result = bindSemantics(medRecord('000-not-a-real-code'), { posture: 'flag' });
    expect(result.ok).toBe(false);
    expect(result.issues.map((i) => i.reasonCode)).toContain('semantic-unrecognized-code');
    // PHI-safe: reason + field path only, no code display or narrative.
    expect(JSON.stringify(result.issues)).not.toContain('display');
  });
});

describe('bindSemantics delegates the semantic verdict to the injected gate (no duplicated logic)', () => {
  /** A spy gate: counts consultations and returns a scripted verdict. */
  function spyGate(verdict: 'ok' | 'retired') {
    let calls = 0;
    const gate: SemanticValidator = {
      id: 'spy-gate',
      validate() {
        calls++;
        return verdict === 'ok'
          ? { ok: true, issues: [] }
          : { ok: false, issues: [{ reasonCode: 'semantic-retired-code', fieldPath: 'payload.rxNorm' }] };
      },
    };
    return { gate, callCount: () => calls };
  }

  it('admits whatever the injected gate calls valid - it does not re-derive code validity', () => {
    const spy = spyGate('ok');
    // A code NOT in the seed allowlist still passes, because the injected gate said ok.
    const result = bindSemantics(medRecord('000-not-a-real-code'), { validator: spy.gate, posture: 'flag' });
    expect(result.ok).toBe(true);
    expect(spy.callCount()).toBe(1);
  });

  it('a RETIRED code from the gate fails closed - the binding never admits it', () => {
    const spy = spyGate('retired');
    const result = bindSemantics(medRecord('310798'), { validator: spy.gate, posture: 'flag' });
    expect(result.ok).toBe(false);
    expect(result.issues.map((i) => i.reasonCode)).toContain('semantic-retired-code');
  });
});

describe('value-set currency: a stale bound version must NOT silently validate (E9)', () => {
  // A gate that always says the code is valid, so ONLY currency drives the outcome.
  const alwaysValid: SemanticValidator = { id: 'always-valid', validate: () => ({ ok: true, issues: [] }) };
  // asOf where ICD-10-CM has NO active version (FY2026 expired 2026-09-30, FY2025 superseded).
  const stale = () => Date.parse('2027-06-01T00:00:00.000Z');

  it('under the enforce (production) posture, a stale value-set version quarantines even when the code validates', () => {
    const result = bindSemantics(icdRecord('E11.9'), {
      validator: alwaysValid,
      registry: valueSetRegistry,
      posture: 'enforce',
      now: stale,
    });
    expect(result.ok).toBe(false);
    expect(result.issues.map((i) => i.reasonCode)).toContain(CURRENCY_REASONS.noActiveVersion);
  });

  it('under the flag posture the same stale binding is admitted (demo stays green)', () => {
    const result = bindSemantics(icdRecord('E11.9'), {
      validator: alwaysValid,
      registry: valueSetRegistry,
      posture: 'flag',
      now: stale,
    });
    expect(result.ok).toBe(true);
  });

  it('with a current bound version the same code+posture admits (currency does not over-fire)', () => {
    const result = bindSemantics(icdRecord('E11.9'), {
      validator: alwaysValid,
      registry: valueSetRegistry,
      posture: 'enforce',
      now: PINNED, // 2026-08-10: ICD-10 FY2026 is active/in-window.
    });
    expect(result.ok).toBe(true);
  });
});

describe('the binding runs AT TRANSFORM for a code-carrying domain', () => {
  const deps: PipelineDeps = defaultPipelineDeps({ now: PINNED });

  const bundle = (code: string, id: string) =>
    JSON.stringify({
      entry: [
        {
          resource: {
            resourceType: 'MedicationRequest',
            id,
            status: 'active',
            subject: { reference: 'Patient/RX-MEM-9' },
            medicationCodeableConcept: {
              coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code }],
            },
            authoredOn: '2026-08-01',
            dispenseRequest: {},
          },
        },
      ],
    });

  it('normalizes a good coded medication', () => {
    const [raw] = medicationAdapter.parse(bundle('310798', 'mr-good'));
    const outcome = runTransform(medicationAdapter, raw, deps);
    expect(outcome.ok).toBe(true);
  });

  it('quarantines a bad coded medication at transform (not admitted into the normalized set), PHI-safe', () => {
    const [raw] = medicationAdapter.parse(bundle('000-not-a-real-code', 'mr-bad'));
    const outcome = runTransform(medicationAdapter, raw, deps);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.quarantine.reasonCodes).toContain('semantic-unrecognized-code');
    const s = JSON.stringify(outcome.quarantine);
    expect(s).not.toContain('RX-MEM');
    expect(s).not.toContain('Patient');
  });
});
