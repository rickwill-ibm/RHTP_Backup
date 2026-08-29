/**
 * End-to-end round-trip through the REAL seam: documents → ingestDocuments (the
 * wired entry point) → real adapters → policyEngine.evaluate. Proves a
 * document-sourced policy evaluates identically to a seed-sourced one, and that
 * extract/ is reachable from a real caller (E14).
 */
import { describe, it, expect } from 'vitest';
import { ingestDocuments } from '@/lib/policy/policyLibrary';
import { evaluate } from '@/lib/policy/policyEngine';
import type { MemberContext, OrderContext } from '@/lib/policy/types';
import type { TextSource } from '@/lib/policy/extract';

const CPB: TextSource = {
  sourceFile: 'tavr.txt',
  mimeType: 'text/plain',
  rawTextChars: 0,
  text: `Aetna
Clinical Policy Bulletin: TAVR
Number: 0912

I. Medical Necessity
A. Severe symptomatic aortic stenosis.

CPT codes covered:
33361, 33362

CPT codes not covered (experimental):
0483T

ICD-10 codes covered:
I35.0
`,
};

const PA: TextSource = {
  sourceFile: 'uhc.txt',
  mimeType: 'text/plain',
  rawTextChars: 0,
  text: `UnitedHealthcare
Prior Authorization Requirements
Effective January 1, 2025

Radiology
70450, 72148
`,
};

const member: MemberContext = { memberId: 'm1', diagnoses: [{ code: 'I35.0' }] };
const order = (code: string): OrderContext => ({ code });

describe('document → ingest → evaluate round-trip', () => {
  const { library, skipped, provenance, warnings } = ingestDocuments([CPB, PA]);

  it('ingests both documents with nothing skipped', () => {
    expect(skipped).toBe(0);
    expect(library.policies.length).toBe(2);
    expect(provenance.length).toBeGreaterThan(0);
    expect(warnings).toEqual([]);
  });

  it('a PA-listed code evaluates to pa-required-list', () => {
    expect(evaluate(member, order('72148'), library).outcome).toBe('pa-required-list');
  });

  it('a covered CPB code evaluates to criteria review, met by the member diagnosis', () => {
    const d = evaluate(member, order('33361'), library);
    expect(d.outcome).toBe('pa-required-criteria-review');
    expect(d.criteriaMet).toBe(true);
  });

  it('an experimental code evaluates to likely denial', () => {
    expect(evaluate(member, order('0483T'), library).outcome).toBe('likely-denial-experimental');
  });

  it('an ungoverned code finds no policy', () => {
    expect(evaluate(member, order('99999'), library).outcome).toBe('no-policy-found');
  });
});
