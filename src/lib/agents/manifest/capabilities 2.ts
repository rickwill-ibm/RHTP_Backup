// CONTRACT: C-DISCLOSURE
/**
 * The ONE producer of agent capabilities.
 *
 * Before this existed, `AgentCapability` was constructed in exactly one place in
 * the whole repository — a test, by hand. The runtime disclosure gate therefore
 * decided against an input nothing produced, and the authority lock's data-class
 * cap read `undefined` on every manifest and passed vacuously. The control was
 * demonstrated and not wired, which is the failure mode this codebase's own
 * framework names first.
 *
 * It lives in `manifest/` rather than `disclosure/` because `disclosure/` is
 * deliberately dependency-free: `decide.ts` is pure and `types.ts` imports
 * nothing. Putting the producer there would give the pure decision plane a
 * dependency on manifest loading and the dataMode seam. `manifest/` already owns
 * loading; it takes a type-only import from `disclosure/`, and `disclosure/`
 * never imports `manifest/`. No cycle.
 *
 * INVARIANT: pure projection of a LOCK-CAPPED registry — no defaults, no
 *            fallback, no merging. It can only narrow what the manifest says.
 * INVARIANT: an agent with no declared capability is ABSENT from the map, so the
 *            decision plane denies it `agent-class-not-declared` rather than
 *            inventing a permissive default.
 */
import type { AgentCapability, DataClass, PurposeOfUse } from '@/lib/agents/disclosure';
import { loadAgentManifests, type AgentManifestRegistry } from './registry';

/**
 * Build the capability map the disclosure gate decides against.
 *
 * The registry it reads has already passed the authority lock, so this cannot
 * widen anything: it copies declared values and drops agents that declared none.
 */
export function agentCapabilities(
  registry: AgentManifestRegistry = loadAgentManifests()
): ReadonlyMap<string, AgentCapability> {
  const map = new Map<string, AgentCapability>();
  for (const manifest of registry.list()) {
    const declared = manifest.dataCapability;
    if (!declared) continue;
    map.set(manifest.id, {
      agentId: manifest.id,
      // The vocabularies are validated by the ADL parser and again by
      // validateDataCapability on load; the cast records that this is a
      // projection of already-checked data, not a fresh assertion.
      purposeOfUse: declared.purposeOfUse as PurposeOfUse,
      dataClasses: declared.dataClasses.slice() as DataClass[],
    });
  }
  return map;
}
