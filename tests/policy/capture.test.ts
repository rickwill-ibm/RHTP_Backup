/**
 * S1 CaptureProvider tests: the builtin loader produces a CanonicalDoc, HTML is reduced to
 * canonical text, an anchor minted from a loaded doc round-trips through the S0 spine, and the
 * vendor seams select but stay unwired until configured.
 */
import { describe, it, expect } from 'vitest';
import {
  builtinCapture,
  selectCaptureProvider,
  htmlToCanonicalText,
  BUILTIN_LOADER_VERSION,
  type RawDoc,
} from '@/lib/policy/loader/capture';
import { makeSpan, verifyAnchor, type CanonicalRef } from '@/lib/policy/anchor/verify';

function raw(text: string, mime = 'text/plain'): RawDoc {
  return {
    docId: 'd1',
    sourceFile: 'policy.txt',
    bytes: new TextEncoder().encode(text),
    mime,
    provenanceClass: 'authoritative',
  };
}

describe('builtin capture', () => {
  it('loads plain text into a CanonicalDoc with a source-byte hash and loader version', async () => {
    const doc = await builtinCapture.load(raw('Bariatric surgery covered when BMI >= 40.'));
    expect(doc.text).toBe('Bariatric surgery covered when BMI >= 40.');
    expect(doc.loaderVersion).toBe(BUILTIN_LOADER_VERSION);
    expect(doc.sourceContentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('reduces HTML to canonical text', () => {
    const t = htmlToCanonicalText('<div><b>PA</b> required for <i>CPT 43775</i></div>');
    expect(t).toBe('PA required for CPT 43775');
  });

  it('ROUND-TRIP: an anchor minted from a loaded doc verifies through the S0 spine', async () => {
    const doc = await builtinCapture.load(raw('Bariatric surgery covered when BMI >= 40.'));
    const start = doc.text.indexOf('BMI >= 40');
    const span = makeSpan(doc as CanonicalRef, start, start + 'BMI >= 40'.length);
    const verdict = verifyAnchor(
      { anchorId: 'a1', provenanceClass: 'authoritative', spans: [span] },
      [doc as CanonicalRef]
    );
    expect(verdict.ok).toBe(true);
  });

  it('round-trips against HTML-derived canonical text too', async () => {
    const doc = await builtinCapture.load(raw('<p>PA required for CPT 43775</p>', 'text/html'));
    const start = doc.text.indexOf('CPT 43775');
    const span = makeSpan(doc as CanonicalRef, start, start + 'CPT 43775'.length);
    expect(
      verifyAnchor({ anchorId: 'a', provenanceClass: 'authoritative', spans: [span] }, [
        doc as CanonicalRef,
      ]).ok
    ).toBe(true);
  });
});

describe('provider selection', () => {
  it('defaults to the mandatory builtin', () => {
    expect(selectCaptureProvider({ provider: 'builtin' }).name).toBe('builtin');
  });

  it('selects a vendor seam that stays unwired until configured', async () => {
    const p = selectCaptureProvider({ provider: 'watsonx' });
    expect(p.name).toBe('watsonx');
    await expect(p.load(raw('x'))).rejects.toThrow(/not yet wired/);
  });
});
