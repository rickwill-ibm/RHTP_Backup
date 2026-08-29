import * as clock from '@/lib/clock'; // deterministic time/rng seam (test setters: setClock/setRng)
/**
 * PAS submission service.
 *
 * Builds a CONFORMANT Da Vinci PAS request bundle (`buildPasRequestBundle`) that carries the DTR
 * evidence (QuestionnaireResponse + DocumentReferences) and references a real Patient/Coverage
 * derived from the member's context — findings H1/H2/H7. Reports a TRUTHFUL transport outcome
 * (submitted / pended / error) — finding M2 — instead of always faking success.
 * Wired to RHTP's /api/pas/submit BFF route. No SmartContext.
 */
import { postJson } from '@/lib/client/bff';
import type {
  PasSubmission,
  SubmissionChannel,
  CrdResultEntry,
  DtrResultEntry,
  PaOrder,
  PatientBanner,
} from '@/lib/pa/pa-types';
import { getPatientContextByMemberId, type PatientContext } from '@/lib/pa/patientContext';
import { buildPasRequestBundle } from '@/lib/pa/pasBundle';
import { coverageRuleForCode } from '@/lib/pa/publishedCoverage';

/** Non-empty HITL intent signal. Presence tells the BFF a human chose to approve;
 *  the BFF binds the accountable reviewer of record from the authenticated session,
 *  so this constant is NEVER used as the approver identity. */
const HUMAN_APPROVAL_SIGNAL = 'reviewer-session-approval';

export interface SubmitPaInput {
  channel: SubmissionChannel;
  order: PaOrder;
  patient: PatientBanner;
  crd: CrdResultEntry[];
  dtr: DtrResultEntry[];
}

/** Resolve the full coverage context from the banner's member id; synthesize an honest, clearly
 *  unverified context when the member is not in the seeded set (so we never fabricate a payer). */
function contextFor(patient: PatientBanner): PatientContext {
  const ctx = getPatientContextByMemberId(patient.memberId);
  if (ctx) return ctx;
  return {
    patientId: `patient-${patient.memberId}`,
    name: patient.name,
    dob: patient.dob,
    coverage: {
      payer: 'Unverified payer',
      payerId: 'unverified',
      plan: 'Unverified plan',
      memberId: patient.memberId,
      subscriberId: patient.memberId,
      coverageStatus: 'unknown',
    },
  };
}

function payloadType(channel: SubmissionChannel): string {
  return channel === 'fhir' ? 'FHIR PAS Bundle (Claim/$submit)' : 'X12 275/278 (EDI)';
}
function payerEndpoint(channel: SubmissionChannel): string {
  return channel === 'fhir'
    ? 'https://payer-fhir.example-payer.com/R4/Claim/$submit'
    : 'Clearinghouse: Availity → Payer EDI Gateway (275/278)';
}
function stamp(): string {
  return clock.nowDate().toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export async function submitPriorAuth(input: SubmitPaInput): Promise<PasSubmission> {
  const ctx = contextFor(input.patient);
  const questionnaireCanonicalByCode: Record<string, string> = {};
  for (const p of input.order.procedures) {
    const canonical = coverageRuleForCode(p.cpt).questionnaireCanonical;
    if (canonical) questionnaireCanonicalByCode[p.cpt] = canonical;
  }

  const claimBundle = buildPasRequestBundle({
    channel: input.channel,
    ctx,
    order: input.order,
    dtr: input.dtr,
    now: clock.nowIso(),
    questionnaireCanonicalByCode,
  });

  const r = await postJson<{ id?: string; paNumber?: string; timestamp?: string }>(
    '/api/pas/submit',
    {
      claimBundle,
      // HITL gate signal only — the reviewer of record is bound server-side from the
      // authenticated session (see src/lib/authz/approvalAuthority.ts), never named here.
      approvedBy: HUMAN_APPROVAL_SIGNAL,
    }
  );

  // Accepted (2xx with a PA number).
  if (r.ok && r.data && r.status !== 202) {
    return {
      channel: input.channel,
      paNumber: r.data.paNumber ?? r.data.id ?? `PA-${clock.now()}`,
      payloadType: payloadType(input.channel),
      payerEndpoint: payerEndpoint(input.channel),
      timestamp: r.data.timestamp ?? stamp(),
      outcome: 'submitted',
    };
  }

  // 202 — accepted for processing / pended (HITL gate or async payer intake).
  if (r.status === 202) {
    return {
      channel: input.channel,
      paNumber:
        r.data?.paNumber ??
        r.data?.id ??
        `PA-${clock.nowDate().getFullYear()}-${String(Math.floor(clock.rng() * 90000) + 10000)}`,
      payloadType: payloadType(input.channel),
      payerEndpoint: payerEndpoint(input.channel),
      timestamp: r.data?.timestamp ?? stamp(),
      outcome: 'pended',
      disposition: 'Accepted for processing — pended pending payer decision.',
    };
  }

  // Error — do NOT fabricate a PA number or a green success (M2).
  return {
    channel: input.channel,
    paNumber: '',
    payloadType: payloadType(input.channel),
    payerEndpoint: payerEndpoint(input.channel),
    timestamp: stamp(),
    outcome: 'error',
    disposition: `Submission failed (HTTP ${r.status || 0}) — request not accepted by the payer.`,
  };
}
