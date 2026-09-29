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
  shippedAuthorityLock,
  type AgentManifestRegistry,
  type AutonomyTier,
} from '@/lib/agents/manifest';
import { AUTONOMY_ORDER } from '@/lib/agents/authority';
import agentManifestsJson from '@/lib/agents/manifest/data/agent-manifests.json';
import { THREAD_PRESETS, type ThreadPresetId } from './threadPresets';

const REVENUE_CYCLE_AGENT_ID = 'revenue-cycle-agent';

/**
 * The default preset when a recoveryId carries no recognizable preset token.
 *
 * It is the MOST RESTRICTIVE one, deliberately. A parser that cannot identify
 * its input and then grants more autonomy than the safest available option is
 * failing open. This was 'balanced' (HOTL requested); the risk was masked only
 * by the authority lock currently capping every preset at HITL, so the safety
 * property lived in a config value rather than in the code. The day a state
 * approves HOTL for this agent — the case the lock exists to support — a
 * malformed id would have silently decided at HOTL.
 */
const DEFAULT_PRESET_ID: ThreadPresetId = 'conservative';

/**
 * Build a manifest registry override for a preset autonomy tier: clone the shipped
 * default agent-manifests data, set the recovery agent's autonomy tier to the preset's,
 * then re-validate via the real `parseRegistry` (loudly refuses a malformed clone).
 * With no tier that differs from the shipped default the result is byte-equivalent to
 * loadAgentManifests().
 */
/**
 * The autonomy tier this deployment's authority lock permits for the recovery
 * agent. The preset surface is a DEMONSTRATION of the dial; the lock is the
 * statement of what this deployment actually allows. The lock wins.
 */
export function lockedMaxTier(): AutonomyTier {
  const entry = shippedAuthorityLock().entries.find((e) => e.agentId === REVENUE_CYCLE_AGENT_ID);
  const max = entry?.maxAutonomyTier;
  // No entry, or a ceiling this build does not recognise, means the MOST
  // restrictive tier — never an unranked value that comparisons would treat as
  // "not greater than" and wave through.
  return max !== undefined && AUTONOMY_ORDER.includes(max)
    ? (max as AutonomyTier)
    : (AUTONOMY_ORDER[0] as AutonomyTier);
}

/** The tier actually applied once the authority lock has had its say. */
export interface ResolvedPresetTier {
  /** The tier the preset asked for. */
  requested: AutonomyTier;
  /** The tier the registry was built with — never above the locked ceiling. */
  applied: AutonomyTier;
  /** True when the lock capped the request. Surface this; do not swallow it. */
  clamped: boolean;
  /** The ceiling that did the capping, for the message shown to a reviewer. */
  lockedMax: AutonomyTier;
}

/**
 * Resolve a requested preset tier against the authority lock, CLAMPING DOWN.
 *
 * WHY CLAMP RATHER THAN PROMOTE OR THROW. The preset is chosen by a token
 * parsed out of a recoveryId — request-derived input. Letting that promote an
 * agent to `autonomous` removes the human approval gate on authority the lock
 * caps at HITL, which is a privilege escalation from a URL segment. Throwing
 * would take the page down for a demo control. Narrowing is always safe, keeps
 * the surface working, and makes the governance visible: the reviewer is told
 * the deployment's lock capped what they asked for.
 */
export function resolvePresetTier(requested: AutonomyTier): ResolvedPresetTier {
  const lockedMax = lockedMaxTier();
  const wanted = AUTONOMY_ORDER.indexOf(requested);
  if (wanted < 0) {
    // indexOf returns -1 for an unknown value, and -1 > ceiling is false, so an
    // unranked tier would sail through the comparison below and then be written
    // into the manifest clone — taking the page down at parseRegistry, which is
    // the exact outcome clamping exists to avoid. The tier is a typed union, so
    // reaching here means a cast somewhere: say so instead of guessing.
    throw new TypeError(
      `resolvePresetTier: "${requested}" is not an autonomy tier ` +
        `(expected one of ${AUTONOMY_ORDER.join(', ')})`
    );
  }
  const ceiling = AUTONOMY_ORDER.indexOf(lockedMax);
  const clamped = wanted > ceiling;
  return { requested, applied: clamped ? lockedMax : requested, clamped, lockedMax };
}

/**
 * Build a manifest registry override for a preset autonomy tier: clone the shipped
 * default agent-manifests data, set the recovery agent's autonomy tier to the tier the
 * authority lock permits, then re-validate via the real `parseRegistry`.
 */
export function buildPresetRegistry(tier: AutonomyTier): AgentManifestRegistry {
  const { applied } = resolvePresetTier(tier);
  const clone = JSON.parse(JSON.stringify(agentManifestsJson)) as {
    version: string;
    agents: Array<{ id: string; autonomyTier: string } & Record<string, unknown>>;
  };
  for (const agent of clone.agents) {
    if (agent.id === REVENUE_CYCLE_AGENT_ID) agent.autonomyTier = applied;
  }
  return parseRegistry(clone);
}

/**
 * Recover the preset id from a recoveryId of the form
 * `ev-{member}-{scenario}-{preset}-{ts}-recovery`.
 *
 * READ FROM THE END, NOT BY SCANNING. The previous implementation scanned every
 * `-`-delimited segment for any known preset token and returned the first match
 * in THREAD_PRESETS key order. Two things were wrong with that. The member id
 * comes from an external SMART authorization server and may contain dashes, so
 * a patient id of `123-aggressive` injected a preset token into an id built for
 * a `balanced` run — and decision-time would then rebuild under a different
 * manifest than draft-time, which is the exact drift this module claims to have
 * closed. And with two tokens present the winner was decided by key-declaration
 * order, so the doc comment's "exact and order-independent" was simply false.
 *
 * The trailing three segments are ours and are token-free: `{preset}-{ts}-recovery`
 * (or `{preset}-{ts}` for a bare evidence id). Reading positionally from the end
 * makes the member id's contents irrelevant.
 *
 * Unrecognised or absent → the most restrictive preset, never the middle one.
 */
export function presetIdFromRecoveryId(recoveryId: string): ThreadPresetId {
  const segments = recoveryId.split('-');
  // `…-{preset}-{ts}-recovery` → index -3; `…-{preset}-{ts}` → index -2.
  const candidates =
    segments[segments.length - 1] === 'recovery'
      ? [segments[segments.length - 3]]
      : [segments[segments.length - 2]];
  for (const c of candidates) {
    if (c !== undefined && Object.prototype.hasOwnProperty.call(THREAD_PRESETS, c)) {
      return c as ThreadPresetId;
    }
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
