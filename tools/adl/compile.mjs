/**
 * Plain-node mirror of the ADL compile path, shared by the emitter and the
 * checker so there is ONE mirror rather than two that can drift apart.
 *
 * It exists because the gate must be runnable without a TypeScript toolchain.
 * It is a mirror, not the implementation: src/lib/agents/adl is the reviewed
 * source, and tests/agents/adl/mirrorParity.test.ts pins the two together.
 *
 * TWO RULES THIS FILE LEARNED THE HARD WAY.
 *
 * 1. FAIL CLOSED ON ANYTHING UNRECOGNISED. An earlier version compared tiers
 *    with `ORDER.indexOf(a) > ORDER.indexOf(b)`. indexOf returns -1 for an
 *    unknown value and -1 > 0 is false, so a definition carrying
 *    `"autonomyTier": "Autonomous"` cleared every authority check in the gate
 *    CI actually runs, while the TypeScript path refused it outright. A mirror
 *    that is more permissive than its source is worse than no mirror: it is a
 *    green check over an ungoverned artifact.
 *
 * 2. PRODUCE NOTHING WHEN A GATE FAILS. That version also computed the
 *    artifacts unconditionally and returned them alongside the failure list, so
 *    any caller reading the output without reading `failures` would emit a
 *    fully-formed artifact from a definition set the lock had rejected. That is
 *    a class of drift a parity test cannot reach, because parity tests compare
 *    outputs on inputs that pass.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const DATA = 'src/lib/agents/adl/data';
export const LOCK = 'src/lib/agents/authority/data/authority-lock.json';
export const MANIFEST = 'src/lib/agents/manifest/data/agent-manifests.json';
export const ROUTING = 'src/lib/agents/dispatch/data/agent-routing.json';

export const AUTONOMY = ['HITL', 'HOTL', 'autonomous'];
// Exported so tests/agents/adl/mirrorParity.test.ts can compare it, member for
// member, against AGENT_TASK_KINDS in src/lib/agents/dispatch/types.ts.
export const TASK_KINDS = ['outreach', 'referral', 'pa'];
// MIRRORS the closed PA machine vocabularies in src/lib/workflow/paMachine.ts
// (PA_STATES / PA_EVENT_TYPES). Restated because this file imports no TS;
// tests/agents/adl/mirrorParity.test.ts asserts set equality against the TS side.
export const PA_STATES = [
  'Draft',
  'CRD',
  'NoAuthRequired',
  'RequirementsKnown',
  'DTR',
  'Prepopulated',
  'EvidenceComplete',
  'Submitted',
  'Pending',
  'Approved',
  'Denied',
  'MoreInfo',
  'AppealOrReview',
  'GapClosed',
];
export const PA_EVENT_TYPES = [
  'order-created',
  'crd-none',
  'crd-required',
  'launch-dtr',
  'prepopulated',
  'evidence-complete',
  'submit',
  'acknowledged',
  'claim-response',
  'resubmit',
  'close-gap',
  'appeal',
];
export const PHI = ['none', 'references-only', 'full'];
const CODE = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$/;

const sortValue = (v) =>
  Array.isArray(v)
    ? v.map(sortValue)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, sortValue(v[k])])
        )
      : v;
export const stable = (v) => `${JSON.stringify(sortValue(v), null, 2)}\n`;

/**
 * Rank a value within an ordering, or return null for an unknown one. The
 * caller MUST treat null as a failure — never as "not greater than".
 */
const rank = (order, value) => {
  const i = order.indexOf(value);
  return i < 0 ? null : i;
};

function checkLock(lock, knownIds, fail) {
  if (!lock || typeof lock !== 'object' || !Array.isArray(lock.entries)) {
    fail('authority-lock.json: entries must be an array');
    return new Map();
  }
  const byId = new Map();
  for (const e of lock.entries) {
    if (!e || typeof e.agentId !== 'string' || !e.agentId) {
      fail('authority-lock.json: an entry has no agentId');
      continue;
    }
    if (!Array.isArray(e.tools)) {
      // A bare string would be iterated character by character by `includes`
      // below and pass the subset check as nonsense.
      fail(`${e.agentId}: lock entry tools must be an array`);
      continue;
    }
    if (rank(AUTONOMY, e.maxAutonomyTier) === null)
      fail(`${e.agentId}: lock maxAutonomyTier "${e.maxAutonomyTier}" is not a known tier`);
    if (rank(PHI, e.maxPhiPosture) === null)
      fail(`${e.agentId}: lock maxPhiPosture "${e.maxPhiPosture}" is not a known posture`);
    if (byId.has(e.agentId))
      fail(
        `${e.agentId}: duplicate authority-lock entry (a second entry shadows the first and widens authority)`
      );
    byId.set(e.agentId, e);
  }
  for (const id of byId.keys())
    if (!knownIds.has(id)) fail(`${id}: authority-lock entry has no definition (orphan grant)`);
  return byId;
}

function checkAuthority(d, entry, fail) {
  const excess = d.toolAllowlist.filter((t) => !entry.tools.includes(t));
  if (excess.length) fail(`${d.id}: tools not granted by the lock -> ${excess.join(', ')}`);

  const tier = rank(AUTONOMY, d.autonomyTier);
  const maxTier = rank(AUTONOMY, entry.maxAutonomyTier);
  if (tier === null) fail(`${d.id}: autonomyTier "${d.autonomyTier}" is not a known tier`);
  else if (maxTier === null || tier > maxTier)
    fail(`${d.id}: autonomyTier ${d.autonomyTier} exceeds locked ${entry.maxAutonomyTier}`);

  const phi = rank(PHI, d.phiPosture);
  const maxPhi = rank(PHI, entry.maxPhiPosture);
  if (phi === null) fail(`${d.id}: phiPosture "${d.phiPosture}" is not a known posture`);
  else if (maxPhi === null || phi > maxPhi)
    fail(`${d.id}: phiPosture ${d.phiPosture} exceeds locked ${entry.maxPhiPosture}`);

  // Declared data classes must be within the lock. Omitted on the lock entry
  // means NONE granted — fail closed, matching assertAuthority.ts.
  const lockedClasses = new Set(entry.dataClasses ?? []);
  const declared = d.dataCapability?.dataClasses ?? [];
  if (!Array.isArray(declared)) fail(`${d.id}: dataCapability.dataClasses must be an array`);
  else {
    const excess = declared.filter((c) => !lockedClasses.has(c));
    if (excess.length)
      fail(`${d.id}: data class(es) not granted by the lock -> ${excess.join(', ')}`);
  }
  if (d.escalationPolicyRef !== entry.escalationPolicyRef)
    fail(`${d.id}: escalationPolicyRef differs from the lock`);
  if (d.phiPosture === 'full' && !d.phiFullOverride)
    fail(`${d.id}: phiPosture full without an explicit override`);
}

// MIRROR of DEFINITION_KEYS in src/lib/agents/adl/schema.ts. The TS parser REFUSES an
// unknown top-level key; tolerating one here would accept a definition it rejects.
const DEFINITION_KEYS = [
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

function checkDefinition(d, fail) {
  if (typeof d.id !== 'string' || !d.id) {
    fail('a definition has no id');
    return false;
  }
  for (const k of Object.keys(d))
    if (!DEFINITION_KEYS.includes(k)) fail(`${d.id}: unknown top-level key "${k}"`);
  if (!Array.isArray(d.toolAllowlist)) {
    fail(`${d.id}: toolAllowlist must be an array`);
    return false;
  }
  if (!Array.isArray(d.routes)) {
    // The TS schema throws on a missing routes array; tolerating it here with
    // `?? []` would let the two implementations emit different artifacts.
    fail(`${d.id}: routes must be an array`);
    return false;
  }
  if (d.body?.kind !== 'module') fail(`${d.id}: body.kind ${d.body?.kind} unsupported in v1`);
  for (const t of d.toolAllowlist) if (!CODE.test(t)) fail(`${d.id}: tool "${t}" is not a code`);
  return true;
}

function checkRoutes(defs, fail) {
  const byOrder = new Map();
  const MATCH_KEYS = ['actionability', 'kindPrefix'];
  for (const d of defs)
    for (const r of d.routes ?? []) {
      const at = `${d.id}.routes.${r?.id ?? '?'}`;
      if (!r || typeof r.id !== 'string' || !r.id) {
        fail(`${d.id}: a route has no id`);
        continue;
      }
      // MIRROR of the closed vocabulary in src/lib/agents/dispatch/types.ts
      // (AGENT_TASK_KINDS). This file is a plain-node mirror with no TS imports, so
      // the set is restated here — and `mirrorParity` is what proves the two
      // copies agree. A looser mirror would accept a definition the TS schema
      // rejects, which is the drift this gate exists to catch.
      if (!TASK_KINDS.includes(r.taskKind))
        fail(`${at}: taskKind must be one of ${TASK_KINDS.join(', ')}`);
      if (!Number.isInteger(r.dispatchOrder) || r.dispatchOrder < 0)
        fail(`${at}: dispatchOrder must be a non-negative integer`);
      if (!r.match || typeof r.match !== 'object') fail(`${at}: match must be an object`);
      else {
        // The TS parser WHITELISTS match keys. Emitting extra keys here would
        // produce a different artifact from the same definitions.
        for (const k of Object.keys(r.match))
          if (!MATCH_KEYS.includes(k)) fail(`${at}: match carries unknown key "${k}"`);
        if (r.match.actionability === undefined && r.match.kindPrefix === undefined)
          fail(`${at}: match must set at least one of actionability, kindPrefix`);
      }
      // MIRROR of the required-when-`pa` presence check in adl/schema.ts.
      if (r.taskKind === 'pa' && r.pa === undefined)
        fail(`${at}: a pa route must carry a { currentState, advanceEvent } template`);
      if (r.pa !== undefined) {
        const paKeys = Object.keys(r.pa ?? {});
        for (const k of paKeys)
          if (!['currentState', 'advanceEvent'].includes(k))
            fail(`${at}: pa carries unknown key "${k}"`);
        if (!PA_STATES.includes(r.pa?.currentState))
          fail(`${at}: pa.currentState must be one of ${PA_STATES.join(', ')}`);
        if (!PA_EVENT_TYPES.includes(r.pa?.advanceEvent?.type))
          fail(`${at}: pa.advanceEvent.type must be one of ${PA_EVENT_TYPES.join(', ')}`);
      }
      const prior = byOrder.get(r.dispatchOrder);
      if (prior !== undefined)
        fail(`${at}: dispatchOrder ${r.dispatchOrder} already held by ${prior}`);
      byOrder.set(r.dispatchOrder, at);
    }
}

function project(defs, versions) {
  const manifestJson = stable({
    version: versions.manifest,
    agents: [...defs]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((d) => ({
        id: d.id,
        version: d.version,
        purpose: d.purpose,
        toolAllowlist: d.toolAllowlist,
        autonomyTier: d.autonomyTier,
        escalationPolicyRef: d.escalationPolicyRef,
        phiPosture: d.phiPosture,
        owningModule: d.owningModule,
        // Mirrors projectManifest. Omitting it here while the TS path projects it
        // would make emitter and checker disagree on the committed bytes.
        ...(d.dataCapability !== undefined ? { dataCapability: d.dataCapability } : {}),
      })),
  });
  const routingJson = stable({
    version: versions.routing,
    routes: defs
      .flatMap((d) => d.routes.map((r) => ({ agentId: d.id, route: r })))
      .sort((a, b) => a.route.dispatchOrder - b.route.dispatchOrder)
      .map(({ agentId, route }) => {
        // Rebuilt field by field, mirroring the TS projection's whitelist.
        const c = { id: route.id, agentId, taskKind: route.taskKind, match: {} };
        if (route.match.actionability !== undefined)
          c.match.actionability = route.match.actionability;
        if (route.match.kindPrefix !== undefined) c.match.kindPrefix = route.match.kindPrefix;
        if (route.pa !== undefined)
          c.pa = {
            currentState: route.pa.currentState,
            advanceEvent: { type: route.pa.advanceEvent.type },
          };
        return c;
      }),
  });
  return { manifestJson, routingJson };
}

export function compileFromDisk(root) {
  const dataDir = join(root, DATA);
  const defs = readdirSync(dataDir)
    .filter((f) => f.endsWith('.agent.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dataDir, f), 'utf8')));
  const lock = JSON.parse(readFileSync(join(root, LOCK), 'utf8'));
  const versions = JSON.parse(readFileSync(join(dataDir, 'artifact-versions.json'), 'utf8'));

  const failures = [];
  const fail = (m) => failures.push(m);

  const seenIds = new Set();
  const wellFormed = [];
  for (const d of defs) {
    if (!checkDefinition(d, fail)) continue;
    if (seenIds.has(d.id)) {
      fail(`${d.id}: agent id declared more than once`);
      continue;
    }
    seenIds.add(d.id);
    wellFormed.push(d);
  }

  const lockById = checkLock(lock, seenIds, fail);
  for (const d of wellFormed) {
    const e = lockById.get(d.id);
    if (!e) {
      fail(`${d.id}: absent from the authority lock (fail closed)`);
      continue;
    }
    checkAuthority(d, e, fail);
  }
  checkRoutes(wellFormed, fail);

  // NOTHING is produced when a gate failed. A caller that reads the artifacts
  // without reading `failures` must not be able to emit an ungoverned file.
  if (failures.length) {
    return { defs, lock, versions, manifestJson: null, routingJson: null, failures };
  }
  return { defs, lock, versions, ...project(wellFormed, versions), failures };
}
