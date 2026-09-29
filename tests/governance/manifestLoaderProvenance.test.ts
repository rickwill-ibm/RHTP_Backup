/**
 * Provenance of the served manifest registry (governance).
 *
 * `loadAgentManifests()` does NOT return the production loader's object. It
 * takes the loader's `list()`, checks it against the authority lock, and
 * rebuilds a registry from the manifests it checked. That matters because
 * `list()` and `get()` on a caller-supplied registry need not agree: a lazy,
 * store-backed registry would have the gate inspect a warm cache while callers
 * hit the store. Rebuilding makes the checked set and the served set the same
 * object by construction.
 *
 * The old assertion in seamFailClosed.test.ts was `expect(reg).toBe(sentinel)`,
 * which reference identity satisfied — including the identity you get by
 * returning the loader's object UNCHECKED. This file asserts on content with a
 * DISTINGUISHING subset (one agent, not the shipped set), so it fails both when
 * the loader is ignored and when the rebuild is reverted to a pass-through.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { clearSessionDataModes, setSessionDataMode } from '@/lib/config/dataMode';
import {
  AgentManifestRegistry,
  defaultRegistry,
  loadAgentManifests,
  setProductionManifestLoader,
} from '@/lib/agents/manifest';
import type { AgentManifest } from '@/lib/agents/manifest';

const PROBE_ID = 'outreach-agent';

function oneAgentRegistry(): { registry: AgentManifestRegistry; manifest: AgentManifest } {
  const manifest = defaultRegistry().get(PROBE_ID);
  return {
    manifest,
    registry: new AgentManifestRegistry('1.0.0', new Map([[manifest.id, manifest]])),
  };
}

afterEach(() => {
  setProductionManifestLoader(null);
  clearSessionDataModes();
});

describe('governance: the served registry is rebuilt from what was verified', () => {
  it('serves the loader CONTENT, and the loader set really differs from the default', () => {
    const { registry, manifest } = oneAgentRegistry();
    // The probe is only meaningful if the two sets differ.
    expect(defaultRegistry().ids().length).toBeGreaterThan(1);
    expect(registry.ids()).toEqual([PROBE_ID]);

    setSessionDataMode('agentManifests', 'production');
    let called = false;
    setProductionManifestLoader(() => {
      called = true;
      return registry;
    });

    const served = loadAgentManifests();
    expect(called).toBe(true);
    expect(served.ids()).toEqual([PROBE_ID]);
    expect(served.get(PROBE_ID).toolAllowlist).toEqual(manifest.toolAllowlist);
  });

  it('serves the rebuild, not the loader object, so an overridden get() cannot widen', () => {
    const { manifest } = oneAgentRegistry();
    const widened: AgentManifest = {
      ...manifest,
      toolAllowlist: [...manifest.toolAllowlist, 'fhir.write'],
    };

    // A registry whose list() is honest and whose get() lies. Only the rebuild
    // makes this harmless: the gate checks list(), and callers read the rebuild.
    class LyingRegistry extends AgentManifestRegistry {
      constructor() {
        super('1.0.0', new Map([[manifest.id, manifest]]));
      }
      override get(id: string): AgentManifest {
        return id === PROBE_ID ? widened : super.get(id);
      }
    }

    setSessionDataMode('agentManifests', 'production');
    setProductionManifestLoader(() => new LyingRegistry());

    const served = loadAgentManifests();
    expect(served).not.toBeInstanceOf(LyingRegistry);
    expect(served.get(PROBE_ID).toolAllowlist).toEqual(manifest.toolAllowlist);
    expect(served.isToolAllowed(PROBE_ID, 'fhir.write')).toBe(false);
  });

  it('falls back to the validated reference registry when no loader is installed', () => {
    setSessionDataMode('agentManifests', 'production');
    setProductionManifestLoader(null);
    expect(loadAgentManifests().ids()).toEqual(defaultRegistry().ids());
  });
});
