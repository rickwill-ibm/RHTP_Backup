/**
 * BFF: run Financial Clearance for a member+order (increment #1; hardened).
 *
 * POST { patientId?, orderCode?, providerNpi? } → reads the member's FHIR context
 * (live via the BFF, or the seed bundle in dev-mock), runs the thread
 * orchestrator, persists the Evidence Record, and returns the result.
 *
 * Hardening: authenticated + authorized (member-scope) + input-validated +
 * correlation-tagged + audited (PHI-safe) + fully error-wrapped. Read-only with
 * respect to FHIR; the only side-effect is persisting the PHI-safe Evidence Record.
 */
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import {
  isAuthenticated,
  getSessionPatient,
  getSessionAuthContext,
} from '@/lib/server/smartSession';
import { getPrincipal, canAccessMember, purposeForRole } from '@/lib/authz/principal';
import { canAccessMemberTenantAware, resolveActorTenantScope } from '@/lib/security/tenant';
import { getSigningKeyLoader } from '@/lib/dataSources/signingKey';
import { fhirSearch } from '@/lib/server/fhirServer';
import { devMockEnabled } from '@/lib/server/devStubs';
import { mockEntriesForPatient, type BundleEntry } from './mockBundle';
import { ooError } from '@/lib/fhir/operationOutcome';
import { flag } from '@/lib/flags/flags';
import { correlationFrom } from '@/lib/server/correlation';
import { canReadMemberData } from '@/lib/authz/guard';
import { audit } from '@/lib/server/audit';
import { loadMockLibrary } from '@/lib/policy';
import { mockGoldCardDataSource } from '@/lib/policy/goldCardSource';
import { mockDenialRateProvider } from '@/lib/policy/denialRates';
import { getEvidenceStore } from '@/lib/evidence/store';
import { projectThreadInputs } from '@/lib/goldenThread/fromFhirBundle';
import { runFinancialClearance, type ThreadResult } from '@/lib/goldenThread/threadOrchestrator';
import { runOrderToCash, type CashResult } from '@/lib/goldenThread/orderToCash';
import { getRemittanceGatewayLoader, getContractRepositoryLoader } from '@/lib/dataSources';
import { validateClearanceRequest, validateOrderCode } from '@/lib/goldenThread/validate';
import { createRuntime, createManualClock } from '@/lib/agentRuntime';
import { createRecoveryWorkflow } from '@/lib/agents/revenueCycle';
import { getAgentManifest } from '@/lib/agents/manifest';

export const runtime = 'nodejs';

async function readSeedBundle(): Promise<BundleEntry[]> {
  const p = path.join(process.cwd(), 'tools/seed/maria.bundle.json');
  const parsed = JSON.parse(await fs.readFile(p, 'utf8')) as { entry: BundleEntry[] };
  return parsed.entry;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const correlationId = correlationFrom(req.headers);

  if (!flag('goldenThread')) {
    return NextResponse.json(ooError('Financial Clearance not enabled', 'not-supported'), {
      status: 404,
    });
  }
  if (!(await isAuthenticated().catch(() => false))) {
    return NextResponse.json(ooError('Not authenticated', 'login'), { status: 401 });
  }

  const body =
    ((await req.json().catch(() => null)) as {
      patientId?: unknown;
      orderCode?: unknown;
      providerNpi?: unknown;
    } | null) ?? {};

  // 1) input validation
  const v = validateClearanceRequest(body);
  if (!v.ok) {
    return NextResponse.json(ooError(v.error ?? 'invalid request', 'invalid'), { status: 400 });
  }

  const patientId =
    (typeof body.patientId === 'string' && body.patientId) ||
    (await getSessionPatient().catch(() => null)) ||
    'MARIA_SD_001';

  // 2) authorization (session-principal role model — closes cycle-3 IDOR /
  // MEDIUM #3). Derive the acting principal from the session (NOT a hardcoded
  // role) and scope-check the requested member. A member-scoped session that
  // supplies another member's id in the body is denied (the request id is no
  // longer trusted over the session); a reviewer principal reads within its
  // authorized scope (org-wide today, panel when assignment data is wired).
  const session = await getSessionAuthContext().catch(() => null);
  const principal = getPrincipal(session);
  const scopeDecision = canAccessMember(principal, patientId);
  if (!scopeDecision.allow) {
    await audit({
      ts: new Date().toISOString(),
      actor: principal.userId,
      action: 'financial-clearance.idor-denied',
      resourceRef: `Patient/${patientId}`,
      correlationId,
      outcome: 'failure',
      detail: 'requested member outside session-principal scope',
    });
    return NextResponse.json(
      ooError('Requested member is outside the session scope', 'forbidden'),
      { status: 403 }
    );
  }

  // Defense in depth: the existing role/purpose policy, now driven by the REAL
  // session role rather than a constant (break-glass / member self-access are
  // governed by the same policy in canReadMemberData).
  const decision = canReadMemberData({
    role: principal.role,
    purpose: purposeForRole(principal.role),
    selfPatientId: principal.authorizedMemberScope.memberId,
    targetPatientId: patientId,
  });
  if (!decision.allow) {
    await audit({
      ts: new Date().toISOString(),
      actor: principal.userId,
      action: 'financial-clearance.denied',
      resourceRef: `Patient/${patientId}`,
      correlationId,
      outcome: 'failure',
      detail: decision.reason,
    });
    return NextResponse.json(ooError(decision.reason, 'forbidden'), { status: 403 });
  }

  // 2c) tenant/plan/LOB boundary (Wave-2 W2-3) — enforced at the READ boundary,
  // BEFORE any FHIR clinical fetch, fail-closed. Even an org-scoped reviewer cannot
  // reach a member outside their tenant/LOB (the cross-tenant isolation gap). In
  // the single-tenant demo (mock) this is permissive so the demo is unchanged.
  const tenantDecision = canAccessMemberTenantAware(principal, session, patientId);
  if (!tenantDecision.allow) {
    await audit({
      ts: new Date().toISOString(),
      actor: principal.userId,
      action: 'financial-clearance.tenant-denied',
      resourceRef: `Patient/${patientId}`,
      correlationId,
      outcome: 'failure',
      detail: tenantDecision.reason,
    });
    return NextResponse.json(ooError(tenantDecision.reason, 'forbidden'), { status: 403 });
  }

  try {
    // 3) gather the member's clinical context
    type CC = { text?: string; coding?: { system?: string; code?: string; display?: string }[] };
    type Cond = { code?: CC };
    type SR = {
      code?: CC;
      requester?: { identifier?: { value?: string }; display?: string };
      performer?: { identifier?: { value?: string } }[];
    };
    type Cov = {
      status?: string;
      type?: CC;
      payor?: { display?: string }[];
      class?: { type?: CC; name?: string }[];
    };
    const asRes = <T>(r: BundleEntry['resource'] | undefined): T | undefined => r as unknown as T;

    let conditions: Cond[] = [];
    let serviceRequest: SR | undefined;
    let coverage: Cov | undefined;

    if (devMockEnabled()) {
      // Use patient-specific registry data for all patients.
      // Fall back to the Maria seed bundle only if the patient isn't in the registry
      // (ensures the financial clearance thread runs against the right patient's conditions).
      const registryEntries = mockEntriesForPatient(patientId);
      const entries =
        registryEntries.length > 0
          ? registryEntries
          : await readSeedBundle().catch(() => [] as BundleEntry[]);
      conditions = entries
        .filter((e) => e.resource.resourceType === 'Condition')
        .map((e) => asRes<Cond>(e.resource) as Cond);
      serviceRequest = asRes<SR>(
        entries.find((e) => e.resource.resourceType === 'ServiceRequest')?.resource
      );
      coverage = asRes<Cov>(entries.find((e) => e.resource.resourceType === 'Coverage')?.resource);
    } else {
      const [condRes, srRes, covRes] = await Promise.all([
        fhirSearch<{ entry?: BundleEntry[] }>(
          'Condition',
          `patient=${encodeURIComponent(patientId)}`
        ),
        fhirSearch<{ entry?: BundleEntry[] }>(
          'ServiceRequest',
          `patient=${encodeURIComponent(patientId)}&status=active`
        ),
        fhirSearch<{ entry?: BundleEntry[] }>(
          'Coverage',
          `patient=${encodeURIComponent(patientId)}`
        ),
      ]);
      conditions = (condRes.raw?.entry ?? []).map((e) => asRes<Cond>(e.resource) as Cond);
      serviceRequest = asRes<SR>((srRes.raw?.entry ?? [])[0]?.resource);
      coverage = asRes<Cov>((covRes.raw?.entry ?? [])[0]?.resource);
    }

    if (!serviceRequest) {
      return NextResponse.json(
        ooError('No active order (ServiceRequest) found for member', 'not-found'),
        { status: 404 }
      );
    }

    const inputs = projectThreadInputs({
      memberId: patientId,
      conditions,
      serviceRequest,
      coverage,
      providerNpi: typeof body.providerNpi === 'string' ? body.providerNpi : undefined,
    });
    if (typeof body.orderCode === 'string') inputs.order.code = body.orderCode;

    // 4) the resolved order code must be a real code before we evaluate
    const codeCheck = validateOrderCode(inputs.order.code);
    if (!codeCheck.ok) {
      return NextResponse.json(ooError(codeCheck.error ?? 'invalid order code', 'invalid'), {
        status: 422,
      });
    }

    const ts = new Date().toISOString();
    const evId = `ev-${patientId}-${inputs.order.code}-${Date.parse(ts)}`;
    const baseDeps = {
      library: loadMockLibrary(),
      goldCardSource: mockGoldCardDataSource,
      denialRates: mockDenialRateProvider,
      store: getEvidenceStore(),
      ts,
      ids: {
        evidence: evId,
        determination: `${evId}-det`,
        goldCard: `${evId}-gc`,
        propensity: `${evId}-prop`,
        eligibility: `${evId}-elig`,
        estimation: `${evId}-est`,
      },
    };

    // Nested fork: goldenThread gates the whole route (above); goldenThreadE2E
    // additionally runs the order→cash continuation. The non-E2E branch is the
    // existing runFinancialClearance call, VERBATIM.
    let result: ThreadResult;
    let cash: CashResult | null = null;
    if (flag('goldenThreadE2E')) {
      const [remittance, feeSchedule, signer] = await Promise.all([
        getRemittanceGatewayLoader().load(ts),
        getContractRepositoryLoader().load(ts),
        // W2-1: the ledger signing key (seam mock-default: demo HMAC; production
        // fails closed until a real KMS/HSM signer is wired).
        getSigningKeyLoader().load(ts),
      ]);
      // Wave-3 (F1/E14): construct the governed agent runtime with a deterministic
      // clock (ManualClock at Date.parse(ts) — no wall-clock/random in the dispatch
      // path). runOrderToCash starts the Revenue-Cycle recovery workflow on this
      // engine; the workflow (createRecoveryWorkflow) is the SINGLE writer of the
      // recovery draft — reachable from this app entry, so revenueCycle/* is wired.
      const recoveryRuntime = createRuntime({ clock: createManualClock(Date.parse(ts)) });
      cash = await runOrderToCash(inputs, {
        ...baseDeps,
        remittance,
        feeSchedule,
        // FINDING 2: the payer's PA adjudication is a stipulated scenario fact for
        // the demo (the payer approved the 278) — supplied as an explicit input,
        // never synthesized from netRequiresPA inside the orchestrator.
        pasDecision: 'approved',
        reviewerAuthId: `auth-${patientId}-${inputs.order.code}`,
        // Wave-3 §5: the autonomy ladder is manifest-backed — a tier promotion is a
        // reviewed manifest change, never a hardcoded literal here.
        recoveryAgentTier: getAgentManifest('revenue-cycle-agent').autonomyTier,
        // Wave-3 F1: the governed recovery runtime (engine + workflow factory). The
        // agent writes the draft through its own evidence.append tool + the interlock.
        recovery: { engine: recoveryRuntime.engine, makeWorkflow: createRecoveryWorkflow },
        // W2-3 tenancy: enforce + stamp the acting principal's resolved tenant
        // scope (fail-closed before any save). W2-1: seal the record. W2-2: dedupe
        // 835 replays on payer-side business keys.
        actorScope: resolveActorTenantScope(principal, session),
        signer,
        sealTs: ts,
        idempotency: true,
        ids: {
          ...baseDeps.ids,
          pasDecision: `${evId}-pas`,
          claim: `${evId}-claim`,
          remittance: `${evId}-rem`,
          reconciliation: `${evId}-recon`,
          underpayment: `${evId}-under`,
          recovery: `${evId}-recovery`,
        },
      });
      result = cash;
    } else {
      result = await runFinancialClearance(inputs, baseDeps);
    }

    // 5) audit (PHI-safe: references + codes only)
    await audit({
      ts,
      actor: principal.userId,
      action: 'financial-clearance.run',
      resourceRef: `Patient/${patientId}`,
      correlationId,
      outcome: 'success',
      detail: `code=${inputs.order.code} requiresPA=${result.netRequiresPA} outcome=${result.summary.netOutcome}`,
    });

    return NextResponse.json(
      {
        evidenceId: result.evidence.id,
        memberId: result.memberId,
        netRequiresPA: result.netRequiresPA,
        netOutcome: result.summary.netOutcome,
        eligibility: result.eligibility,
        medicalNecessity: result.medicalNecessity.vm,
        estimate: result.estimate,
        workItem: result.workItem,
        // E2E branch only: additive order→cash continuation surface.
        ...(cash
          ? {
              // FINDING 3: reconciliation/currentTier are OMITTED on a dedupe replay
              // (they are undefined there) — a replay never surfaces a live verdict.
              ...(cash.reconciliation ? { reconciliation: cash.reconciliation } : {}),
              ...(cash.currentTier ? { currentTier: cash.currentTier } : {}),
              ...(cash.recovery ? { recovery: cash.recovery } : {}),
              ...(cash.integrity ? { integrity: cash.integrity } : {}),
              ...(cash.deduped ? { deduped: cash.deduped } : {}),
            }
          : {}),
      },
      { status: 200 }
    );
  } catch {
    // never leak internals or PHI in the error body
    await audit({
      ts: new Date().toISOString(),
      actor: principal.userId,
      action: 'financial-clearance.error',
      resourceRef: `Patient/${patientId}`,
      correlationId,
      outcome: 'failure',
      detail: 'unhandled error running financial clearance',
    }).catch(() => {});
    return NextResponse.json(ooError('Failed to run financial clearance', 'exception'), {
      status: 500,
    });
  }
}
