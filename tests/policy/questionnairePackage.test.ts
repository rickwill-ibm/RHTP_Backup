/**
 * DTR Questionnaire Package generator — structure, reuse of the existing questionnaire generator,
 * value-set derivation, CQL library packaging, DTR bundle invariants, and FHIR conformance.
 * Includes the adversarial cases surfaced by red-team review (invalid names, non-ASCII CQL,
 * phantom-code harvesting, role filtering, weak validation, empty ids).
 */
import { describe, it, expect } from 'vitest';
import { extractCriteriaPolicy, criteriaToNormalized } from '@/lib/policy/extract/criteria';
import { generateQuestionnaireFromPolicy } from '@/lib/goldenThread/dtrFromPolicy';
import type { TextSource } from '@/lib/policy/extract/types';
import {
  buildQuestionnairePackage,
  isValidQuestionnairePackage,
  base64Utf8,
  type CodedProcedure,
  type DtrQuestionnairePackage,
} from '@/lib/policy/dtr/questionnairePackage';
import type { FhirLibrary, FhirQuestionnaire, FhirResource, FhirValueSet } from '@/lib/fhir/types';

const src = (text: string): TextSource => ({
  sourceFile: 'x.txt',
  mimeType: 'text/plain',
  text,
  rawTextChars: text.length,
});

const CRITERIA_TEXT =
  'Bariatric Surgery\n' +
  'II. Bariatric surgery is considered medically necessary when ALL of the following are met:\n' +
  'A. The procedure is one of the following types:\n' +
  '1. Laparoscopic sleeve gastrectomy\n' +
  'B. The member is at least 18 years of age\n' +
  'Coding\n' +
  'CPT\n' +
  '43775\n' +
  '43644\n' +
  'HCPCS\n' +
  'S2083\n';

function extract() {
  const cp = extractCriteriaPolicy(src(CRITERIA_TEXT));
  const policy = criteriaToNormalized(cp);
  const procedures: CodedProcedure[] = cp.codes.map((c) => ({
    code: c.code,
    codeSystem: c.codeSystem,
    display: c.description || undefined,
  }));
  return { cp, policy, procedures };
}

const resources = (pkg: DtrQuestionnairePackage): FhirResource[] =>
  (pkg.entry ?? []).flatMap((e) => (e.resource ? [e.resource] : []));
const entryTypes = (pkg: DtrQuestionnairePackage): string[] =>
  resources(pkg).map((r) => r.resourceType);
function firstOfType<T extends FhirResource>(pkg: DtrQuestionnairePackage, t: string): T {
  const r = resources(pkg).find((x) => x.resourceType === t);
  expect(r, `expected a ${t} in the package`).toBeDefined();
  return r as T;
}
const vsCodes = (vs: FhirValueSet): string[] =>
  (vs.compose?.include ?? []).flatMap((i) => (i.concept ?? []).map((c) => c.code));

const FHIR_NAME = /^[A-Z]([A-Za-z0-9_]){1,254}$/;

describe('base64Utf8', () => {
  it('is byte-exact with Node base64 for ASCII AND non-ASCII (round-trips)', () => {
    const cases = [
      '',
      'a',
      'ab',
      'abc',
      'hello world',
      'define "X": 1 > 0\n',
      'BMI ≥ 40', // ≥
      'smart “quote”',
      'em—dash',
      'café',
      'x'.repeat(3001),
    ];
    for (const s of cases) {
      expect(base64Utf8(s)).toBe(Buffer.from(s, 'utf-8').toString('base64'));
      expect(Buffer.from(base64Utf8(s), 'base64').toString('utf-8')).toBe(s);
    }
  });
});

describe('harvestCodes robustness (adversarial)', () => {
  it('harvests the bare code list and tags codes explicit', () => {
    const { cp } = extract();
    expect(cp.codes.map((c) => `${c.codeSystem}:${c.code}`).sort()).toEqual([
      'CPT:43644',
      'CPT:43775',
      'HCPCS:S2083',
    ]);
    expect(cp.codes.every((c) => c.confidence === 'explicit')).toBe(true);
  });

  it('does NOT fabricate a code from a criteria line starting with a 5-digit number', () => {
    const cp = extractCriteriaPolicy(
      src(
        'Subject: P\nI. Medical Necessity\nmedically necessary when all of the following:\n' +
          'A. Body mass index of at least 40 documented.\n50000 units of therapy were tried.'
      )
    );
    expect(cp.codes).toEqual([]);
  });

  it('ignores stray 5-digit numbers embedded mid-prose', () => {
    const cp = extractCriteriaPolicy(
      src(
        'Subject: P\nI. Medical Necessity\nmedically necessary when all of the following:\n' +
          'A. BMI over 40000 documented.\nB. Seen in 12000 cases costing $43,999.'
      )
    );
    expect(cp.codes).toEqual([]);
  });

  it('does not harvest a bare 5-digit number under an HCPCS header as HCPCS', () => {
    // A 5-digit code is CPT by format regardless of header; a numeric "HCPCS" code is never valid.
    const cp = extractCriteriaPolicy(src('Subject: M\nCoding\nHCPCS\n43775\nS2083\n'));
    const hcpcs = cp.codes.filter((c) => c.codeSystem === 'HCPCS').map((c) => c.code);
    expect(hcpcs).toEqual(['S2083']);
    expect(cp.codes.find((c) => c.code === '43775')?.codeSystem).toBe('CPT');
  });

  it('does not harvest ICD codes (dotted or dotless) under an ICD header', () => {
    const cp = extractCriteriaPolicy(
      src(
        'Subject: Obesity\nApplicable ICD-10 Codes\nICD\nE66.01 Morbid obesity\nZ68.41 BMI 40\nE6601 dotless'
      )
    );
    expect(cp.codes).toEqual([]);
  });

  it('assigns system by format under a combined CPT/HCPCS header', () => {
    const cp = extractCriteriaPolicy(
      src('Subject: M\nCoding\nCPT/HCPCS\n43775 sleeve\nS2083 adj\n93000 ekg\nJ1885 inj')
    );
    expect(cp.codes.map((c) => [c.code, c.codeSystem])).toEqual([
      ['43775', 'CPT'],
      ['S2083', 'HCPCS'],
      ['93000', 'CPT'],
      ['J1885', 'HCPCS'],
    ]);
  });
});

describe('empty / punctuation-title policy id (adversarial)', () => {
  it('never produces an empty policyId or a trailing-colon canonical', () => {
    const np = criteriaToNormalized(
      extractCriteriaPolicy(
        src(
          '!!! @#$\nI. Medical Necessity\nmedically necessary when all of the following:\nA. Adult.'
        )
      )
    );
    expect(np.policyId).not.toBe('');
    const gen = generateQuestionnaireFromPolicy(np);
    expect(gen.url.endsWith(':')).toBe(false);
    expect(gen.derivedFrom.policyId).not.toBe('');
  });
});

describe('buildQuestionnairePackage', () => {
  it('produces a valid DTR collection bundle whose first entry is a Questionnaire', () => {
    const { policy, procedures } = extract();
    const pkg = buildQuestionnairePackage({ policy, procedures });
    expect(pkg.resourceType).toBe('Bundle');
    expect(pkg.type).toBe('collection');
    expect(pkg.meta?.profile?.[0]).toContain('dtr-qpackage-bundle');
    expect(entryTypes(pkg)[0]).toBe('Questionnaire');
    expect(isValidQuestionnairePackage(pkg)).toBe(true);
  });

  it('emits FHIR-valid resource names (letter-initial) for every named resource', () => {
    const { policy } = extract();
    // a digit-starting title is the hostile case
    const pkg = buildQuestionnairePackage({
      policy: { ...policy, title: '022 Bariatric' },
      procedures: [{ code: '43775', codeSystem: 'CPT', role: 'covered' }],
      cql: { name: '2024 Bariatric Logic', text: 'define "X": true' },
      diagnosisValueSets: [
        { id: 'dx-bmi-40', title: 'BMI', concepts: [{ system: 's', code: 'Z68.41' }] },
      ],
    });
    const q = firstOfType<FhirQuestionnaire>(pkg, 'Questionnaire');
    const lib = firstOfType<FhirLibrary>(pkg, 'Library');
    for (const r of resources(pkg)) {
      const name = (r as { name?: string }).name;
      if (name !== undefined) expect(name, `${r.resourceType}.name="${name}"`).toMatch(FHIR_NAME);
    }
    expect(q.name).toMatch(FHIR_NAME);
    expect(lib.name).toMatch(FHIR_NAME);
  });

  it('reuses the existing generator for items (indications + supporting-dx + clinical-doc)', () => {
    const { policy, procedures } = extract();
    const q = firstOfType<FhirQuestionnaire>(
      buildQuestionnairePackage({ policy, procedures }),
      'Questionnaire'
    );
    const linkIds = (q.item ?? []).map((i) => i.linkId);
    expect(linkIds).toContain('supporting-diagnosis');
    expect(linkIds).toContain('clinical-documentation');
    expect(linkIds.some((l) => l.startsWith('indication-'))).toBe(true);
    expect(q.status).toBe('draft');
    expect(q.subjectType).toEqual(['Patient']);
  });

  it('Questionnaire.code excludes not-covered/investigational and de-dups (roles present)', () => {
    const { policy } = extract();
    const procedures: CodedProcedure[] = [
      { code: '43775', codeSystem: 'CPT', role: 'covered' },
      { code: '43775', codeSystem: 'CPT', role: 'covered' }, // dup
      { code: '43842', codeSystem: 'CPT', role: 'not-covered' },
      { code: '43848', codeSystem: 'CPT', role: 'revision' },
      { code: '43290', codeSystem: 'CPT', role: 'investigational' },
    ];
    const pkg = buildQuestionnairePackage({ policy, procedures });
    const q = firstOfType<FhirQuestionnaire>(pkg, 'Questionnaire');
    expect((q.code ?? []).map((c) => c.code).sort()).toEqual(['43775', '43848']);
    const vs = firstOfType<FhirValueSet>(pkg, 'ValueSet');
    expect(vsCodes(vs).sort()).toEqual(['43775', '43848']);
    expect(vs.title).toBe('Covered procedures');
  });

  it('without roles, includes all referenced procedures (pending review), and omits empty code', () => {
    const { policy, procedures } = extract();
    const q = firstOfType<FhirQuestionnaire>(
      buildQuestionnairePackage({ policy, procedures }),
      'Questionnaire'
    );
    expect((q.code ?? []).map((c) => c.code).sort()).toEqual(['43644', '43775', 'S2083']);
    const noProc = firstOfType<FhirQuestionnaire>(
      buildQuestionnairePackage({ policy }),
      'Questionnaire'
    );
    expect(noProc.code).toBeUndefined(); // omitted, not []
  });

  it('uses the US-realm canonical HCPCS system', () => {
    const { policy } = extract();
    const q = firstOfType<FhirQuestionnaire>(
      buildQuestionnairePackage({
        policy,
        procedures: [{ code: 'S2083', codeSystem: 'HCPCS', role: 'covered' }],
      }),
      'Questionnaire'
    );
    expect(q.code?.[0]?.system).toBe('urn:oid:2.16.840.1.113883.6.285');
  });

  it('packages a CQL Library (non-ASCII safe) and references it via cqf-library', () => {
    const { policy, procedures } = extract();
    const cql = { name: 'BariatricLogic', text: 'define "MeetsBMI": BMI ≥ 40 // café' };
    const pkg = buildQuestionnairePackage({ policy, procedures, cql });
    const q = firstOfType<FhirQuestionnaire>(pkg, 'Questionnaire');
    expect(
      (q.extension ?? []).find((e) => e.url.includes('cqf-library'))?.valueCanonical
    ).toContain('Library/bariatriclogic');
    const lib = firstOfType<FhirLibrary>(pkg, 'Library');
    expect(lib.content?.[0]?.contentType).toBe('text/cql');
    expect(Buffer.from(lib.content?.[0]?.data ?? '', 'base64').toString('utf-8')).toBe(cql.text);
    expect(entryTypes(pkg)).toEqual(['Questionnaire', 'Library', 'ValueSet']);
  });

  it('de-dups diagnosis value sets by id', () => {
    const { policy } = extract();
    const pkg = buildQuestionnairePackage({
      policy,
      diagnosisValueSets: [
        { id: 'dx-bmi-40', title: 'BMI >= 40', concepts: [{ system: 'icd10', code: 'Z68.41' }] },
        { id: 'dx-bmi-40', title: 'dup', concepts: [{ system: 'icd10', code: 'Z68.42' }] },
      ],
    });
    const vsEntries = resources(pkg).filter((r) => (r as FhirValueSet).id === 'dx-bmi-40');
    expect(vsEntries).toHaveLength(1);
    expect(vsCodes(vsEntries[0] as FhirValueSet)).toEqual(['Z68.41']);
  });

  it('is valid with no procedures and no CQL (Questionnaire-only package)', () => {
    const { policy } = extract();
    const pkg = buildQuestionnairePackage({ policy });
    expect(entryTypes(pkg)).toEqual(['Questionnaire']);
    expect(isValidQuestionnairePackage(pkg)).toBe(true);
  });

  it('rejects malformed bundles incl. multiple Questionnaires', () => {
    expect(
      isValidQuestionnairePackage({ resourceType: 'Bundle', type: 'searchset', entry: [] })
    ).toBe(false);
    expect(
      isValidQuestionnairePackage({
        resourceType: 'Bundle',
        type: 'collection',
        entry: [{ resource: { resourceType: 'ValueSet' } }],
      })
    ).toBe(false);
    expect(
      isValidQuestionnairePackage({
        resourceType: 'Bundle',
        type: 'collection',
        entry: [
          { resource: { resourceType: 'Questionnaire' } },
          { resource: { resourceType: 'Questionnaire' } },
        ],
      })
    ).toBe(false);
  });
});
