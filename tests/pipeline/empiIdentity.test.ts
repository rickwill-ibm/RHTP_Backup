import { describe, it, expect, afterEach } from 'vitest';
import {
  batchStep,
  defaultIdentityResolver,
  defaultPipelineDeps,
  eligibility834Adapter,
  landStage,
  selectIdentityResolver,
  type DomainAdapter,
  type PipelineDeps,
} from '@/lib/pipeline';
import { createEmpiResolver, empiResolver } from '@/lib/identity/empiResolver';
import {
  mockIdentitySource,
  setProductionIdentitySource,
  EmpiCandidateSourceNotConfiguredError,
  type IdentitySource,
} from '@/lib/identity/identitySource';
import type { SourceIdentityRecord, SourceSystem } from '@/lib/identity/mpiTypes';
import { setSessionDataMode, clearSessionDataModes } from '@/lib/config/dataMode';
import x834 from './fixtures/eligibility834.json';

afterEach(() => {
  clearSessionDataModes();
  setProductionIdentitySource(null);
});

const NOW = () => 1_700_000_000_000;

// A possible-match candidate (lastName+dob+zip = 65) for the held-routing test.
const HELD_SOURCE: IdentitySource = {
  id: 'held-test',
  mode: 'standalone',
  recordsFor: (s: SourceSystem) =>
    (
      [
        {
          sourceSystem: 'state-agency',
          sourceRecordId: 'rec-poss',
          traits: { firstName: 'Alice', lastName: 'Wonder', dob: '1988-08-08', zip: '11111' },
        },
      ] as SourceIdentityRecord[]
    ).filter((c) => c.sourceSystem === s),
};

describe('identity dataMode seam: production uses EMPI, mock keeps the deterministic stub', () => {
  it('selectIdentityResolver returns the deterministic stub by default (demo stability)', () => {
    expect(selectIdentityResolver()).toBe(defaultIdentityResolver);
  });

  it('selectIdentityResolver returns the EMPI resolver in production mode', () => {
    setSessionDataMode('identity', 'production');
    expect(selectIdentityResolver()).toBe(empiResolver);
  });

  it('defaultPipelineDeps wires the EMPI resolver when identity=production', () => {
    setSessionDataMode('identity', 'production');
    expect(defaultPipelineDeps({ now: NOW }).resolveIdentity).toBe(empiResolver);
  });
});

describe('possible-match band routes to the HELD-for-review lane (never auto-linked)', () => {
  // A minimal adapter whose normalize resolves a subject that lands in the band.
  const heldAdapter: DomainAdapter = {
    source: { system: 'test', feed: 'test-held' },
    domain: 'encounter',
    format: 'hl7v2-adt',
    arrivalMode: 'stream',
    parse: () => [{ sourceRef: 'REC-1', data: {} }],
    validate: () => ({ ok: true, issues: [] }),
    normalize: (_raw, deps) => {
      const memberId = deps.resolveIdentity('SRC-HELD', {
        feed: 'test-held',
        demographics: { firstName: 'Bob', lastName: 'Wonder', dob: '1988-08-08', zip: '11111' },
      });
      return {
        domain: 'encounter',
        memberId,
        resourceType: 'Encounter',
        fhirResourceId: 'Encounter/x',
        eventType: 'encounter.admitted',
        tier: 'T1',
        idempotencyKey: 'k',
        provenance: 'p',
        consent: { part2Restricted: false, segmentLabels: [] },
        source: { system: 'test', feed: 'test-held' },
        occurredAt: '2026-01-01T00:00:00Z',
        payload: {},
      };
    },
  };

  it('the record is diverted to held-for-review, NOT normalized onto a member', () => {
    const deps: PipelineDeps = defaultPipelineDeps({ now: NOW, resolveIdentity: createEmpiResolver(HELD_SOURCE) });
    const landed = landStage.run({ source: heldAdapter.source, format: 'hl7v2-adt', payload: 'x' }, deps);
    const out = batchStep(heldAdapter)(landed, deps);

    expect(out.normalized).toHaveLength(0); // never attached to a member
    expect(out.quarantined).toHaveLength(1);
    const held = out.quarantined[0];
    expect(held.status).toBe('held-for-review');
    expect(held.reasonCodes).toContain('identity-possible-match');
    expect(held.identityHold?.matchTier).toBe('possible-match');
    expect(held.identityHold!.confidence).toBeGreaterThanOrEqual(60);
    expect(held.identityHold!.confidence).toBeLessThan(90);
    // Reconciliation still balances: the held record counts as rejected, not lost.
    expect(out.reconciliation).toMatchObject({ countIn: 1, loaded: 0, rejected: 1, balanced: true });
    // PHI-safe: no name/dob anywhere on the held record.
    expect(JSON.stringify(held)).not.toMatch(/Bob|Wonder|1988/);
  });
});

describe('existing adapters still resolve under the EMPI resolver (production)', () => {
  it('U3: production with NO candidate source registered FAILS LOUD (never scores against demo data)', () => {
    setSessionDataMode('identity', 'production');
    const deps: PipelineDeps = defaultPipelineDeps({ now: NOW }); // -> empiResolver, no source wired
    const landed = landStage.run(
      { source: eligibility834Adapter.source, format: 'x12-834', payload: x834.payload },
      deps,
    );
    expect(() => batchStep(eligibility834Adapter)(landed, deps)).toThrow(
      EmpiCandidateSourceNotConfiguredError,
    );
  });

  it('the 834 adapter resolves anchored mem- ids and stays balanced once a source IS wired', () => {
    setSessionDataMode('identity', 'production');
    setProductionIdentitySource(mockIdentitySource); // simulate a wired production candidate source
    const deps: PipelineDeps = defaultPipelineDeps({ now: NOW });
    const landed = landStage.run(
      { source: eligibility834Adapter.source, format: 'x12-834', payload: x834.payload },
      deps,
    );
    const out = batchStep(eligibility834Adapter)(landed, deps);

    expect(out.normalized).toHaveLength(2);
    for (const r of out.normalized) expect(r.memberId).toMatch(/^mem-/);
    expect(out.reconciliation.balanced).toBe(true);
    // These synthetic subscribers do not match the registry, so none are held.
    expect(out.quarantined.every((q) => q.status !== 'held-for-review')).toBe(true);
  });

  it('id-only seam calls still resolve through the default deps (deterministic path)', () => {
    const deps = defaultPipelineDeps({ now: NOW, resolveIdentity: empiResolver });
    expect(deps.resolveIdentity('SRC-XYZ', { feed: 'f' })).toMatch(/^mem-/);
    expect(deps.resolveIdentity('SRC-XYZ')).toMatch(/^mem-/);
  });
});
