/**
 * pixmErrorVsNotFound.test.ts — documents a verified gap in the PIXm resolver:
 * parsePixmResponse() does not distinguish a genuine "no matching Connect360
 * record" from a PIXm transport/server ERROR (5xx, malformed body, or an
 * OperationOutcome). Both currently collapse to the same outcome the caller
 * (resolvePatientId.ts, via /api/empi/mrn-to-uuid) treats as "safe to fall
 * back to a direct FHIR identifier search" — which means a real PIXm outage
 * is currently indistinguishable from "this patient truly has no record."
 *
 * Ref: cerner-smartapp-plan-verification.md §EMPI Agent, and the revised
 * fix plan §4 ("Confirmed gap ... still open").
 *
 * This file intentionally imports parsePixmResponse directly from fhirPixm.ts
 * (not the src/lib/identity/external barrel) — the barrel re-exports from
 * pixPdqResolver.ts, which imports hl7v2.ts, a file this test environment
 * could not read (see the accompanying test-results report, "files not
 * executable this session"). fhirPixm.ts has no such dependency (type-only
 * imports), so this is the correct, minimal-surface place to test the actual
 * defect regardless of that unrelated read issue.
 *
 * These tests assert CURRENT behavior (they pass against the code as it
 * stands today) — they exist to make the gap visible and regression-proof
 * the day it's fixed: when parsePixmResponse gains a real 'error' outcome,
 * the assertions marked "KNOWN GAP" below should start failing, which is the
 * signal to update them.
 */
import { describe, it, expect } from 'vitest';
import { parsePixmResponse } from '@/lib/identity/external/fhirPixm';

const ENTERPRISE_SYSTEM = 'urn:oid:1.2.3.4.5.connect360';

// Two real seeded MRNs, used only to ground the scenarios in real patient
// identifiers (the parser itself is identifier-agnostic — it only inspects
// the transport status/body, per fhirPixm.ts).
const DOROTHY_MRN = 'MRN-0042'; // scenario: PIXm endpoint is DOWN while resolving her
const JAMES_MRN = 'MRN-0087'; // scenario: PIXm endpoint is UP, genuinely has no match for him

describe('parsePixmResponse — error vs. not-found (KNOWN GAP, not yet fixed)', () => {
  it('a genuine "no match" (200, empty Parameters) => not-found (correct today)', () => {
    const body = { resourceType: 'Parameters', parameter: [] };
    const r = parsePixmResponse(200, body, ENTERPRISE_SYSTEM);
    expect(r.status).toBe('not-found');
    expect(r.enterpriseId).toBe('');
    // Scenario grounding: this is James's real MRN — he truly has no Connect360 record yet.
    void JAMES_MRN;
  });

  it('KNOWN GAP: a PIXm server error (500) is mapped to "ambiguous", not a distinct error state', () => {
    const body = {
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'exception' }],
    };
    const r = parsePixmResponse(500, body, ENTERPRISE_SYSTEM);
    // This is the defect: a 500 (PIXm endpoint down/misconfigured while resolving
    // Dorothy's MRN) reads as 'ambiguous' — the SAME bucket a genuinely ambiguous
    // multi-match reads as — not as a distinct, loud "the resolver itself failed."
    expect(r.status).toBe('ambiguous');
    void DOROTHY_MRN;
  });

  it('KNOWN GAP: an OperationOutcome error body on a 200 is ALSO mapped to "ambiguous"', () => {
    // Some FHIR servers return 200 with an OperationOutcome payload instead of
    // a proper HTTP error code — parsePixmResponse checks resourceType for this,
    // which is good practice, but the result still lands in the same 'ambiguous'
    // bucket as the 500 case above and as a real multi-match, not a distinct one.
    const body = {
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'timeout' }],
    };
    const r = parsePixmResponse(200, body, ENTERPRISE_SYSTEM);
    expect(r.status).toBe('ambiguous');
  });

  it("KNOWN GAP: /api/empi/mrn-to-uuid's collapsing logic cannot tell these apart", () => {
    // Replicates the exact caller-side check in
    // src/app/api/empi/mrn-to-uuid/route.ts (`if (response.status !== 'resolved'
    // || !response.enterpriseId) return 404`) inline, since that route file
    // cannot be imported directly in this session (see file-note above) — the
    // logic itself is a one-line, verifiable copy, not a reimplementation.
    const routeCollapses404 = (status: string) => status !== 'resolved';

    const serverError = parsePixmResponse(
      500,
      { resourceType: 'OperationOutcome' },
      ENTERPRISE_SYSTEM
    );
    const genuineNotFound = parsePixmResponse(
      200,
      { resourceType: 'Parameters', parameter: [] },
      ENTERPRISE_SYSTEM
    );

    // Both a real outage AND a genuine no-match currently produce the identical
    // caller-visible outcome (404 "EMPI not-found") — this is the gap.
    expect(routeCollapses404(serverError.status)).toBe(true);
    expect(routeCollapses404(genuineNotFound.status)).toBe(true);
    expect(serverError.status).not.toBe(genuineNotFound.status); // 'ambiguous' vs 'not-found' internally...
    // ...but the route's own condition (above) can't see that distinction, which
    // is exactly why resolvePatientId.ts's caller then silently falls through to
    // the direct-FHIR-identifier-search fallback (5b) on a real PIXm outage,
    // instead of surfacing "identity service is down."
  });

  it('a genuine multi-match (2+ enterprise identifiers) also => ambiguous (correct today, but same bucket as errors)', () => {
    const body = {
      resourceType: 'Parameters',
      parameter: [
        {
          name: 'targetIdentifier',
          valueIdentifier: { system: ENTERPRISE_SYSTEM, value: 'uuid-a' },
        },
        {
          name: 'targetIdentifier',
          valueIdentifier: { system: ENTERPRISE_SYSTEM, value: 'uuid-b' },
        },
      ],
    };
    const r = parsePixmResponse(200, body, ENTERPRISE_SYSTEM);
    expect(r.status).toBe('ambiguous');
  });

  it('a clean resolved match is unaffected by this gap (control case)', () => {
    const body = {
      resourceType: 'Parameters',
      parameter: [
        {
          name: 'targetIdentifier',
          valueIdentifier: {
            system: ENTERPRISE_SYSTEM,
            value: '5bc9fe31-5ffe-4c6b-a896-8ef63e4a4acb',
          },
        },
      ],
    };
    const r = parsePixmResponse(200, body, ENTERPRISE_SYSTEM);
    expect(r.status).toBe('resolved');
    expect(r.enterpriseId).toBe('5bc9fe31-5ffe-4c6b-a896-8ef63e4a4acb');
  });
});
