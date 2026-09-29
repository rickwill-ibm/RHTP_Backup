// INVARIANT: BFF-only — this route is the sole browser entry for the reasoning seam
// SEAM: agentReasoner · agentToolBinding  (resolved in lib/agents/seams/resolve.ts)
/**
 * BFF: the bounded-reasoning wired path (WPCO agent tranche).
 *
 * POST /api/ops/agents/reasoning runs ONE real reasoning step through the whole
 * governed chain and reports what each control did:
 *
 *   1. resolve the reasoner through the `agentReasoner` dataMode seam;
 *   2. build the prompt registry, which verifies every committed template's text
 *      against its reviewed `pinnedHash` EAGERLY — a drifted prompt refuses here;
 *   3. run the step, which stamps every produced fact `origin: 'model'`;
 *   4. run `assertAdverseEligible` over those facts and RETURN THE REFUSAL.
 *
 * STEP 4 IS THE POINT OF THE ROUTE. The model-taint gate had unit coverage and no
 * caller — the "built, tested, unreached" class this route exists to close. A 200
 * here means the gate fired on a real request: model-shaped facts were refused for
 * an adverse determination, by the same code path a member-facing workflow hits.
 * `modelTaintGate.refused === false` would be the alarm, not the success.
 *
 * AUDITED ON EVERY OUTCOME, REFUSALS INCLUDED. Step 2 is the refusal this route
 * advertises, so it may not be the one that escapes: a drifted template, an
 * unloadable manifest and a malformed binding table all run INSIDE the try and land
 * as audited, correlated refusals carrying the error's own code. A framework 500 (no
 * audit row, no correlation id, a stack trace in dev) would falsify the claim above.
 *
 * LEDGER KEYS ARE SERVER-MINTED. The ledger's `workflowId` is a fresh server id, NOT
 * the inbound `x-correlation-id` — a caller-controlled, uncapped header must never
 * choose a ledger key. That header still correlates the response and audit row, and
 * both ids are reported, so a run stays traceable either way.
 *
 * Ops/auditor authz, PHI-safe: the body carries fact NAMES, origins, digests and
 * codes — never a fact value, never member data. `runtime = 'nodejs'` because
 * `nodeDigest` pulls `node:crypto`; legal here and nowhere on a page/client graph.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated, getSessionAuthContext } from '@/lib/server/smartSession';
import { ooError } from '@/lib/fhir/operationOutcome';
import { correlationFrom, newCorrelationId, CORRELATION_HEADER } from '@/lib/server/correlation';
import { getPrincipal, isOpsPrincipal, type Principal } from '@/lib/authz/principal';
import { audit } from '@/lib/server/audit';
import { log } from '@/lib/server/log';
import * as clock from '@/lib/clock';
import { getDataMode } from '@/lib/config/dataMode';
import {
  runProbe,
  AGENT_ID,
  PROMPT_ID,
  PROMPT_VERSION,
  type BindingDisposition,
  type ProbeRun,
  type TaintVerdict,
} from './probeChain';
import {
  PromptIntegrityError,
  type PromptBinding,
  type ReasoningStepResult,
} from '@/lib/agents/reasoning';
import { SeamError } from '@/lib/agents/seams';

export const runtime = 'nodejs';

/** One audit shape for every outcome of this probe, so nothing is left unaudited. */
function auditProbe(
  actor: string,
  correlationId: string,
  outcome: 'success' | 'failure',
  detail: string
): Promise<void> {
  return audit({
    ts: clock.nowIso(),
    actor,
    action: 'agents.reasoning.probe',
    correlationId,
    outcome,
    detail,
  });
}

/**
 * The error's own stable code, for the audit row and the refusal body. Each branch
 * names a class carrying a reviewed code; anything else contributes only its `name`,
 * so a raw message (possibly not PHI-safe) never reaches either.
 */
function errorCode(err: unknown): string {
  if (err instanceof PromptIntegrityError) return err.reason;
  if (err instanceof SeamError) return err.code;
  if (err instanceof Error) return err.name;
  return 'unknown';
}

/** The PHI-safe response body: names, origins, digests, codes. No fact values. */
function reasoningPayload(
  correlationId: string,
  runId: string,
  binding: PromptBinding,
  step: ReasoningStepResult,
  modelTaintGate: TaintVerdict,
  toolBindings: BindingDisposition[]
): Record<string, unknown> {
  return {
    correlationId,
    /** The SERVER-MINTED ledger run key — never the inbound correlation header. */
    runId,
    agentId: AGENT_ID,
    seamModes: {
      agentReasoner: getDataMode('agentReasoner'),
      agentToolBinding: getDataMode('agentToolBinding'),
    },
    prompt: {
      id: binding.promptId,
      version: binding.promptVersion,
      templateHash: binding.templateHash,
    },
    reasoning: {
      ledgerOutcome: step.outcome,
      resultDigest: step.resultDigest,
      producedBy: step.producedBy,
      // Names and origins only — a fact VALUE never crosses this boundary. Keyed
      // `factName`, not `name`: a bare "name" key is exactly what a PHI-key
      // scanner must flag, and this payload should never need an exemption to pass.
      facts: Object.entries(step.facts).map(([factName, f]) => ({
        factName,
        origin: f.origin,
        sourceId: f.sourceId,
      })),
      toolRequests: step.toolRequests,
    },
    modelTaintGate,
    toolBindings,
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
        ooError('Reasoning probe requires an ops/auditor role', 'forbidden'),
        { status: 403, headers }
      ),
    };
  }
  return { principal };
}

/**
 * A seam refusal — the declared production posture. Fail CLOSED with the seam's own
 * code; never substitute the recorded transcript. The audit carries the error's
 * `subject` so the row cannot mislabel WHICH seam refused.
 */
async function seamRefused(
  actor: string,
  correlationId: string,
  headers: Record<string, string>,
  err: SeamError
): Promise<NextResponse> {
  log.warn('agents.reasoning.seam_refused', { code: err.code, subject: err.subject });
  await auditProbe(
    actor,
    correlationId,
    'failure',
    `seam=${err.subject}; code=${err.code}; mode=${getDataMode('agentReasoner')}`
  );
  return NextResponse.json(
    ooError(`Reasoning seam not configured (${err.code})`, 'not-supported'),
    {
      status: 503,
      headers,
    }
  );
}

/**
 * Any other refusal on the chain — a drifted prompt, an unloadable manifest, a
 * malformed binding table — AUDITED and CORRELATED with the error's own code. That
 * is the whole point: these used to escape as a bare framework 500.
 */
async function probeFailed(
  actor: string,
  correlationId: string,
  headers: Record<string, string>,
  err: unknown
): Promise<NextResponse> {
  const code = errorCode(err);
  log.error('agents.reasoning.probe_failed', { correlationId, code });
  await auditProbe(actor, correlationId, 'failure', `error=${code}`);
  return NextResponse.json(ooError(`Reasoning probe refused (${code})`, 'exception'), {
    status: 500,
    headers,
  });
}

/** The audited success/409 outcome of a completed probe. */
async function probeCompleted(
  actor: string,
  correlationId: string,
  runId: string,
  headers: Record<string, string>,
  run: ProbeRun
): Promise<NextResponse> {
  const { binding, step, modelTaintGate, toolBindings } = run;
  const refused = toolBindings.filter((b) => b.disposition === 'refused').length;
  await auditProbe(
    actor,
    correlationId,
    modelTaintGate.refused ? 'success' : 'failure',
    `agent=${AGENT_ID}; prompt=${PROMPT_ID}@${PROMPT_VERSION}; ledger=${step.outcome}; ` +
      `runId=${runId}; adverseRefused=${String(modelTaintGate.refused)}; ` +
      `bindingsRefused=${String(refused)}`
  );
  return NextResponse.json(
    reasoningPayload(correlationId, runId, binding, step, modelTaintGate, toolBindings),
    { status: modelTaintGate.refused ? 200 : 409, headers }
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const correlationId = correlationFrom(req.headers);
  const headers = { [CORRELATION_HEADER]: correlationId };
  const gate = await opsGate(headers);
  if (gate.deny) return gate.deny;
  const { principal } = gate;
  // SERVER-MINTED ledger run key. correlationId is caller-controlled (a verbatim
  // inbound header, uncapped and unvalidated — see the module header), so it
  // correlates the trace and NEVER keys the ledger.
  const runId = newCorrelationId();

  try {
    const run = await runProbe(runId);
    return await probeCompleted(principal.userId, correlationId, runId, headers, run);
  } catch (err) {
    if (err instanceof SeamError) {
      return await seamRefused(principal.userId, correlationId, headers, err);
    }
    return await probeFailed(principal.userId, correlationId, headers, err);
  }
}
