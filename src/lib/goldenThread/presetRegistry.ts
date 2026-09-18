/**
 * presetRegistry.ts (Phase A — Golden Thread guided reviewer surface).
 *
 * SERVER-ONLY. One source of truth for turning a policy PRESET into the manifest
 * registry override that promotes the recovery agent's autonomy tier, shared by BOTH
 * ends of the thread so draft-time and decision-time run the SAME governance:
 *
 *   - the surface (`/golden-thread` page) builds the override from the chosen preset
 *     when it drafts the recovery, and
 *   - the decision route (`/api/recovery/{id}/decision` → decisionSupport) rebuilds the
 *     SAME override when the qualified human acts, recovering the preset from the
 *     recoveryId (which folds `-{presetId}-`).
 *
 * Adversarial finding #1 (Phase A): before this module the decision route created its
 * engine with the DEFAULT registry, so an aggressive/balanced draft (rung lifted by the
 * preset) was decided under the shipped-default tier — a draft/decision rung mismatch.
 * Rebuilding the preset registry here closes that: `permittedRung` is computed against
 * the same manifest at both moments. The evidence-tier ceiling (interlock) still caps a
 * bolder preset on weak evidence — this only removes the DEFAULT-vs-preset drift, it does
 * not raise authority past the tier.
 *
 * PHI-safe: reads only the preset token embedded in an internal id; touches no member data.
 *
 * SERVER-ONLY BY CONVENTION: imported only from the page and the decision route (both
 * server). It pulls no node built-ins (just the manifest JSON + `parseRegistry`), so it
 * carries no crypto/node dependency — but keep it off the client import graph so the
 * agent-manifest data never ships to the browser.
 */
import {
  parseRegistry,
  type AgentManifestRegistry,
  type AutonomyTier,
} from '@/lib/agents/manifest';
import agentManifestsJson from '@/lib/agents/manifest/data/agent-manifests.json';
import { THREAD_PRESETS, type ThreadPresetId } from './threadPresets';

const REVENUE_CYCLE_AGENT_ID = 'revenue-cycle-agent';

/** The default preset when a recoveryId carries no recognizable preset token. */
const DEFAULT_PRESET_ID: ThreadPresetId = 'balanced';

/**
 * Build a manifest registry override for a preset autonomy tier: clone the shipped
 * default agent-manifests data, set the recovery agent's autonomy tier to the preset's,
 * then re-validate via the real `parseRegistry` (loudly refuses a malformed clone).
 * With no tier that differs from the shipped default the result is byte-equivalent to
 * loadAgentManifests().
 */
export function buildPresetRegistry(tier: AutonomyTier): AgentManifestRegistry {
  const clone = JSON.parse(JSON.stringify(agentManifestsJson)) as {
    version: string;
    agents: Array<{ id: string; autonomyTier: string } & Record<string, unknown>>;
  };
  for (const agent of clone.agents) {
    if (agent.id === REVENUE_CYCLE_AGENT_ID) agent.autonomyTier = tier;
  }
  return parseRegistry(clone);
}

/**
 * Recover the preset id from a recoveryId. The surface folds `-{presetId}-` into the
 * evidence id (and thus the recoveryId `ev-{member}-{scenario}-{preset}-{ts}-recovery`),
 * so a whole-segment scan for a known preset token is exact and order-independent.
 * Unknown / absent → the default preset (balanced), so a legacy id still decides sanely.
 */
export function presetIdFromRecoveryId(recoveryId: string): ThreadPresetId {
  const segments = recoveryId.split('-');
  for (const id of Object.keys(THREAD_PRESETS) as ThreadPresetId[]) {
    if (segments.includes(id)) return id;
  }
  return DEFAULT_PRESET_ID;
}

/**
 * The manifest registry override for the preset a recoveryId was drafted under — the
 * one-call helper the decision route uses so its engine matches the draft-time engine.
 */
export function presetRegistryForRecoveryId(recoveryId: string): AgentManifestRegistry {
  const presetId = presetIdFromRecoveryId(recoveryId);
  return buildPresetRegistry(THREAD_PRESETS[presetId].autonomyTier);
}
