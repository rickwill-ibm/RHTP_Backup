/**
 * Hand validator for an agent definition (house pattern: no zod inside
 * agents/*; refuse loudly with a typed error naming the JSON path).
 */
import { AdlError } from './errors';
import {
  CODE_PATTERN,
  type AgentDataCapability,
  type AgentDefinition,
  type RouteDefinition,
} from './types';
import type { AutonomyTier, PhiPosture } from '@/lib/agents/manifest';
import { AGENT_TASK_KINDS, isAgentTaskKind } from '@/lib/agents/dispatch/types';
import { isPaEventType, isPaState, PA_EVENT_TYPES, PA_STATES } from '@/lib/workflow/paMachine';

const TIERS: readonly string[] = ['HITL', 'HOTL', 'autonomous'];
const POSTURES: readonly string[] = ['none', 'references-only', 'full'];

function obj(raw: unknown, path: string): Record<string, unknown> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AdlError('ADL_SHAPE', path, 'expected an object');
  }
  return raw as Record<string, unknown>;
}

function str(src: Record<string, unknown>, key: string, path: string): string {
  const v = src[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw new AdlError('ADL_SHAPE', `${path}.${key}`, 'expected a non-empty string');
  }
  return v;
}

function oneOf<T extends string>(
  src: Record<string, unknown>,
  key: string,
  path: string,
  allowed: readonly string[]
): T {
  const v = str(src, key, path);
  if (!allowed.includes(v)) {
    throw new AdlError('ADL_SHAPE', `${path}.${key}`, `expected one of ${allowed.join(' | ')}`);
  }
  return v as T;
}

/** Tool ids must be codes — never free text that could reach a proposal. */
function codeArray(src: Record<string, unknown>, key: string, path: string): string[] {
  const v = src[key];
  if (!Array.isArray(v)) throw new AdlError('ADL_SHAPE', `${path}.${key}`, 'expected an array');
  return v.map((entry, i) => {
    if (typeof entry !== 'string' || !CODE_PATTERN.test(entry)) {
      throw new AdlError('ADL_FREE_TEXT', `${path}.${key}[${i}]`, 'expected a lowercase code');
    }
    return entry;
  });
}

/** A dispatch order must be a plain non-negative integer — never a float or NaN. */
function order(src: Record<string, unknown>, key: string, path: string): number {
  const v = src[key];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw new AdlError('ADL_SHAPE', `${path}.${key}`, 'expected a non-negative integer');
  }
  return v;
}

function parseRoute(raw: unknown, path: string): RouteDefinition {
  const r = obj(raw, path);
  const match = obj(r.match, `${path}.match`);
  const taskKind = str(r, 'taskKind', path);
  // The membership test the emitter never had. Without it an authored kind outside
  // the dispatcher's closed vocabulary compiled and emitted cleanly, and the shipped
  // loader threw on the artifact at module load instead.
  if (!isAgentTaskKind(taskKind)) {
    throw new AdlError(
      'ADL_SHAPE',
      `${path}.taskKind`,
      `expected one of ${AGENT_TASK_KINDS.join(', ')}`
    );
  }
  const route: RouteDefinition = {
    id: str(r, 'id', path),
    taskKind,
    dispatchOrder: order(r, 'dispatchOrder', path),
    match: {
      ...(match.actionability !== undefined
        ? { actionability: str(match, 'actionability', `${path}.match`) }
        : {}),
      ...(match.kindPrefix !== undefined
        ? { kindPrefix: str(match, 'kindPrefix', `${path}.match`) }
        : {}),
    },
  };
  // REQUIRED-WHEN-`pa`, the presence check the authoring layer did not have. The shipped
  // loader (`routingSchema.ts`) requires the template; this validator only checked it when
  // present. So a `pa` route with no `pa` key parsed, compiled, emitted, and passed
  // `adl:check` byte-identically — and then `parseAgentRouting` threw at MODULE LOAD,
  // taking every dispatch in the process. Verbatim the failure the taskKind derivation
  // closed, three lines down in the same function, one field over.
  if (taskKind === 'pa' && r.pa === undefined) {
    throw new AdlError(
      'ADL_SHAPE',
      `${path}.pa`,
      'a pa route must carry a { currentState, advanceEvent } template'
    );
  }
  if (r.pa !== undefined) {
    const pa = obj(r.pa, `${path}.pa`);
    const ev = obj(pa.advanceEvent, `${path}.pa.advanceEvent`);
    // MEMBERSHIP, not just non-empty-string. `str()` accepted "denied" for "Denied", and
    // `transition()` fails SOFT on an unknown state — it returns an `error` rather than
    // throwing, so the thread did not advance while the row read `executed`.
    const currentState = str(pa, 'currentState', `${path}.pa`);
    if (!isPaState(currentState)) {
      throw new AdlError(
        'ADL_SHAPE',
        `${path}.pa.currentState`,
        `expected one of ${PA_STATES.join(', ')}`
      );
    }
    const eventType = str(ev, 'type', `${path}.pa.advanceEvent`);
    if (!isPaEventType(eventType)) {
      throw new AdlError(
        'ADL_SHAPE',
        `${path}.pa.advanceEvent.type`,
        `expected one of ${PA_EVENT_TYPES.join(', ')}`
      );
    }
    route.pa = { currentState, advanceEvent: { type: eventType } };
  }
  return route;
}

/**
 * Parse the capability declaration. Both fields are CODES, not free text: a
 * purpose or data class that varies by spelling cannot be counted, compared
 * against a lock, or matched at the decision point.
 */
function parseDataCapability(raw: unknown, path: string): AgentDataCapability {
  const c = obj(raw, path);
  const purpose = str(c, 'purposeOfUse', path);
  if (!CODE_PATTERN.test(purpose)) {
    throw new AdlError('ADL_FREE_TEXT', `${path}.purposeOfUse`, 'expected a lowercase code');
  }
  return { purposeOfUse: purpose, dataClasses: codeArray(c, 'dataClasses', path) };
}

function parseBody(raw: unknown, path: string): AgentDefinition['body'] {
  const b = obj(raw, path);
  const kind = str(b, 'kind', path);
  if (kind !== 'module') {
    throw new AdlError(
      'ADL_UNSUPPORTED_BODY',
      `${path}.kind`,
      "only body.kind 'module' is supported in v1; the declarative step interpreter is blocked " +
        'pending capability-minted approval, a typed predicate registry and consent-scoped recall'
    );
  }
  return { kind: 'module', owningModule: str(b, 'owningModule', path) };
}

/**
 * Every key a definition may carry. UNKNOWN KEYS ARE REFUSED.
 *
 * THE FAIL-OPEN THIS CLOSES. `parseAgentDefinition` read only named keys and built a fresh
 * object, so an unknown top-level key was SILENTLY DISCARDED — no rejection, no warning —
 * and `checkDefinition` in the plain-node mirror had no whitelist either. The mirror DOES
 * whitelist keys one and two levels down (`match`, `pa`) with the comment "The TS parser
 * WHITELISTS match keys. Emitting extra keys here would produce a different artifact." The
 * discipline existed, was written down, was tested, and was applied at depth 2 and 3 but
 * not at depth 1.
 *
 * It is not only a tidiness rule. `dataCapability` and `phiFullOverride` are OPTIONAL, so
 * a one-letter typo — `"dataCapabilty"` — silently produced an agent declaring no data
 * classes at all. That fails closed at the disclosure gate, but as
 * `agent-class-not-declared`: the right refusal for the wrong reason, with no diagnostic
 * pointing at the typo. And this wave USED the hole, adding a 1,200-character prose note
 * that no type, gate or consumer ever saw. Design notes belong in the E8 register
 * (docs/build-provenance/gap-stub-risk-register.md), not in a validated data file.
 */
const DEFINITION_KEYS: readonly string[] = [
  'id',
  'version',
  'purpose',
  'autonomyTier',
  'escalationPolicyRef',
  'phiPosture',
  'phiFullOverride',
  'owningModule',
  'toolAllowlist',
  'dataCapability',
  'routes',
  'body',
];

/** Parse and validate one `*.agent.json` definition. Throws AdlError on refusal. */
export function parseAgentDefinition(raw: unknown, path: string): AgentDefinition {
  const d = obj(raw, path);
  for (const key of Object.keys(d)) {
    if (!DEFINITION_KEYS.includes(key)) {
      throw new AdlError(
        'ADL_SHAPE',
        `${path}.${key}`,
        `unknown key — a definition may carry only ${DEFINITION_KEYS.join(', ')}. A silently ` +
          "discarded key is a typo that changes an agent's authority with no diagnostic"
      );
    }
  }
  const phiPosture = oneOf<PhiPosture>(d, 'phiPosture', path, POSTURES);
  const def: AgentDefinition = {
    id: str(d, 'id', path),
    version: str(d, 'version', path),
    purpose: str(d, 'purpose', path),
    autonomyTier: oneOf<AutonomyTier>(d, 'autonomyTier', path, TIERS),
    escalationPolicyRef: str(d, 'escalationPolicyRef', path),
    phiPosture,
    owningModule: str(d, 'owningModule', path),
    toolAllowlist: codeArray(d, 'toolAllowlist', path),
    routes: Array.isArray(d.routes)
      ? d.routes.map((r, i) => parseRoute(r, `${path}.routes[${i}]`))
      : (() => {
          throw new AdlError('ADL_SHAPE', `${path}.routes`, 'expected an array');
        })(),
    body: parseBody(d.body, `${path}.body`),
  };
  if (d.dataCapability !== undefined) {
    def.dataCapability = parseDataCapability(d.dataCapability, `${path}.dataCapability`);
  }
  if (d.phiFullOverride !== undefined) {
    const o = obj(d.phiFullOverride, `${path}.phiFullOverride`);
    def.phiFullOverride = {
      approvedBy: str(o, 'approvedBy', `${path}.phiFullOverride`),
      ticketRef: str(o, 'ticketRef', `${path}.phiFullOverride`),
    };
  }
  if (phiPosture === 'full' && def.phiFullOverride === undefined) {
    throw new AdlError(
      'ADL_PHI_OVERRIDE_REQUIRED',
      `${path}.phiPosture`,
      "phiPosture 'full' requires phiFullOverride {approvedBy, ticketRef}"
    );
  }
  return def;
}

/** Refuse a definition set containing duplicate agent ids. */
export function assertUniqueIds(defs: readonly AgentDefinition[]): void {
  const seen = new Set<string>();
  for (const d of defs) {
    if (seen.has(d.id)) {
      throw new AdlError('ADL_DUPLICATE_ID', d.id, 'agent id declared more than once');
    }
    seen.add(d.id);
  }
}
