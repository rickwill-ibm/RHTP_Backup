// INVARIANT: BFF-only — this route is the sole browser entry for the ADL authority view
// SEAM: agent-definition — served from the BUNDLED source (lib/agents/adl/ingest/bundledSource.ts)
/**
 * BFF: the ADL authority attestation (WPCO agent tranche).
 *
 * GET /api/ops/agents/authority loads the committed agent definitions, runs the
 * real compiler over them, and reports what the two gates said:
 *
 *   1. THE AUTHORITY LOCK (security) — `compile()` refuses a definition set whose
 *      compiled authority exceeds the separately-reviewed lock. The compiler can
 *      only ever narrow. A refusal here is a 500, not a soft warning.
 *   2. DRIFT (consistency) — the committed generated artifacts must equal the
 *      compiled output, so generated authority cannot be hand-edited.
 *
 * HONESTY ON GATE 2 — READ BEFORE CHANGING THE PAYLOAD. `assertNoDrift` compares
 * canonical BYTES. This route reads through the bundled (statically imported)
 * source, which yields PARSED objects, so the committed side has to be
 * re-canonicalised before comparison. That proves the committed artifacts are
 * SEMANTICALLY equal to the compiled projections — same agents, same authority,
 * same route precedence — and it does NOT prove byte equality: a committed file
 * with reordered keys or different whitespace would pass here. The payload
 * therefore reports `driftCheck: 'semantic'` and names the byte-level gate
 * (`npm run adl:check`, the .mjs mirror that reads the real files) so no reader
 * can mistake one claim for the other. Do not relabel this 'byte' without
 * switching the source to one that returns committed bytes.
 *
 * Ops/auditor authz, audited. PHI-safe by construction: agent ids, tool ids,
 * autonomy tiers and counts only — this surface never touches member data.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated, getSessionAuthContext } from '@/lib/server/smartSession';
import { ooError } from '@/lib/fhir/operationOutcome';
import { correlationFrom, CORRELATION_HEADER } from '@/lib/server/correlation';
import { getPrincipal, isOpsPrincipal, type Principal } from '@/lib/authz/principal';
import { audit } from '@/lib/server/audit';
import { log } from '@/lib/server/log';
import * as clock from '@/lib/clock';
import {
  AdlError,
  CANONICAL_SPEC_VERSION,
  assertNoDrift,
  compile,
  loadArtifactVersions,
  loadAuthorityLock,
  loadDefinitions,
  projectManifest,
  projectRouting,
  serializeStable,
  type AgentDefinition,
  type CompiledArtifacts,
} from '@/lib/agents/adl';
import {
  BUNDLED_ARTIFACT_VERSIONS_PATH,
  BUNDLED_AUTHORITY_LOCK_PATH,
  BUNDLED_COMMITTED_ARTIFACTS,
  bundledSource,
} from '@/lib/agents/adl/ingest/bundledSource';

export const runtime = 'nodejs';

/** The byte-level gate this route deliberately does NOT stand in for. */
const BYTE_LEVEL_GATE = 'npm run adl:check (tools/adl/verify.mjs — reads the committed files)';

interface AuthoritySummary {
  agents: {
    id: string;
    version: string;
    autonomyTier: string;
    phiPosture: string;
    toolCount: number;
  }[];
  routes: { id: string; agentId: string; taskKind: string }[];
}

/** The committed artifacts, canonicalised so they can be compared at all. */
function canonicalisedCommitted(): CompiledArtifacts {
  return {
    manifestJson: serializeStable(BUNDLED_COMMITTED_ARTIFACTS.manifest),
    routingJson: serializeStable(BUNDLED_COMMITTED_ARTIFACTS.routing),
  };
}

/**
 * Run the drift gate and report which artifact diverged. A drift is an expected
 * operational finding (someone hand-edited a generated file), so it is returned
 * as a value; anything that is not an `AdlError` propagates.
 */
function semanticDrift(compiled: CompiledArtifacts): string[] {
  try {
    assertNoDrift(compiled, canonicalisedCommitted());
    return [];
  } catch (err) {
    if (err instanceof AdlError) {
      log.warn('agents.authority.semantic_drift', { code: err.code, artifact: err.path });
      return [err.path];
    }
    throw err;
  }
}

/**
 * Project the definitions into the PHI-free summary the payload carries. The
 * definition set is passed in, not reloaded: the summary must describe the SAME
 * set the authority lock was just enforced against.
 */
function summarise(
  defs: readonly AgentDefinition[],
  versions: { manifest: string; routing: string }
): AuthoritySummary {
  const manifest = projectManifest(defs, versions.manifest);
  const routing = projectRouting(defs, versions.routing);
  return {
    agents: manifest.agents.map((a) => ({
      id: a.id,
      version: a.version,
      autonomyTier: a.autonomyTier,
      phiPosture: a.phiPosture,
      toolCount: a.toolAllowlist.length,
    })),
    routes: routing.routes.map((r) => ({ id: r.id, agentId: r.agentId, taskKind: r.taskKind })),
  };
}

/**
 * Auth + ops/auditor authz, as one gate. Returns the response to send on refusal,
 * or the acting principal on success — so a handler cannot accidentally continue
 * past a deny by forgetting a `return`.
 */
type Gate = { deny: NextResponse } | { deny?: undefined; principal: Principal };

async function opsGate(headers: Record<string, string>): Promise<Gate> {
  if (!(await isAuthenticated().catch(() => false))) {
    return {
      deny: NextResponse.json(ooError('Not authenticated', 'login'), { status: 401, headers }),
    };
  }
  const principal = getPrincipal(await getSessionAuthContext().catch(() => null));
  if (!isOpsPrincipal(principal) && principal.role !== 'auditor') {
    return {
      deny: NextResponse.json(
        ooError('Agent authority attestation requires an ops/auditor role', 'forbidden'),
        { status: 403, headers }
      ),
    };
  }
  return { principal };
}

/** One audit shape for every outcome of the attestation. */
function auditAttest(
  actor: string,
  correlationId: string,
  outcome: 'success' | 'failure',
  detail: string
): Promise<void> {
  return audit({
    ts: clock.nowIso(),
    actor,
    action: 'agents.authority.attest',
    correlationId,
    outcome,
    detail,
  });
}

interface Attested {
  drifted: string[];
  summary: AuthoritySummary;
  versions: { manifest: string; routing: string };
}

/** Load, compile (authority lock) and drift-check. Throws AdlError on refusal. */
function attest(): Attested {
  const versions = loadArtifactVersions(bundledSource, BUNDLED_ARTIFACT_VERSIONS_PATH);
  const lock = loadAuthorityLock(bundledSource, BUNDLED_AUTHORITY_LOCK_PATH);
  const defs = loadDefinitions(bundledSource);
  // compile() runs assertUniqueIds + the AUTHORITY LOCK before it emits anything.
  const drifted = semanticDrift(compile(defs, lock, versions));
  return { drifted, summary: summarise(defs, versions), versions };
}

/** The PHI-free attestation body. The drift label is SEMANTIC and says so. */
function attestationPayload(correlationId: string, a: Attested): Record<string, unknown> {
  return {
    correlationId,
    source: 'bundled-static-json',
    canonicalSpecVersion: CANONICAL_SPEC_VERSION,
    artifactVersions: a.versions,
    attestation: {
      authorityLock: 'within-lock',
      // SEMANTIC, not byte. See the module header before changing this label.
      driftCheck: 'semantic' as const,
      driftCheckScope:
        'canonicalised parsed content of the committed artifacts vs the compiled ' +
        'projections — key order and whitespace are NOT compared',
      byteLevelGate: BYTE_LEVEL_GATE,
      drifted: a.drifted,
    },
    ...a.summary,
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const correlationId = correlationFrom(req.headers);
  const headers = { [CORRELATION_HEADER]: correlationId };
  const gate = await opsGate(headers);
  if (gate.deny) return gate.deny;
  const { principal } = gate;

  let attested: Attested;
  try {
    attested = attest();
  } catch (err) {
    if (!(err instanceof AdlError)) throw err;
    // A committed definition set that will not load or compile is a deployment
    // fault, and it fails CLOSED: no partial authority view is served.
    log.error('agents.authority.refused', { code: err.code, at: err.path });
    await auditAttest(
      principal.userId,
      correlationId,
      'failure',
      `code=${err.code}; at=${err.path}`
    );
    return NextResponse.json(ooError(`Agent definitions refused (${err.code})`, 'processing'), {
      status: 500,
      headers,
    });
  }

  const clean = attested.drifted.length === 0;
  await auditAttest(
    principal.userId,
    correlationId,
    clean ? 'success' : 'failure',
    `agents=${String(attested.summary.agents.length)}; ` +
      `routes=${String(attested.summary.routes.length)}; driftCheck=semantic; ` +
      `drifted=${clean ? 'none' : attested.drifted.join(',')}`
  );
  return NextResponse.json(attestationPayload(correlationId, attested), {
    status: clean ? 200 : 409,
    headers,
  });
}
