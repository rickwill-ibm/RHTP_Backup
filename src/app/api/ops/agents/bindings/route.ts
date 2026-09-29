// INVARIANT: BFF-only — this route is the sole browser entry for the tool-binding seam
// SEAM: tool-binding — authority is decided at build time; binding at deployment time
/**
 * BFF: the deployment-time tool-binding report (WPCO / E14).
 *
 * GET /api/ops/agents/bindings → the live form of `node tools/seams/verify.mjs`:
 * the granted tool set derived from the agent manifests, both shipped binding
 * tables parsed through `parseToolBindingTable`, and the two seam invariants run
 * against the grants (`assertBindingsWithinGrants`, `assertAllGrantsBound`).
 * Ops/auditor authz, audited. PHI-safe by construction — tool ids, counts and
 * seam error codes only; no member data is read on this path at all.
 *
 * THE HONEST ANSWER TODAY. `tool-bindings.production.json` ships
 * `{"bindings": []}` BY DESIGN, so the production table reports 11 granted, 0
 * bound, and all 11 tools failing closed at resolve time. That is reported
 * plainly: `productionReady` is false and every granted tool is listed in
 * `failClosed`. A seam refusal is a RESULT here, not an error — it is the control
 * working — so it is returned as a value with its code, and the route still 200s.
 *
 * WHY 200 AND NOT 409. An unbound production table is the designed shipped state,
 * not an anomaly a monitor should page on (contrast ops/fairness, where a flagged
 * disparity is an exception). The report is the payload; the reader decides.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated, getSessionAuthContext } from '@/lib/server/smartSession';
import { ooError } from '@/lib/fhir/operationOutcome';
import { correlationFrom, CORRELATION_HEADER } from '@/lib/server/correlation';
import { getPrincipal, isOpsPrincipal } from '@/lib/authz/principal';
import { audit } from '@/lib/server/audit';
import { log } from '@/lib/server/log';
import * as clock from '@/lib/clock';
import { loadAgentManifests } from '@/lib/agents/manifest';
import {
  parseToolBindingTable,
  assertBindingsWithinGrants,
  assertAllGrantsBound,
  SeamError,
  type SeamErrorCode,
  type SeamMode,
  type ToolBindingTable,
} from '@/lib/agents/seams';
// Data, not code: the two shipped tables the deployment gate reads (§2 — data
// lives in *.json). These are the same files tools/seams/verify.mjs walks.
import mockTableJson from '@/lib/agents/seams/data/tool-bindings.mock.json';
import productionTableJson from '@/lib/agents/seams/data/tool-bindings.production.json';

export const runtime = 'nodejs';

/** A seam refusal surfaced as a value: the control fired, with its code. */
interface SeamRefusal {
  invariant: 'bindings-within-grants' | 'all-grants-bound' | 'table-shape';
  code: SeamErrorCode;
  subject: string;
}

interface TableReport {
  table: 'mock' | 'production';
  source: string;
  parsed: boolean;
  environment?: string;
  version?: string;
  mode?: SeamMode;
  boundCount: number;
  boundTools: string[];
  /** Granted but unbound — these FAIL CLOSED at resolve time in this environment. */
  failClosed: string[];
  failClosedCount: number;
  /** Bound but not granted — a binding trying to create authority. */
  bindingsOutsideGrants: string[];
  mismatches: SeamRefusal[];
}

interface BindingsResponse {
  seam: 'tool-binding';
  grantedCount: number;
  grantedTools: string[];
  /** Keyed, not a list: every caller wants the production row specifically. */
  tables: { mock: TableReport; production: TableReport };
  /** True only when the production table binds every grant with no mismatch. */
  productionReady: boolean;
}

const SOURCES = {
  mock: 'src/lib/agents/seams/data/tool-bindings.mock.json',
  production: 'src/lib/agents/seams/data/tool-bindings.production.json',
} as const;

/** The granted tool set: the union of every loaded manifest's allowlist. */
function grantedTools(): Set<string> {
  const granted = new Set<string>();
  for (const manifest of loadAgentManifests().list()) {
    for (const tool of manifest.toolAllowlist) granted.add(tool);
  }
  return granted;
}

/**
 * Run one seam invariant and turn a SeamError into a value. Anything that is NOT
 * a seam refusal is an infrastructure failure and is rethrown — never swallowed.
 */
function runInvariant(
  invariant: SeamRefusal['invariant'],
  assertion: () => void,
  correlationId: string,
  table: string
): SeamRefusal | null {
  try {
    assertion();
    return null;
  } catch (err) {
    if (err instanceof SeamError) {
      log.warn('seam.binding.refused', {
        correlationId,
        table,
        invariant,
        code: err.code,
        subject: err.subject,
      });
      return { invariant, code: err.code, subject: err.subject };
    }
    throw err;
  }
}

function unparsedReport(which: 'mock' | 'production', refusal: SeamRefusal): TableReport {
  return {
    table: which,
    source: SOURCES[which],
    parsed: false,
    boundCount: 0,
    boundTools: [],
    failClosed: [],
    failClosedCount: 0,
    bindingsOutsideGrants: [],
    mismatches: [refusal],
  };
}

function describeTable(
  which: 'mock' | 'production',
  table: ToolBindingTable,
  granted: ReadonlySet<string>,
  correlationId: string
): TableReport {
  const bound = new Set(table.bindings.map((b) => b.tool));
  const mismatches: SeamRefusal[] = [];
  const within = runInvariant(
    'bindings-within-grants',
    () => assertBindingsWithinGrants(table, granted),
    correlationId,
    which
  );
  if (within !== null) mismatches.push(within);
  const allBound = runInvariant(
    'all-grants-bound',
    () => assertAllGrantsBound(table, granted),
    correlationId,
    which
  );
  if (allBound !== null) mismatches.push(allBound);
  // Granted-but-unbound is computed from the sets, never scraped from the error
  // message: the list and the refusal are two views of the same fact.
  const failClosed = [...granted].filter((t) => !bound.has(t)).sort();
  return {
    table: which,
    source: SOURCES[which],
    parsed: true,
    environment: table.environment,
    version: table.version,
    mode: table.mode,
    boundCount: bound.size,
    boundTools: [...bound].sort(),
    failClosed,
    failClosedCount: failClosed.length,
    bindingsOutsideGrants: [...bound].filter((t) => !granted.has(t)).sort(),
    mismatches,
  };
}

function reportFor(
  which: 'mock' | 'production',
  raw: unknown,
  granted: ReadonlySet<string>,
  correlationId: string
): TableReport {
  let table: ToolBindingTable;
  try {
    table = parseToolBindingTable(raw, SOURCES[which]);
  } catch (err) {
    if (err instanceof SeamError) {
      log.warn('seam.binding.unparsable', {
        correlationId,
        table: which,
        code: err.code,
        subject: err.subject,
      });
      return unparsedReport(which, {
        invariant: 'table-shape',
        code: err.code,
        subject: err.subject,
      });
    }
    throw err;
  }
  return describeTable(which, table, granted, correlationId);
}

function buildReport(correlationId: string): BindingsResponse {
  const granted = grantedTools();
  const mock = reportFor('mock', mockTableJson, granted, correlationId);
  const production = reportFor('production', productionTableJson, granted, correlationId);
  return {
    seam: 'tool-binding',
    grantedCount: granted.size,
    grantedTools: [...granted].sort(),
    tables: { mock, production },
    productionReady:
      production.parsed && production.failClosedCount === 0 && production.mismatches.length === 0,
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const correlationId = correlationFrom(req.headers);
  const headers = { [CORRELATION_HEADER]: correlationId };
  // Fail-CLOSED catch (the house idiom, cf. ops/fairness): a session read that
  // throws is treated as unauthenticated, never as authenticated.
  if (!(await isAuthenticated().catch(() => false))) {
    return NextResponse.json(ooError('Not authenticated', 'login'), { status: 401, headers });
  }
  const principal = getPrincipal(await getSessionAuthContext().catch(() => null));
  if (!isOpsPrincipal(principal) && principal.role !== 'auditor') {
    return NextResponse.json(
      ooError('Tool-binding report requires an ops/auditor role', 'forbidden'),
      { status: 403, headers }
    );
  }
  try {
    const body = buildReport(correlationId);
    const production = body.tables.production;
    await audit({
      ts: clock.nowIso(),
      actor: principal.userId,
      action: 'agents.bindings.report',
      correlationId,
      outcome: 'success',
      detail:
        `granted=${body.grantedCount}; productionBound=${production.boundCount}; ` +
        `productionFailClosed=${production.failClosedCount}; ready=${body.productionReady}`,
    });
    return NextResponse.json(body, { status: 200, headers });
  } catch (err) {
    log.error('agents.bindings.report.failed', {
      correlationId,
      errorName: err instanceof Error ? err.name : 'unknown',
    });
    await audit({
      ts: clock.nowIso(),
      actor: principal.userId,
      action: 'agents.bindings.report',
      correlationId,
      outcome: 'failure',
      detail: `error=${err instanceof Error ? err.name : 'unknown'}`,
    });
    return NextResponse.json(ooError('Tool-binding report failed', 'exception'), {
      status: 500,
      headers,
    });
  }
}
