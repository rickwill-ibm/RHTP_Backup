/**
 * seamFailClosed.test.ts — the MECHANICAL fail-closed gate.
 *
 * This suite is the enforcement of the fail-closed invariant described in
 * src/lib/config/README.seams.md and verification/STUB_LEGITIMACY_FINDINGS.md.
 * It makes the class of defect the manual audit had to catch (fail-open,
 * mock-in-production, dead-wiring) impossible to introduce SILENTLY:
 *
 *   1. COMPLETENESS — every DATA_MODE_SEAMS id has a disposition entry, and every
 *      entry names a real seam. A new seam with no disposition FAILS here.
 *   2. NO UNREGISTERED CONSUMER — every seam consumed via a getDataMode('literal')
 *      call in src/ is a registered seam.
 *   3. PROOF COVERAGE — every load-bearing seam (real-impl or fail-closed-stub) has
 *      a registered prober. A new such seam with no proof FAILS here.
 *   4. FAIL-CLOSED PROOF — each fail-closed-stub seam THROWS in production (never a
 *      plausible-but-fake value) and does NOT throw in mock (the throw is
 *      production-specific, not a blanket break).
 *   5. NO-FALLBACK PROOF — each real-impl seam's production path does NOT return the
 *      mock/in-memory implementation (the U4 dead-wiring class).
 *   6. MOCK-ONLY INERTNESS — each mock-only seam has NO production decision consumer;
 *      wiring one forces reclassification, turning the gate red.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

import {
  DATA_MODE_SEAMS,
  setSessionDataMode,
  clearSessionDataModes,
  type DataModeSeam,
} from '@/lib/config/dataMode';
import {
  SEAM_DISPOSITIONS,
  dispositionSeamIds,
  seamsWithDisposition,
} from '@/lib/config/seamDispositions';

// ── Seam production resolvers under test ────────────────────────────────────────
import {
  getIdentitySource,
  setProductionIdentitySource,
  mockIdentitySource,
  EmpiCandidateSourceNotConfiguredError,
} from '@/lib/identity/identitySource';
import { selectTerminologyService } from '@/lib/terminology/semanticValidator';
import { TerminologyServiceNotConfiguredError } from '@/lib/terminology/types';
import {
  productionProfileValidationService,
  selectProfileValidator,
  ProfileValidatorNotConfiguredError,
} from '@/lib/pipeline/profileValidator';
import {
  getEvidenceStore,
  setProductionEvidenceStoreFactory,
  EvidenceStoreNotConfiguredError,
} from '@/lib/evidence/store';
import {
  getDeadLetterStore,
  setProductionDeadLetterStoreFactory,
  DeadLetterStoreNotConfiguredError,
} from '@/lib/deadLetter';
import { getProviderAccessConsentStore } from '@/lib/consent/providerAccessOptOut';
import {
  getIdempotencyStore,
  setProductionIdempotencyStoreFactory,
  resetDefaultIdempotencyStore,
  IdempotencyStoreNotConfiguredError,
} from '@/lib/idempotency';
import {
  getPolicyPack,
  setProductionPolicyPackLoader,
  SdePolicyStoreNotConfiguredError,
} from '@/lib/sde/policy/policyStore';
import { getGoldCardRosterLoader } from '@/lib/dataSources/goldCardRoster';
import { getDenialRateFeedLoader } from '@/lib/dataSources/denialRateFeed';
import { getProviderDirectoryLoader } from '@/lib/dataSources/providerDirectory';
import { DataSourceNotConfiguredError } from '@/lib/dataSources/common';
import { getFhirMockMode } from '@/lib/services/fhirClient';
import { agentRuntimeMode } from '@/lib/agentRuntime';
import { getAgentDemoActions, authoredAgentActions } from '@/lib/agents/demo';
import {
  loadAgentManifests,
  setProductionManifestLoader,
  defaultRegistry,
} from '@/lib/agents/manifest';
// I8A wave C (F5 provider identity) — appended import block.
import {
  getProviderDirectory,
  setProductionProviderDirectory,
  seededProviderDirectory,
  NppesNotConfiguredError,
} from '@/lib/identity/provider';
// I8A wave A (F3 cross-reference) — appended import block.
import {
  getCrossReferenceStore,
  setProductionCrossReferenceStoreFactory,
  CrossReferenceStoreNotConfiguredError,
} from '@/lib/identity/crossReference';
// I8A-iii Wave A (B2 value-set governance) — appended import block.
import {
  getValueSetGovernanceStore,
  setProductionValueSetGovernanceStoreFactory,
  ValueSetGovernanceStoreNotConfiguredError,
} from '@/lib/terminology/governance';
import type { NormalizedRecord } from '@/lib/pipeline/types';
import { resolveActorTenantScope } from '@/lib/security/tenant';
import {
  getCareGapView,
  setProductionMeasuresFeedLoader,
  MeasuresFeedNotConfiguredError,
} from '@/lib/measures';
import {
  resolveProjectionStores,
  ProjectionStoresNotConfiguredError,
  setProductionOutboxFactory,
  setProductionGraphFactory,
} from '@/lib/graph/consumer/provider';
import {
  getRecordLifecycleStore,
  RecordLifecycleNotConfiguredError,
  setProductionRecordLifecycleFactory,
} from '@/lib/lifecycle';

// A structurally-complete record (so the mock/seeded validators pass — proving the
// production throw is production-specific, not a shape rejection).
const COMPLETE_RECORD: NormalizedRecord = {
  memberId: 'mem-1',
  resourceType: 'Coverage',
  fhirResourceId: 'cov-1',
  payload: { resourceType: 'Coverage', status: 'active' },
} as unknown as NormalizedRecord;

// ── A prober per load-bearing seam. The proof-coverage test asserts EVERY
//    fail-closed-stub and real-impl seam has one — a new such seam with no prober
//    fails the gate, so the fail-closed proof can never be skipped. ────────────────
type Prober = () => void | Promise<void>;

const PROBERS: Partial<Record<DataModeSeam, Prober>> = {
  // ── fail-closed-stub: production throws; mock does not ──────────────────────
  identity: () => {
    setSessionDataMode('identity', 'production');
    setProductionIdentitySource(null);
    expect(() => getIdentitySource()).toThrow(EmpiCandidateSourceNotConfiguredError);
    setSessionDataMode('identity', 'mock');
    expect(getIdentitySource()).toBe(mockIdentitySource); // never throws in mock
    setProductionIdentitySource(null);
  },
  terminology: () => {
    setSessionDataMode('terminology', 'production');
    const prod = selectTerminologyService();
    expect(() => (prod.validateCode as (...a: unknown[]) => unknown)('RxNorm', '1')).toThrow(
      TerminologyServiceNotConfiguredError
    );
    setSessionDataMode('terminology', 'seeded');
    // Seed service resolves a known-good code without throwing.
    expect(() =>
      (selectTerminologyService().validateCode as (...a: unknown[]) => unknown)('RxNorm', '1')
    ).not.toThrow();
  },
  profileValidation: () => {
    setSessionDataMode('profileValidation', 'production');
    // The declared production service fails LOUD when invoked directly …
    expect(() => productionProfileValidationService.validate(COMPLETE_RECORD)).toThrow(
      ProfileValidatorNotConfiguredError
    );
    // … and the gate turns that into a fail-CLOSED quarantine (never admits).
    const prodGate = selectProfileValidator().validate(COMPLETE_RECORD);
    expect(prodGate.ok).toBe(false);
    expect(prodGate.issues.some((i) => i.reasonCode === 'profile-validation-unavailable')).toBe(
      true
    );
    // mock/seeded: the same complete record passes the structural pre-flight.
    setSessionDataMode('profileValidation', 'seeded');
    expect(selectProfileValidator().validate(COMPLETE_RECORD).ok).toBe(true);
  },
  evidence: () => {
    setProductionEvidenceStoreFactory(null);
    setSessionDataMode('evidence', 'production');
    expect(() => getEvidenceStore()).toThrow(EvidenceStoreNotConfiguredError);
    setSessionDataMode('evidence', 'mock');
    expect(getEvidenceStore()).toBeTruthy(); // in-memory default, no throw
    setProductionEvidenceStoreFactory(null);
  },
  deadLetterStore: () => {
    setProductionDeadLetterStoreFactory(null);
    setSessionDataMode('deadLetterStore', 'production');
    expect(() => getDeadLetterStore()).toThrow(DeadLetterStoreNotConfiguredError);
    setSessionDataMode('deadLetterStore', 'mock');
    expect(getDeadLetterStore()).toBeTruthy(); // in-memory default, no throw
    setProductionDeadLetterStoreFactory(null);
  },
  consent: () => {
    setSessionDataMode('consent', 'production');
    // consent throws a plain Error today (message-gated) — see manifest note.
    expect(() => getProviderAccessConsentStore()).toThrow(/consent=production/);
    setSessionDataMode('consent', 'mock');
    expect(getProviderAccessConsentStore()).toBeTruthy();
  },
  measures: () => {
    setProductionMeasuresFeedLoader(null);
    setSessionDataMode('measures', 'production');
    // production with no external DEQM feed loader fails loud (never a fabricated feed).
    expect(() => getCareGapView()).toThrow(MeasuresFeedNotConfiguredError);
    setSessionDataMode('measures', 'mock');
    // mock returns the authored demo gaps (demo preserved).
    expect(getCareGapView().gaps.length).toBeGreaterThan(0);
    setProductionMeasuresFeedLoader(null);
  },
  graph: () => {
    setProductionOutboxFactory(null);
    setProductionGraphFactory(null);
    setSessionDataMode('graph', 'production');
    // production with no durable outbox/graph factory fails loud (never the in-memory fake).
    expect(() => resolveProjectionStores()).toThrow(ProjectionStoresNotConfiguredError);
    setSessionDataMode('graph', 'mock');
    expect(resolveProjectionStores().durable).toBe(false); // in-memory stores, no throw
  },
  wpcRecord: () => {
    setProductionRecordLifecycleFactory(null);
    setSessionDataMode('wpcRecord', 'production');
    expect(() => getRecordLifecycleStore(true)).toThrow(RecordLifecycleNotConfiguredError);
    setSessionDataMode('wpcRecord', 'mock');
    expect(getRecordLifecycleStore(false)).toBeTruthy(); // in-memory default, no throw
    setProductionRecordLifecycleFactory(null);
  },
  signalDisposition: () => {
    setProductionPolicyPackLoader(null);
    setSessionDataMode('signalDisposition', 'production');
    expect(() => getPolicyPack()).toThrow(SdePolicyStoreNotConfiguredError);
    setSessionDataMode('signalDisposition', 'mock');
    expect(getPolicyPack()).toBeTruthy(); // default reference pack, no throw
    setProductionPolicyPackLoader(null);
  },
  idempotencyStore: () => {
    setProductionIdempotencyStoreFactory(null);
    setSessionDataMode('idempotencyStore', 'production');
    // NS-04: production with no registered pg factory fails loud (never a silent
    // in-memory Map masquerading as durable dedupe).
    expect(() => getIdempotencyStore()).toThrow(IdempotencyStoreNotConfiguredError);
    setSessionDataMode('idempotencyStore', 'mock');
    expect(getIdempotencyStore()).toBeTruthy(); // in-memory default, no throw
    setProductionIdempotencyStoreFactory(null);
  },
  goldCardRoster: async () => {
    setSessionDataMode('goldCardRoster', 'production');
    await expect(getGoldCardRosterLoader().load('2026-01-01')).rejects.toThrow(
      DataSourceNotConfiguredError
    );
    setSessionDataMode('goldCardRoster', 'seeded');
    await expect(getGoldCardRosterLoader().load('2026-01-01')).resolves.toBeTruthy();
  },
  denialRateFeed: async () => {
    setSessionDataMode('denialRateFeed', 'production');
    await expect(getDenialRateFeedLoader().load('2026-01-01')).rejects.toThrow(
      DataSourceNotConfiguredError
    );
    setSessionDataMode('denialRateFeed', 'seeded');
    await expect(getDenialRateFeedLoader().load('2026-01-01')).resolves.toBeTruthy();
  },
  providerDirectory: async () => {
    setSessionDataMode('providerDirectory', 'production');
    await expect(getProviderDirectoryLoader().load('2026-01-01')).rejects.toThrow(
      DataSourceNotConfiguredError
    );
    setSessionDataMode('providerDirectory', 'seeded');
    await expect(getProviderDirectoryLoader().load('2026-01-01')).resolves.toBeTruthy();
  },
  // I8A wave C (F5): NPPES provider directory fails closed in production. ───────
  providerIdentity: () => {
    setProductionProviderDirectory(null);
    setSessionDataMode('providerIdentity', 'production');
    expect(() => getProviderDirectory()).toThrow(NppesNotConfiguredError);
    setSessionDataMode('providerIdentity', 'seeded');
    expect(getProviderDirectory()).toBe(seededProviderDirectory); // seed, no throw
    setSessionDataMode('providerIdentity', 'mock');
    expect(getProviderDirectory()).toBe(seededProviderDirectory);
    setProductionProviderDirectory(null);
  },
  // I8A wave A (F3): the member<->source-id xref fails closed in production. ─────
  crossReference: () => {
    setProductionCrossReferenceStoreFactory(null);
    setSessionDataMode('crossReference', 'production');
    expect(() => getCrossReferenceStore()).toThrow(CrossReferenceStoreNotConfiguredError);
    setSessionDataMode('crossReference', 'mock');
    expect(getCrossReferenceStore()).toBeTruthy(); // in-memory default, no throw
    setProductionCrossReferenceStoreFactory(null);
  },
  // I8A-iii Wave A (B2): the value-set governance ledger fails closed in production. ─
  valueSetGovernanceStore: () => {
    setProductionValueSetGovernanceStoreFactory(null);
    setSessionDataMode('valueSetGovernanceStore', 'production');
    expect(() => getValueSetGovernanceStore()).toThrow(ValueSetGovernanceStoreNotConfiguredError);
    setSessionDataMode('valueSetGovernanceStore', 'mock');
    expect(getValueSetGovernanceStore()).toBeTruthy(); // in-memory default, no throw
    setProductionValueSetGovernanceStoreFactory(null);
  },

  // ── real-impl: production does NOT fall back to the mock/in-memory path ──────
  fhirStore: () => {
    setSessionDataMode('fhirStore', 'production');
    // useMock() is false in production — the in-memory fixture store is not the
    // production read path (U4 dead-wiring class would show up as `true` here).
    expect(getFhirMockMode()).toBe(false);
    setSessionDataMode('fhirStore', 'mock');
    expect(getFhirMockMode()).toBe(true);
  },
  agentManifests: () => {
    setProductionManifestLoader(null);
    setSessionDataMode('agentManifests', 'production');
    // No mock variant exists; production honors a registered store-backed loader.
    const sentinel = defaultRegistry();
    let called = false;
    setProductionManifestLoader(() => {
      called = true;
      return sentinel;
    });
    const reg = loadAgentManifests();
    expect(called).toBe(true);
    expect(reg).toBe(sentinel); // returns the production loader's registry, never a mock
    setProductionManifestLoader(null);
    // Even with no loader, production serves the validated reference registry.
    expect(loadAgentManifests().get).toBeTypeOf('function');
  },
  agentRuntime: async () => {
    setSessionDataMode('agentRuntime', 'production');
    expect(agentRuntimeMode()).toBe('production');
    const res = await getAgentDemoActions();
    expect(res.mode).toBe('production');
    // Production runs the REAL agents and must NOT return the authored mock array.
    expect(res.actions).not.toBe(authoredAgentActions());
  },
  tenancy: () => {
    // production derives the actor scope from VERIFIED claims, never the permissive
    // demo scope; an absent claim fails CLOSED to an empty scope (no mock fallback).
    setSessionDataMode('tenancy', 'production');
    const prod = resolveActorTenantScope(
      { userId: 'Practitioner/x', role: 'pa-reviewer', authorizedMemberScope: { kind: 'org' } },
      { fhirUser: 'Practitioner/x' }
    );
    expect(prod.kind).not.toBe('demo');
    expect(prod.tenantIds).toEqual([]);
    // mock/seeded: the permissive single demo tenant (demo intact).
    setSessionDataMode('tenancy', 'mock');
    const demo = resolveActorTenantScope(
      { userId: 'x', role: 'pa-reviewer', authorizedMemberScope: { kind: 'org' } },
      {}
    );
    expect(demo.kind).toBe('demo');
  },
};

// ── Static scan: seams consumed via getDataMode('literal') in src/ ──────────────
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkTsFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Seam ids that appear as getDataMode('<seam>') at a real (non-comment) call site. */
function literalConsumedSeams(): Set<string> {
  const srcRoot = path.resolve(__dirname, '../../src');
  const re = /getDataMode\(\s*['"]([A-Za-z0-9_]+)['"]/g;
  const found = new Set<string>();
  for (const file of walkTsFiles(srcRoot)) {
    const code = stripComments(fs.readFileSync(file, 'utf8'));
    for (const m of code.matchAll(re)) found.add(m[1]);
  }
  return found;
}

// ────────────────────────────────────────────────────────────────────────────────
beforeEach(() => clearSessionDataModes());
afterEach(() => {
  clearSessionDataModes();
  setProductionIdentitySource(null);
  setProductionEvidenceStoreFactory(null);
  setProductionDeadLetterStoreFactory(null);
  setProductionPolicyPackLoader(null);
  setProductionManifestLoader(null);
  setProductionIdempotencyStoreFactory(null);
  resetDefaultIdempotencyStore();
  setProductionProviderDirectory(null); // I8A wave C cleanup
  setProductionCrossReferenceStoreFactory(null); // I8A wave A cleanup
  setProductionValueSetGovernanceStoreFactory(null); // I8A-iii Wave A (B2) cleanup
});

describe('governance: disposition manifest completeness', () => {
  it('every registered seam has a disposition entry (a new seam with none FAILS)', () => {
    const declared = new Set(dispositionSeamIds());
    const missing = DATA_MODE_SEAMS.filter((s) => !declared.has(s));
    expect(
      missing,
      `seams missing a disposition in seamDispositions.ts: ${missing.join(', ')}`
    ).toEqual([]);
  });

  it('every disposition entry names a registered seam (no stale entries)', () => {
    const registered = new Set<string>(DATA_MODE_SEAMS);
    const stale = dispositionSeamIds().filter((s) => !registered.has(s));
    expect(stale, `disposition entries for unregistered seams: ${stale.join(', ')}`).toEqual([]);
  });

  it('every entry is internally consistent (seamId matches key; required fields set)', () => {
    for (const id of dispositionSeamIds()) {
      const e = SEAM_DISPOSITIONS[id];
      expect(e.seamId).toBe(id);
      expect(e.productionResolverRef.length).toBeGreaterThan(0);
      expect(e.note.length).toBeGreaterThan(0);
      if (e.disposition === 'fail-closed-stub') {
        expect(e.notConfiguredError, `${id} must declare its notConfiguredError`).toBeTruthy();
      }
    }
  });
});

describe('governance: no unregistered seam is consumed in code', () => {
  it('every getDataMode(literal) seam in src/ is registered in DATA_MODE_SEAMS', () => {
    const registered = new Set<string>(DATA_MODE_SEAMS);
    const unregistered = [...literalConsumedSeams()].filter((s) => !registered.has(s));
    expect(
      unregistered,
      `getDataMode() called with unregistered seam ids: ${unregistered.join(', ')}`
    ).toEqual([]);
    // Walks the entire src/ tree reading every file; give it a generous timeout so a
    // slow/cold filesystem (e.g. Windows + AV) doesn't produce a false 5s timeout.
  }, 30_000);
});

describe('governance: proof coverage', () => {
  it('every load-bearing seam (real-impl | fail-closed-stub) has a prober', () => {
    const loadBearing = [
      ...seamsWithDisposition('fail-closed-stub'),
      ...seamsWithDisposition('real-impl'),
    ];
    const missing = loadBearing.filter((s) => typeof PROBERS[s] !== 'function');
    expect(
      missing,
      `load-bearing seams with no fail-closed/no-fallback proof registered: ${missing.join(', ')}`
    ).toEqual([]);
  });
});

describe('governance: fail-closed-stub seams throw in production, never a fake', () => {
  for (const seam of seamsWithDisposition('fail-closed-stub')) {
    it(`${seam}: production fails loud/closed; mock does not`, async () => {
      await PROBERS[seam]!();
    });
  }
});

describe('governance: real-impl seams do not fall back to mock in production (U4 class)', () => {
  for (const seam of seamsWithDisposition('real-impl')) {
    it(`${seam}: production uses the real path, not the mock implementation`, async () => {
      await PROBERS[seam]!();
    });
  }
});

describe('governance: mock-only seams have no production decision consumer', () => {
  const consumed = literalConsumedSeams();
  for (const seam of seamsWithDisposition('mock-only')) {
    it(`${seam}: not consumed via getDataMode() — wiring one forces reclassification`, () => {
      expect(
        consumed.has(seam),
        `${seam} is declared mock-only but is now consumed on a decision path — ` +
          `reclassify it real-impl or fail-closed-stub and add a prober`
      ).toBe(false);
    });
  }
});
