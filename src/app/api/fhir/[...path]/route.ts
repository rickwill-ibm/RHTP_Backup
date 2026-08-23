/**
 * BFF FHIR passthrough (plan F-4).
 *
 * Browser → /api/fhir/<FHIR path> → (session authz) → fhirServer → APIM gateway.
 * No token or gateway URL is ever exposed to the browser. Every call is audited
 * and carries a correlation id.
 *
 * Mock mode: returns per-patient data from the patient registry so every FHIR
 * read works in demo mode without a FHIR server. Keyed by the patientId query
 * param or path segment (beneficiary=Patient/X, subject=Patient/X, patient=Patient/X).
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated, getSessionPatient, getSessionAuthContext } from '@/lib/server/smartSession';
import { getPrincipal } from '@/lib/authz/principal';
import { canAccessMemberTenantAware } from '@/lib/security/tenant';
import { fhirRead, fhirCreate } from '@/lib/server/fhirServer';
import { correlationFrom, CORRELATION_HEADER } from '@/lib/server/correlation';
import { ooError } from '@/lib/fhir/operationOutcome';
import { devMockEnabled, devBulkStatus } from '@/lib/server/devStubs';
import { getPatientById, resolveFhirToPlatformId } from '@/lib/patientRegistry';
import { getProviderAccessConsentStore } from '@/lib/consent/providerAccessOptOut';
import { audit } from '@/lib/server/audit';

export const runtime = 'nodejs';

// ── Mock FHIR resource builders ───────────────────────────────────────────────

function extractPatientId(search: string): string | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  for (const key of ['beneficiary', 'subject', 'patient']) {
    const val = params.get(key);
    if (val) return val.startsWith('Patient/') ? val.slice(8) : val;
  }
  return null;
}

function normalizePatientId(rawId: string | null): string | null {
  if (!rawId) return null;
  return resolveFhirToPlatformId(rawId) ?? rawId;
}

function mockFhirGet(resourceType: string, search: string): unknown {
  const pid = normalizePatientId(extractPatientId(search));
  const patient = pid ? (getPatientById(pid) ?? null) : null;

  if (resourceType === 'Patient' && pid) {
    return patient ? {
      resourceType: 'Patient', id: pid,
      name: [{ family: patient.name.split(' ').pop(), given: [patient.name.split(' ')[0]] }],
      birthDate: patient.dob, gender: patient.gender.toLowerCase() === 'f' ? 'female' : 'male',
      address: [{ text: patient.location }], telecom: [{ system: 'phone', value: patient.phone }],
    } : { resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'not-found', diagnostics: `Patient/${pid} not found` }] };
  }

  if (resourceType === 'Coverage') {
    return { resourceType: 'Bundle', type: 'searchset', total: 1, entry: [{
      resource: { resourceType: 'Coverage', id: `cov-${pid ?? 'mock'}`, status: 'active',
        beneficiary: { reference: `Patient/${pid}` },
        payor: [{ display: patient?.contract ?? 'Medicaid' }],
        period: { start: '2024-01-01', end: '2026-12-31' },
        class: [{ type: { text: 'plan' }, name: patient?.contract ?? 'Medicaid Plan' }],
      },
    }]};
  }

  if (resourceType === 'Condition') {
    const conditions = patient?.conditions ?? [];
    return { resourceType: 'Bundle', type: 'searchset', total: conditions.length,
      entry: conditions.map((c) => ({ resource: {
        resourceType: 'Condition', id: c.key,
        subject: { reference: `Patient/${pid}` },
        code: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: c.code, display: c.name }], text: c.name },
        clinicalStatus: { coding: [{ code: c.status.toLowerCase().replace(' ', '-') }] },
        onsetDateTime: c.onset,
      }}))
    };
  }

  if (resourceType === 'ClaimResponse') {
    // Return the patient's PA history as ClaimResponse resources so the
    // Patient Access API tab shows real denial/approval data per patient.
    const paHistory = pid ? devBulkStatus(pid).paHistory : [];
    return {
      resourceType: 'Bundle', type: 'searchset', total: paHistory.length,
      entry: paHistory.map((h, i) => ({
        resource: {
          resourceType: 'ClaimResponse',
          id: `cr-${pid ?? 'mock'}-${i}`,
          status: 'active',
          use: 'preauthorization',
          patient: { reference: `Patient/${pid}` },
          outcome: h.decision === 'approved' ? 'complete' : 'error',
          disposition: h.decision === 'approved'
            ? `Approved — Auth# ${h.authNumber ?? 'N/A'}`
            : `Denied — ${h.denialReason ?? 'See details'}`,
          type: { coding: [{ system: 'http://www.ama-assn.org/go/cpt', code: h.cpt, display: h.service }], text: h.service },
          created: h.date,
        },
      })),
    };
  }

  if (resourceType === 'MedicationRequest') {
    const meds = patient?.medications ?? [];
    return { resourceType: 'Bundle', type: 'searchset', total: meds.length,
      entry: meds.map((m) => ({ resource: {
        resourceType: 'MedicationRequest', id: m.key,
        subject: { reference: `Patient/${pid}` },
        status: 'active', intent: 'order',
        medicationCodeableConcept: { text: `${m.name} ${m.dose}` },
        dosageInstruction: [{ text: `${m.dose} ${m.frequency}` }],
        requester: { display: m.prescriber },
      }}))
    };
  }

  // Fallback: empty bundle
  return { resourceType: 'Bundle', type: 'searchset', total: 0, entry: [] };
}

async function ensureSession(): Promise<boolean> {
  try {
    return await isAuthenticated();
  } catch {
    return false;
  }
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const correlationId = correlationFrom(req.headers);
  if (!(await ensureSession())) {
    return NextResponse.json(ooError('Not authenticated', 'login'), {
      status: 401,
      headers: { [CORRELATION_HEADER]: correlationId },
    });
  }
  const { path } = await ctx.params;
  const search = req.nextUrl.search;
  const resourceType = path[0] ?? '';

  // Resolve the target member from the request once (query param), for the two
  // release gates below. Both apply in mock AND live mode.
  const targetPid = normalizePatientId(extractPatientId(search));
  const breakGlass = req.headers.get('x-break-glass') === 'true';

  // Real actor identity (AUD-02): audit with the resolved session principal, not a
  // hardcoded 'session-user'. Resolved once and reused by every gate below.
  const actorCtx = await getSessionAuthContext().catch(() => null);
  const actorId = getPrincipal(actorCtx).userId;

  // CONSENT GATE (CMS-0057-F): a member who has opted out of Provider Access data
  // sharing must not have their PHI released, regardless of treatment relationship.
  // Break-glass emergency access overrides, and is always audited. Mirrors the
  // gate on /api/match. SEAM: consent — lib/consent/providerAccessOptOut.ts.
  if (targetPid && getProviderAccessConsentStore().isOptedOut(targetPid)) {
    await audit({
      ts: new Date().toISOString(),
      actor: actorId,
      action: breakGlass ? 'fhir.read.break-glass' : 'fhir.read.consent-denied',
      resourceRef: `Patient/${targetPid}`,
      correlationId,
      outcome: breakGlass ? 'success' : 'failure',
      detail: 'provider-access opt-out',
    });
    if (!breakGlass) {
      return NextResponse.json(
        ooError('Member has opted out of Provider Access data sharing', 'forbidden'),
        { status: 403, headers: { [CORRELATION_HEADER]: correlationId } }
      );
    }
  }

  // IDOR GATE: the Patient identity read (demographics) must be scoped to the
  // session principal. A session scoped to member A must not resolve member B's
  // Patient resource from a request-supplied id. Break-glass excepted (audited).
  // Clinical searches (Coverage/Condition/...) remain a reviewer surface — their
  // per-member scoping needs the session-principal role model (documented finding).
  if (resourceType === 'Patient' && targetPid && !breakGlass) {
    const sessionPatient = await getSessionPatient().catch(() => null);
    if (sessionPatient && targetPid !== sessionPatient) {
      await audit({
        ts: new Date().toISOString(),
        actor: actorId,
        action: 'fhir.read.idor-denied',
        resourceRef: `Patient/${targetPid}`,
        correlationId,
        outcome: 'failure',
        detail: 'request patient id outside session scope',
      });
      return NextResponse.json(ooError('Requested member is outside the session scope', 'forbidden'), {
        status: 403,
        headers: { [CORRELATION_HEADER]: correlationId },
      });
    }
  }

  // TENANT + MEMBER-SCOPE GATE (HW-SEC / I13, C-TEN): closes the documented BOLA on
  // clinical FHIR reads (Coverage/Condition/Observation/...). Even an org-scoped
  // reviewer is bounded to their tenant/plan/LOB and their member scope. Seam
  // `tenancy`: mock => the single demo tenant (permissive, demo intact); production
  // => per-record tenant + IdP-claim actor scope, fail-closed. Break-glass excepted
  // (audited). Patient already handled by the IDOR gate above.
  if (targetPid && resourceType !== 'Patient' && !breakGlass) {
    const authCtx = await getSessionAuthContext().catch(() => null);
    const principal = getPrincipal(authCtx);
    const decision = canAccessMemberTenantAware(principal, authCtx, targetPid);
    if (!decision.allow) {
      await audit({
        ts: new Date().toISOString(),
        actor: principal.userId,
        action: 'fhir.read.tenant-denied',
        resourceRef: `${resourceType}/${targetPid}`,
        correlationId,
        outcome: 'failure',
        detail: decision.reason,
      });
      return NextResponse.json(ooError('Requested member is outside your authorization scope', 'forbidden'), {
        status: 403,
        headers: { [CORRELATION_HEADER]: correlationId },
      });
    }
  }

  // Mock bypass — build response from registry data, no FHIR server needed
  if (devMockEnabled()) {
    return NextResponse.json(mockFhirGet(resourceType, search), {
      status: 200,
      headers: { [CORRELATION_HEADER]: correlationId },
    });
  }

  const fhirPath = path.join('/') + search;
  const result = await fhirRead(fhirPath, { actor: actorId, correlationId });
  return NextResponse.json(result.ok ? result.raw : result.error, {
    status: result.status || (result.ok ? 200 : 502),
    headers: { [CORRELATION_HEADER]: result.correlationId },
  });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const correlationId = correlationFrom(req.headers);
  if (!(await ensureSession())) {
    return NextResponse.json(ooError('Not authenticated', 'login'), {
      status: 401,
      headers: { [CORRELATION_HEADER]: correlationId },
    });
  }
  const { path } = await ctx.params;
  const type = path[0];
  const body = await req.json().catch(() => null);
  const actorId = getPrincipal(await getSessionAuthContext().catch(() => null)).userId;
  const result = await fhirCreate(type, body, { actor: actorId, correlationId });
  return NextResponse.json(result.ok ? result.raw : result.error, {
    status: result.status || (result.ok ? 201 : 502),
    headers: { [CORRELATION_HEADER]: result.correlationId },
  });
}
