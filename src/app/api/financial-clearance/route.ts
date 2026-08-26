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
import { fhirSearch } from '@/lib/server/fhirServer';
import { devMockEnabled } from '@/lib/server/devStubs';
import { getPatientById } from '@/lib/patientRegistry';
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
import { runFinancialClearance } from '@/lib/goldenThread/threadOrchestrator';
import { validateClearanceRequest, validateOrderCode } from '@/lib/goldenThread/validate';

export const runtime = 'nodejs';

interface BundleEntry {
  resource: { resourceType: string; id?: string; [k: string]: unknown };
}

async function readSeedBundle(): Promise<BundleEntry[]> {
  const p = path.join(process.cwd(), 'tools/seed/maria.bundle.json');
  const parsed = JSON.parse(await fs.readFile(p, 'utf8')) as { entry: BundleEntry[] };
  return parsed.entry;
}

/**
 * Build mock FHIR bundle entries from the patient registry for a given patient.
 * Used in devMock mode so every patient gets their own conditions/coverage,
 * not Maria's seed bundle every time.
 */
function mockEntriesForPatient(patientId: string): BundleEntry[] {
  const p = getPatientById(patientId);
  if (!p) return [];
  const entries: BundleEntry[] = [];

  // Conditions
  for (const c of p.conditions ?? []) {
    entries.push({
      resource: {
        resourceType: 'Condition',
        id: c.key,
        subject: { reference: `Patient/${patientId}` },
        code: {
          coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: c.code, display: c.name }],
          text: c.name,
        },
        clinicalStatus: { coding: [{ code: c.status.toLowerCase().replace(' ', '-') }] },
        onsetDateTime: c.onset,
      },
    });
  }

  // ServiceRequest — use the patient's primary PA scenario CPT code
  const { PATIENT_PA_SCENARIOS } = mockScenarios();
  const scenario = PATIENT_PA_SCENARIOS[patientId] ?? PATIENT_PA_SCENARIOS['MARIA_SD_001'];
  entries.push({
    resource: {
      resourceType: 'ServiceRequest',
      id: `sr-${patientId}`,
      status: 'active',
      intent: 'order',
      subject: { reference: `Patient/${patientId}` },
      code: {
        coding: [
          {
            system: 'http://www.ama-assn.org/go/cpt',
            code: scenario.cptCode,
            display: scenario.procedureName,
          },
        ],
        text: scenario.procedureName,
      },
      requester: { display: p.pcp },
    },
  });

  // Coverage
  entries.push({
    resource: {
      resourceType: 'Coverage',
      id: `cov-${patientId}`,
      status: 'active',
      beneficiary: { reference: `Patient/${patientId}` },
      payor: [{ display: p.contract }],
    },
  });

  return entries;
}

// Inline PA scenario map — mirrors PATIENT_PA_SCENARIOS in api-explorer/page.tsx
// and devStubs.ts so mock mode is consistent across all three.
function mockScenarios(): {
  PATIENT_PA_SCENARIOS: Record<string, { cptCode: string; procedureName: string }>;
} {
  return {
    PATIENT_PA_SCENARIOS: {
      MARIA_SD_001: { cptCode: '72148', procedureName: 'MRI Lumbar Spine w/o Contrast' },
      'PAT-0042': { cptCode: '75561', procedureName: 'Cardiac MRI w/ and w/o contrast' },
      'PAT-0087': { cptCode: '93306', procedureName: 'Echocardiogram (complete transthoracic)' },
      'PAT-0103': { cptCode: '99243', procedureName: 'Nephrology office consultation' },
      'PAT-0156': { cptCode: '99244', procedureName: 'Pulmonology office consultation' },
    },
  };
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
  const principal = getPrincipal(await getSessionAuthContext().catch(() => null));
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
    const result = await runFinancialClearance(inputs, {
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
    });

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
