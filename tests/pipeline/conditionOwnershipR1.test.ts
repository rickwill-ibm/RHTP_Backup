// R1 adversarial ownership test (red-team requirement): the conditions vs
// behavioral-health adapters must partition every Condition into EXACTLY ONE owner
// with ZERO silent drops — regardless of coding-array order or dual-coding. This
// test exercises the branches the existing fixtures never touch (SNOMED-first F,
// secondary F, non-ICD F, coding-less), which is where the pre-fix code leaked.
import { describe, it, expect } from 'vitest';
import { conditionsAdapter, behavioralHealthAdapter, defaultPipelineDeps } from '@/lib/pipeline';

const deps = defaultPipelineDeps({ now: () => 1_700_000_000_000 });
const ICD = 'http://hl7.org/fhir/sid/icd-10-cm';
const SCT = 'http://snomed.info/sct';

const cond = (
  id: string,
  coding: Array<{ system: string; code: string; display?: string }>,
  extra: Record<string, unknown> = {}
) => ({
  resource: {
    resourceType: 'Condition',
    id,
    subject: { reference: 'urn:uuid:pat-1' },
    clinicalStatus: {
      coding: [
        { system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' },
      ],
    },
    code: coding.length ? { coding } : undefined,
    ...extra,
  },
});

const BUNDLE = JSON.stringify({
  resourceType: 'Bundle',
  type: 'collection',
  entry: [
    // 1. SNOMED-first, ICD-10 F-code SECOND, in a federally-assisted OTP — the pre-fix
    //    silent-drop leak; with the fix the Part 2 basis runs on F10.20 → restricted.
    cond(
      'c-snomed-first-f',
      [
        { system: SCT, code: '7200002', display: 'Alcohol dependence' },
        { system: ICD, code: 'F10.20' },
      ],
      { programContext: { facilityType: 'opioid-treatment-program', federallyAssisted: true } }
    ),
    // 2. non-F ICD primary + F ICD secondary — dual diagnosis, SUD content present.
    cond('c-e11-plus-f', [
      { system: ICD, code: 'E11.9' },
      { system: ICD, code: 'F10.20' },
    ]),
    // 3. plain non-F ICD condition -> conditions adapter.
    cond('c-plain-nonf', [{ system: ICD, code: 'E11.9', display: 'Type 2 diabetes' }]),
    // 4. plain F condition (mood, non-SUD BH) -> behavioral-health adapter.
    cond('c-plain-f', [{ system: ICD, code: 'F32.1', display: 'Major depressive disorder' }]),
    // 5. coding-less -> kept by BOTH, quarantined by BOTH, projected by NEITHER.
    cond('c-codingless', []),
  ],
});

const ownedBy = (adapter: typeof conditionsAdapter) =>
  new Set(adapter.parse(BUNDLE).map((r) => r.sourceRef));

describe('R1 — Condition ownership is exactly-one-owner, order-independent, no silent drops', () => {
  const cOwned = ownedBy(conditionsAdapter);
  const bhOwned = ownedBy(behavioralHealthAdapter);

  it('SNOMED-first + secondary F-code is owned ONLY by behavioral-health (was silently dropped pre-fix)', () => {
    expect(bhOwned.has('c-snomed-first-f')).toBe(true);
    expect(cOwned.has('c-snomed-first-f')).toBe(false);
  });

  it('non-F primary + secondary F-code (dual dx) is owned by behavioral-health, not conditions', () => {
    expect(bhOwned.has('c-e11-plus-f')).toBe(true);
    expect(cOwned.has('c-e11-plus-f')).toBe(false);
  });

  it('plain non-F condition is owned ONLY by conditions', () => {
    expect(cOwned.has('c-plain-nonf')).toBe(true);
    expect(bhOwned.has('c-plain-nonf')).toBe(false);
  });

  it('plain F condition is owned ONLY by behavioral-health', () => {
    expect(bhOwned.has('c-plain-f')).toBe(true);
    expect(cOwned.has('c-plain-f')).toBe(false);
  });

  it('coding-less condition is kept by BOTH (quarantined by both) and owned-for-projection by neither', () => {
    // both keep it so the missing-code guarantee fires; both validate() reject it.
    expect(cOwned.has('c-codingless')).toBe(true);
    expect(bhOwned.has('c-codingless')).toBe(true);
    const cRaw = conditionsAdapter.parse(BUNDLE).find((r) => r.sourceRef === 'c-codingless')!;
    const bhRaw = behavioralHealthAdapter
      .parse(BUNDLE)
      .find((r) => r.sourceRef === 'c-codingless')!;
    expect(conditionsAdapter.validate(cRaw).ok).toBe(false);
    expect(behavioralHealthAdapter.validate(bhRaw).ok).toBe(false);
  });

  it('NO coded Condition is double-owned (partition is exact)', () => {
    const coded = ['c-snomed-first-f', 'c-e11-plus-f', 'c-plain-nonf', 'c-plain-f'];
    for (const id of coded) {
      const inC = cOwned.has(id),
        inBh = bhOwned.has(id);
      expect(
        inC !== inBh,
        `${id} must have exactly one owner (conditions=${inC}, bh=${inBh})`
      ).toBe(true);
    }
  });

  it('NO coded Condition is silently dropped (every coded id has an owner)', () => {
    for (const id of ['c-snomed-first-f', 'c-e11-plus-f', 'c-plain-nonf', 'c-plain-f']) {
      expect(cOwned.has(id) || bhOwned.has(id), `${id} was dropped by BOTH adapters`).toBe(true);
    }
  });

  it('SNOMED-first SUD condition runs the Part 2 basis on the F-code (not coding[0]) → restricted, not disclosed', () => {
    const raw = behavioralHealthAdapter
      .parse(BUNDLE)
      .find((r) => r.sourceRef === 'c-snomed-first-f')!;
    expect(behavioralHealthAdapter.validate(raw).ok).toBe(true); // F-code present via by-system resolution
    const rec = behavioralHealthAdapter.normalize(raw, deps);
    // The Part 2 signal at normalize is the `part2-sud` segmentation hint (the transform
    // turns it into the durable 42-CFR-Part-2 label). It is set ONLY when the two-factor
    // basis holds — here OTP + federally-assisted + F10.20. This is the discriminator: if
    // the basis had (pre-fix) run on coding[0] = SNOMED, isSudDiagnosis would be false → no
    // hint → the SUD fact would project as a disclosable ordinary condition.
    expect(rec.payload.segmentationHints as string[] | undefined).toContain('part2-sud');
  });

  it('H1: dual-dx with a NON-SUD F-code FIRST and a SUD F-code SECOND is still restricted (basis over any coding)', () => {
    const dual = JSON.stringify({
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        {
          resource: {
            resourceType: 'Condition',
            id: 'c-dual',
            subject: { reference: 'urn:uuid:pat-1' },
            clinicalStatus: {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
                  code: 'active',
                },
              ],
            },
            code: {
              coding: [
                { system: ICD, code: 'F33.1', display: 'Recurrent depression' },
                { system: ICD, code: 'F11.20', display: 'Opioid dependence' },
              ],
            },
            programContext: { facilityType: 'opioid-treatment-program', federallyAssisted: true },
          },
        },
      ],
    });
    const raw = behavioralHealthAdapter.parse(dual).find((r) => r.sourceRef === 'c-dual')!;
    expect(raw).toBeTruthy(); // owned by BH (has an F-code)
    const rec = behavioralHealthAdapter.normalize(raw, deps);
    // The SUD F11.20 sits SECOND; pre-H1 the basis ran on the first F-code (F33.1, non-SUD)
    // → part2 false → disclosed. The fix evaluates the basis over the SUD coding in any position.
    expect(rec.payload.segmentationHints as string[] | undefined).toContain('part2-sud');
  });
});
