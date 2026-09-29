/**
 * `/api/pa/decision` — THE QUALIFICATION GATE, EXECUTED.
 *
 * WHY THIS FILE EXISTS. `paDecisionAdverseGate.test.ts` reads this route as TEXT and greps it. That
 * was the right call for what it pins, but it means nothing in the suite ever invoked `POST`, so:
 * the qualification gate could be deleted and only a single grep would notice, and the ORDER of
 * qualification-before-taint — which `qualification.ts` spends a paragraph justifying, because a
 * taint refusal leaks recognised fact keys into the response body — was pinned by nothing at all.
 *
 * These cases drive the real handler.
 *
 * THE CASE THAT MATTERS MOST is `an unrecognised actionType cannot buy the administrative path`.
 * Before this wave's adversarial-AFTER round, the clinical bar was decided by
 * `isAdverseCoverageAction(body.actionType)` — free text from the request, substring-matched against
 * a token list. Posting `actionType: 'pa-determination'` with `decision: 'rejected'` matched none of
 * deny|denial|adverse|reduce, fell through to `administrative`, and the administrative path performs
 * NO licence check and NO attestation check. An authenticated reviewer with an expired licence, a
 * restricted licence, or no licence at all could record a behavioral-health denial. The client chose
 * whether the clinical bar applied. That case is now RED against the old code and green against the
 * new, which is the only kind of regression pin worth having.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSessionDataModes } from '@/lib/config/dataMode';

const session = {
  authenticated: true,
  patient: 'Patient/p1',
  fhirUser: 'Practitioner/dev' as string,
  scope: 'patient/*.read',
};

vi.mock('@/lib/server/smartSession', () => ({
  isAuthenticated: async () => session.authenticated,
  getSessionAuthContext: async () => (session.authenticated ? { ...session } : null),
  getSessionPatient: async () => session.patient,
}));

const audits: { action: string; detail?: string }[] = [];
vi.mock('@/lib/server/audit', () => ({
  audit: async (row: { action: string; detail?: string }) => {
    audits.push(row);
  },
}));

async function post(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/pa/decision/route');
  const req = new Request('http://localhost/api/pa/decision', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const res = await POST(req as never);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

/** A determinative fact set that PASSES the taint gate, so taint is never the reason for a refusal. */
const CLEAN_FACTS = {
  dx: { value: 'E11.9', origin: 'system-of-record', sourceId: 'ehr', observedAtMs: 0 },
};

const REJECTION = {
  proposalId: 'p-1',
  actionType: 'pa-denial',
  decision: 'rejected',
  needDomain: 'medical',
  firedRule: 'coverage.pa.medical-necessity',
  ruleVersion: '3.2',
  memberFacingReason: 'Criteria X not met.',
  appealRef: 'Appeal/APP-1',
  determinativeFacts: CLEAN_FACTS,
};

beforeEach(() => {
  audits.length = 0;
  session.authenticated = true;
  session.fhirUser = 'Practitioner/dev';
});
afterEach(() => clearSessionDataModes());

describe('a qualified reviewer may record an adverse determination', () => {
  it('accepts the seeded medical reviewer on a medical denial', async () => {
    const res = await post(REJECTION);
    expect(res.status).toBe(200);
  });
});

describe('an unqualified reviewer is refused, with the REASON', () => {
  const refusals: [string, string, string][] = [
    ['Practitioner/expired', 'licence-expired-at-decision', 'a lapsed licence'],
    ['Practitioner/restricted', 'licence-restricted', 'a licence under discipline'],
    ['Practitioner/out-of-state', 'licence-jurisdiction-mismatch', 'the wrong state'],
    ['Practitioner/unlicensed', 'licence-absent', 'no licence at all'],
    ['Practitioner/nobody', 'not-in-credentialing-source', 'a name the source does not know'],
  ];

  for (const [who, code, why] of refusals) {
    it(`403 + ${code} — ${why}`, async () => {
      session.fhirUser = who;
      const res = await post(REJECTION);
      expect(res.status).toBe(403);
      expect(JSON.stringify(res.body)).toContain(code);
      expect(audits.some((a) => a.action === 'pa.decision.reviewer-not-qualified')).toBe(true);
    });
  }

  it('403 — a medical attestation does NOT satisfy a behavioral-health denial', async () => {
    // The substitution 42 CFR 438.210(b)(3) exists to prevent, on the live route.
    session.fhirUser = 'Practitioner/no-bh-attestation';
    const res = await post({ ...REJECTION, needDomain: 'behavioral-health' });
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).toContain('expertise-not-attested');
  });

  it('422 — an adverse decision that declares NO needDomain is refused, not defaulted', async () => {
    const { needDomain: _drop, ...noDomain } = REJECTION;
    const res = await post(noDomain);
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).toContain('needDomain');
  });
});

describe('THE DEFECT: an unrecognised actionType cannot buy the administrative path', () => {
  it('a rejection is CLINICAL by default, whatever the client calls the action', async () => {
    // `'pa-determination'` contains none of deny|denial|denied|adverse|reduce|terminate. Under the
    // previous code this fell through to `administrative`, which skips the licence and attestation
    // checks entirely — so an unlicensed reviewer recorded a denial and the platform called it
    // governed. This assertion is the regression pin.
    session.fhirUser = 'Practitioner/unlicensed';
    const res = await post({ ...REJECTION, actionType: 'pa-determination' });
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).toContain('licence-absent');
  });

  it('an UNRECOGNISED denialBasis is treated as clinical — the safe end', async () => {
    session.fhirUser = 'Practitioner/unlicensed';
    const res = await post({ ...REJECTION, denialBasis: 'whatever-i-like' });
    expect(res.status).toBe(403);
  });

  it('but a DECLARED, enumerated administrative basis does relax it', async () => {
    // Eligibility, timeliness and benefit-exhaustion denials genuinely do not need a clinical peer.
    // The difference is that the claim is now on the record instead of inferred from a string.
    session.fhirUser = 'Practitioner/unlicensed';
    const res = await post({ ...REJECTION, denialBasis: 'eligibility' });
    expect(res.status).toBe(200);
  });
});

describe('ORDERING — qualification runs BEFORE the fact-taint gate', () => {
  it('an unqualified reviewer sending a TAINTED fact set learns nothing about the facts', async () => {
    // This is the whole reason for the order. The taint refusal interpolates the offending fact KEY
    // into the response body, so running it first would hand an unqualified caller an enumeration
    // oracle over the determinative-fact keys the route recognises.
    session.fhirUser = 'Practitioner/expired';
    const res = await post({
      ...REJECTION,
      determinativeFacts: {
        secretKeyName: { value: 'x', origin: 'model', sourceId: 'llm', observedAtMs: 0 },
      },
    });
    expect(res.status).toBe(403);
    const body = JSON.stringify(res.body);
    expect(body).toContain('licence-expired-at-decision');
    expect(body).not.toContain('secretKeyName'); // the oracle stays shut
  });

  it('and a QUALIFIED reviewer still hits the taint gate — the first gate did not replace it', async () => {
    const res = await post({
      ...REJECTION,
      determinativeFacts: {
        dx: { value: 'x', origin: 'model', sourceId: 'llm', observedAtMs: 0 },
      },
    });
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).toContain('model-sourced');
  });
});
