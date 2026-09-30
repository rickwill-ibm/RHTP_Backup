/**
 * THE AUTHORITY LOCK ON THE LIVE PATH.
 *
 * The ADL compiler checks agent DEFINITIONS against the lock at build time.
 * That governs the repository, not the running system: `setProductionManifestLoader`
 * installs a store-backed loader whose manifests the compiler never saw, and
 * `AgentManifestRegistry` has a public constructor. Until these tests passed,
 * the authority model was a parallel one with no production callers.
 *
 * Each test here is a way authority could have been widened at runtime.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  AgentManifestError,
  AgentManifestRegistry,
  assertManifestsWithinLock,
  defaultRegistry,
  loadAgentManifests,
  parseRegistry,
  setProductionManifestLoader,
  shippedAuthorityLock,
  type AgentManifest,
} from '@/lib/agents/manifest';
import { setSessionDataMode, clearSessionDataModes } from '@/lib/config/dataMode';

const SHIPPED = defaultRegistry().get('outreach-agent');

function withTools(tools: string[]): AgentManifest {
  return { ...SHIPPED, toolAllowlist: tools };
}

function registryOf(manifests: AgentManifest[]): AgentManifestRegistry {
  return new AgentManifestRegistry('1.0.0', new Map(manifests.map((m) => [m.id, m])));
}

afterEach(() => {
  setProductionManifestLoader(null);
  clearSessionDataModes();
});

describe('the shipped registry is governed by the lock it was compiled against', () => {
  it('loads — the committed manifest is within the lock', () => {
    expect(() => defaultRegistry()).not.toThrow();
    expect(shippedAuthorityLock().entries.length).toBeGreaterThan(0);
  });

  it('every shipped agent is named in the lock (no ungoverned agent ships)', () => {
    const locked = new Set(shippedAuthorityLock().entries.map((e) => e.agentId));
    for (const id of defaultRegistry().ids()) expect(locked.has(id)).toBe(true);
  });
});

describe('parseRegistry refuses a manifest that exceeds its locked authority', () => {
  const base = defaultRegistry();
  const blob = (agents: AgentManifest[]) => ({ version: '1.0.0', agents });

  it('refuses a widened tool allowlist', () => {
    const widened = withTools([...SHIPPED.toolAllowlist, 'claim.submit-appeal']);
    expect(() => parseRegistry(blob([widened]))).toThrowError(AgentManifestError);
    expect(() => parseRegistry(blob([widened]))).toThrowError(
      /not permitted by the authority lock/
    );
  });

  it('refuses a promoted autonomy tier', () => {
    const promoted: AgentManifest = { ...SHIPPED, autonomyTier: 'autonomous' };
    expect(() => parseRegistry(blob([promoted]))).toThrowError(/exceeds locked maximum/);
  });

  it('refuses a widened PHI posture', () => {
    const widened: AgentManifest = { ...SHIPPED, phiPosture: 'full' };
    expect(() => parseRegistry(blob([widened]))).toThrowError(/exceeds locked maximum/);
  });

  it('refuses an agent the lock does not name — fail closed, not fail open', () => {
    const invented: AgentManifest = { ...SHIPPED, id: 'shadow-agent' };
    expect(() => parseRegistry(blob([invented]))).toThrowError(/not present in the authority lock/);
  });

  it('still accepts the shipped agents unchanged', () => {
    expect(() => parseRegistry(blob(base.list()))).not.toThrow();
  });
});

describe('a production loader cannot route around the gate', () => {
  it('refuses a store-backed registry that widened an allowlist', () => {
    setSessionDataMode('agentManifests', 'production');
    // Constructed directly — never through parseRegistry, so the inner gate is bypassed.
    setProductionManifestLoader(() =>
      registryOf([withTools([...SHIPPED.toolAllowlist, 'member.delete-all'])])
    );
    expect(() => loadAgentManifests()).toThrowError(/not permitted by the authority lock/);
  });

  it('accepts a store-backed registry that stays within the lock', () => {
    setSessionDataMode('agentManifests', 'production');
    setProductionManifestLoader(() => registryOf([withTools(['person-context.read'])]));
    expect(() => loadAgentManifests()).not.toThrow();
  });

  it('refuses a store-backed manifest carrying an autonomy tier NO ONE HAS REVIEWED', () => {
    // THE BOUNDARY THAT MAKES THE DOWNSTREAM `never` SWITCHES DEFENCE-IN-DEPTH RATHER THAN THE ONLY
    // GUARD. `decisionGate.evaluateDecision` and `interlock.minRung` both fail closed on a tier they
    // do not recognise, and adversarial review asked the fair question: can an unknown tier actually
    // get that far? It cannot, and THIS is why — the answer was asserted in a comment and pinned by
    // nothing. `validateManifest` covers the default path; a production loader skips it, and what
    // stops it here is `assertManifestsWithinLock` → `assertAuthority.rank`, which refuses any value
    // outside `AUTONOMY_ORDER` instead of ranking it. A construct-and-serve loader is exactly the
    // route around `parseRegistry`, so the refusal has to live at load, not at parse.
    setSessionDataMode('agentManifests', 'production');
    const rogue = { ...SHIPPED, autonomyTier: 'supervisor' as AgentManifest['autonomyTier'] };
    setProductionManifestLoader(() => registryOf([rogue]));
    expect(() => loadAgentManifests()).toThrowError(/unknown value "supervisor"/);
  });

  it('refuses a store-backed manifest carrying an unknown PHI posture, for the same reason', () => {
    setSessionDataMode('agentManifests', 'production');
    const rogue = { ...SHIPPED, phiPosture: 'everything' as AgentManifest['phiPosture'] };
    setProductionManifestLoader(() => registryOf([rogue]));
    expect(() => loadAgentManifests()).toThrowError(/unknown value "everything"/);
  });
});

describe('the gate checks the object served, not the object self-reported', () => {
  /**
   * The natural shape of a store-backed registry is lazy: list() answers from a
   * warm cache, get() hits the store. A gate that inspects list() and then
   * returns the same object would check the cache while every caller uses
   * get(). So the gate rebuilds from what it verified — whatever a loader
   * declines to list is absent, not ungoverned.
   */
  class LyingRegistry extends AgentManifestRegistry {
    constructor(private readonly hidden: AgentManifest) {
      super('1.0.0', new Map([[SHIPPED.id, SHIPPED]]));
    }
    override list(): AgentManifest[] {
      return [SHIPPED]; // what the gate is shown
    }
    override get(): AgentManifest {
      return this.hidden; // what callers actually receive
    }
  }

  it('a registry whose get() widens beyond what list() showed cannot serve it', () => {
    setSessionDataMode('agentManifests', 'production');
    const widened = withTools([...SHIPPED.toolAllowlist, 'member.delete-all']);
    setProductionManifestLoader(() => new LyingRegistry(widened));
    // The gate passes on the honest list(), then rebuilds from it — so the
    // widened manifest get() would have returned is simply not there.
    const served = loadAgentManifests().get(SHIPPED.id);
    expect(served.toolAllowlist).toEqual(SHIPPED.toolAllowlist);
    expect(served.toolAllowlist).not.toContain('member.delete-all');
  });

  it('an empty manifest set is refused, not treated as maximally restricted', () => {
    setSessionDataMode('agentManifests', 'production');
    setProductionManifestLoader(() => registryOf([]));
    // Every subset check passes vacuously over an empty set. That is a
    // misconfigured store, not a safe deployment.
    expect(() => loadAgentManifests()).toThrowError(/the manifest set is empty/);
  });
});

describe('the lock itself is checked, not trusted', () => {
  it('refuses a lock with a duplicate entry, which would shadow and widen', () => {
    const entry = shippedAuthorityLock().entries[0]!;
    expect(() =>
      assertManifestsWithinLock([SHIPPED], {
        version: '1.0.0',
        entries: [entry, { ...entry, tools: [...entry.tools, 'member.delete-all'] }],
      })
    ).toThrowError(/duplicate lock entry/);
  });
});
