/**
 * DTR patient evaluation reads a real FHIR bundle: age from Patient.birthDate, BMI from the latest
 * LOINC 39156-5 Observation, comorbidity from an active Condition — with provenance — and documentation
 * criteria stay gaps. The bariatric fixture qualifies on the computable criteria against the sample
 * patient, proving the endpoint evaluates the policy against real data (not the lumbar-MRI literal).
 */
import { describe, it, expect } from 'vitest';
import {
  ageInYears,
  findCondition,
  getPatient,
  latestObservation,
  bariatricPatientBundle,
  type PatientBundle,
} from '@/lib/policy/dtr/evaluate/patientData';
import { evaluateDtr, type DtrCriteria } from '@/lib/policy/dtr/evaluate/patientEvaluation';
import { getDtrCriteriaForCpt, policyById } from '@/lib/policy/dtr/evaluate/policyRegistry';

// CG-SURG-83 code set + a live-criteria getter, derived directly from the registry (the generic
// live-DTR path). These previously came from a bariatricCriteria compat shim that no production code
// reached; it was removed (E14 wired-path) and the two symbols inlined here from the registry row.
const BARIATRIC_CPT_CODES: ReadonlySet<string> = new Set(policyById('CG-SURG-83').cptCodes);
const getBariatricDtrCriteria = async (cptCode: string): Promise<DtrCriteria> => {
  const criteria = await getDtrCriteriaForCpt(cptCode);
  if (!criteria) throw new Error(`Not a registered CG-SURG-83 CPT/HCPCS code: ${cptCode}`);
  return criteria;
};

// Bariatric gastric-bypass CPT — the same code the retired hand-typed fixture used to hard-code.
// getBariatricDtrCriteria() derives criteria LIVE from the real CG-SURG-83 policy PDF (see
// bariatricCriteria.ts), so these tests must await it instead of importing a static constant.
const BARIATRIC_CPT = '43644';

const ASOF = new Date('2026-08-30');

describe('patient FHIR helpers', () => {
  it('computes whole-year age from birthDate', () => {
    expect(ageInYears('1982-04-17', ASOF)).toBe(44);
    expect(ageInYears('2009-10-01', ASOF)).toBe(16); // birthday not yet reached in 2026
    expect(ageInYears('not-a-date', ASOF)).toBeNull();
  });
  it('reads the most-recent final BMI Observation', () => {
    const bmi = latestObservation(bariatricPatientBundle, '39156-5');
    expect(bmi?.value).toBe(42.3);
    expect(bmi?.date).toBe('2026-02-28');
  });
  it('finds an active comorbidity Condition by code', () => {
    expect(findCondition(bariatricPatientBundle, ['E11.9'])?.coding.code).toBe('E11.9');
    expect(findCondition(bariatricPatientBundle, ['Z00.0'])).toBeNull();
    expect(getPatient(bariatricPatientBundle)?.id).toBe('MARIA_SD_001');
  });
});

describe('evaluateDtr — computable status from the record, documentation stays a gap', () => {
  it('bariatric criteria qualify against the sample patient (age, BMI, comorbidity all met)', async () => {
    const criteria = await getBariatricDtrCriteria(BARIATRIC_CPT);
    const evaln = evaluateDtr(criteria, bariatricPatientBundle, ASOF);
    const g = (t: RegExp) => evaln.groups.find((x) => t.test(x.title));
    expect(g(/age/i)?.status).toBe('met');
    expect(g(/BMI/i)?.status).toBe('met');
    expect(g(/Obesity-related comorbidity/i)?.status).toBe('met');
    expect(evaln.patientId).toBe('MARIA_SD_001');
    // evidence is sourced from the record, with provenance
    expect(g(/BMI/i)?.leaf?.evidence).toContain('42.3');
    expect(g(/BMI/i)?.leaf?.recordedDate).toBe('2026-02-28');
    // documentation criteria are never auto-satisfied from coded data — every one of the policy's
    // real documentation requirements (live-derived, not a hand-typed subset) surfaces as a gap the
    // provider must attest, so allMet is honestly false despite every computable group being met.
    const gapTitles = evaln.groups.filter((x) => x.status === 'gap').map((x) => x.title);
    expect(gapTitles).toEqual(criteria.documentation.map((d) => d.title));
    expect(criteria.documentation.length).toBeGreaterThan(0);
    expect(evaln.allMet).toBe(false);
  });

  it('BMI 35–40 qualifies ONLY with a comorbidity (the band rule), else it is a gap', async () => {
    const bundle35: PatientBundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        { resource: { resourceType: 'Patient', id: 'P', birthDate: '1980-01-01' } },
        {
          resource: {
            resourceType: 'Observation',
            status: 'final',
            code: { coding: [{ system: 'http://loinc.org', code: '39156-5' }] },
            valueQuantity: { value: 37 },
            effectiveDateTime: '2026-01-01',
          },
        },
      ],
    };
    const crit: DtrCriteria = { ...(await getBariatricDtrCriteria(BARIATRIC_CPT)), documentation: [] };
    // no comorbidity Condition in the bundle → 37 is below 40 and the band needs a comorbidity → gap
    const noComorbid = evaluateDtr(crit, bundle35, ASOF);
    expect(noComorbid.groups.find((g) => /BMI/i.test(g.title))?.status).toBe('gap');
    // add the comorbidity → the 35–40 band now qualifies → met
    const withComorbid: PatientBundle = {
      ...bundle35,
      entry: [
        ...bundle35.entry,
        {
          resource: {
            resourceType: 'Condition',
            code: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'E11.9' }] },
            clinicalStatus: 'active',
          },
        },
      ],
    };
    expect(
      evaluateDtr(crit, withComorbid, ASOF).groups.find((g) => /BMI/i.test(g.title))?.status
    ).toBe('met');
  });

  it('a BMI ≥ 40 patient does NOT need a comorbidity — the comorbidity group is not required', async () => {
    const bmi45NoComorbid: PatientBundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        { resource: { resourceType: 'Patient', id: 'P45', birthDate: '1975-01-01' } },
        {
          resource: {
            resourceType: 'Observation',
            status: 'final',
            code: { coding: [{ system: 'http://loinc.org', code: '39156-5' }] },
            valueQuantity: { value: 45 },
            effectiveDateTime: '2026-01-01',
          },
        },
      ],
    };
    const evaln = evaluateDtr(
      { ...(await getBariatricDtrCriteria(BARIATRIC_CPT)), documentation: [] },
      bmi45NoComorbid,
      ASOF
    );
    expect(evaln.groups.find((g) => /BMI/i.test(g.title))?.status).toBe('met');
    const comorbid = evaln.groups.find((g) => /Obesity-related comorbidity/i.test(g.title));
    expect(comorbid?.status).toBe('gap'); // no diabetes coded
    expect(comorbid?.required).toBe(false); // but NOT required — BMI ≥ 40 qualifies alone
    // so the patient is fully qualified on the computable criteria despite the missing comorbidity
    expect(evaln.allMet).toBe(true);
  });

  it('an inactive comorbidity does not count, a relapse one does', () => {
    const mk = (status: string): PatientBundle => ({
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        {
          resource: {
            resourceType: 'Condition',
            code: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'E11.9' }] },
            clinicalStatus: status as never,
          },
        },
      ],
    });
    expect(findCondition(mk('resolved'), ['E11.9'])).toBeNull();
    expect(findCondition(mk('relapse'), ['E11.9'])?.coding.code).toBe('E11.9');
  });

  it('age below the minimum is a gap; a missing Observation is a gap (never invented)', async () => {
    const young: PatientBundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [{ resource: { resourceType: 'Patient', id: 'Y', birthDate: '2015-01-01' } }],
    };
    const evaln = evaluateDtr({ ...(await getBariatricDtrCriteria(BARIATRIC_CPT)), documentation: [] }, young, ASOF);
    expect(evaln.groups.find((g) => /age/i.test(g.title))?.status).toBe('gap');
    expect(evaln.groups.find((g) => /BMI/i.test(g.title))?.status).toBe('gap'); // no Observation → gap
    expect(evaln.groups.find((g) => /BMI/i.test(g.title))?.leaf).toBeUndefined();
  });

  it('the bariatric CPT set routes gastric-bypass/sleeve codes to this evaluation', () => {
    expect(BARIATRIC_CPT_CODES.has('43644')).toBe(true);
    expect(BARIATRIC_CPT_CODES.has('43775')).toBe(true);
    expect(BARIATRIC_CPT_CODES.has('72148')).toBe(false); // lumbar MRI is NOT bariatric
  });
});
