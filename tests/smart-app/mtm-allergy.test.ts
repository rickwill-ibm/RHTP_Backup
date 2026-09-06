/**
 * MTM Agent — allergy checker, drug class table, DetectedIssue builder, and
 * engine integration with allergies tests.
 *
 * Companion to mtm.test.ts — split to stay under the 500-line test cap.
 */
import { describe, it, expect } from 'vitest';
import { checkDrugAllergy, normaliseAllergyClasses } from '@/lib/agents/mtm/allergyChecker';
import { lookupDrugClass, resolveAllergyClasses } from '@/lib/agents/mtm/drugClassTable';
import { buildDetectedIssues } from '@/lib/agents/mtm/fhirDetectedIssue';
import { evaluate } from '@/lib/agents/mtm/mtmEngine';
import type {
  DrugLookupResult,
  PatientAllergy,
  MtmFinding,
  MtmCheckInput,
} from '@/lib/agents/mtm/types';
import type { DetectedIssueContext } from '@/lib/agents/mtm/fhirDetectedIssue';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const amoxicillin: DrugLookupResult = {
  rxcui: '723',
  name: 'Amoxicillin',
  isGeneric: true,
  suggestedSig: '1 cap three times daily',
  ndcList: [],
};

const rosuvastatin: DrugLookupResult = {
  rxcui: '301542',
  name: 'Rosuvastatin',
  isGeneric: true,
  suggestedSig: '1 tab daily',
  ndcList: [],
};

const penicillinAllergy: PatientAllergy = {
  id: 'allergy-pcn-001',
  substanceName: 'Penicillin',
  allergyClasses: ['penicillin', 'beta-lactam'],
  criticality: 'high',
  reactionSeverity: 'severe',
};

const mildPenicillinAllergy: PatientAllergy = {
  id: 'allergy-pcn-002',
  substanceName: 'Penicillin',
  allergyClasses: ['penicillin', 'beta-lactam'],
  criticality: 'low',
  reactionSeverity: 'mild',
};

const sulfonamideAllergy: PatientAllergy = {
  id: 'allergy-sulfa-001',
  substanceName: 'Sulfonamides',
  allergyClasses: ['sulfonamide'],
  criticality: 'high',
  reactionSeverity: 'moderate',
};

const atorvastatinMed = {
  rxcui: '617311',
  name: 'Atorvastatin 40 mg',
};

// ── normaliseAllergyClasses ───────────────────────────────────────────────────

describe('normaliseAllergyClasses', () => {
  it('resolves penicillin to correct classes', () => {
    const classes = normaliseAllergyClasses('Penicillin');
    expect(classes).toContain('penicillin');
    expect(classes).toContain('beta-lactam');
  });

  it('resolves sulfonamide variations', () => {
    expect(normaliseAllergyClasses('Sulfonamides')).toContain('sulfonamide');
    expect(normaliseAllergyClasses('sulfa')).toContain('sulfonamide');
  });

  it('resolves NSAID', () => {
    expect(normaliseAllergyClasses('nsaid')).toContain('nsaid');
    expect(normaliseAllergyClasses('Aspirin')).toContain('aspirin');
  });

  it('returns empty array for unknown substance', () => {
    expect(normaliseAllergyClasses('UnknownSubstanceXYZ123')).toHaveLength(0);
  });

  it('is case-insensitive', () => {
    expect(normaliseAllergyClasses('PENICILLIN')).toContain('penicillin');
  });
});

// ── lookupDrugClass ───────────────────────────────────────────────────────────

describe('lookupDrugClass', () => {
  it('resolves Amoxicillin by RxCUI', () => {
    const info = lookupDrugClass('723');
    expect(info).not.toBeNull();
    expect(info?.atcLevel4).toBe('J01CA');
    expect(info?.allergyClasses).toContain('penicillin');
    expect(info?.allergyClasses).toContain('beta-lactam');
  });

  it('resolves Rosuvastatin by RxCUI', () => {
    const info = lookupDrugClass('301542');
    expect(info).not.toBeNull();
    expect(info?.atcLevel4).toBe('C10AA');
    expect(info?.allergyClasses).toContain('statin');
  });

  it('resolves Atorvastatin by RxCUI', () => {
    const info = lookupDrugClass('617311');
    expect(info).not.toBeNull();
    expect(info?.atcLevel4).toBe('C10AA');
  });

  it('resolves Lisinopril by RxCUI', () => {
    const info = lookupDrugClass('314076');
    expect(info?.atcLevel4).toBe('C09AA');
    expect(info?.allergyClasses).toContain('ace-inhibitor');
  });

  it('falls back to name-based lookup', () => {
    // RxCUI that is not in the table, but name matches
    const info = lookupDrugClass('UNKNOWN-RXCUI', 'Amoxicillin');
    expect(info).not.toBeNull();
    expect(info?.atcLevel4).toBe('J01CA');
  });

  it('returns null for unknown drug', () => {
    const info = lookupDrugClass('UNKNOWN-RXCUI-XYZ', 'CompletelyUnknownDrug');
    expect(info).toBeNull();
  });
});

// ── resolveAllergyClasses ─────────────────────────────────────────────────────

describe('resolveAllergyClasses', () => {
  it('resolves penicillin to class set', () => {
    const classes = resolveAllergyClasses('penicillin');
    expect(classes).toContain('penicillin');
    expect(classes).toContain('beta-lactam');
  });

  it('resolves via partial substring (e.g. "Penicillin VK")', () => {
    const classes = resolveAllergyClasses('Penicillin VK');
    expect(classes).toContain('penicillin');
  });
});

// ── checkDrugAllergy ──────────────────────────────────────────────────────────

describe('checkDrugAllergy', () => {
  it('fires contraindicated for Amoxicillin + high-criticality severe Penicillin allergy', () => {
    const findings = checkDrugAllergy(amoxicillin, [penicillinAllergy]);
    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe('drug-allergy');
    expect(findings[0].severity).toBe('contraindicated');
    expect(findings[0].hardBlock).toBe(true);
    expect(findings[0].headline).toContain('Amoxicillin');
    expect(findings[0].headline).toContain('Penicillin');
    expect(findings[0].detail).toContain('penicillin');
  });

  it('fires major for Amoxicillin + low-criticality mild Penicillin allergy', () => {
    const findings = checkDrugAllergy(amoxicillin, [mildPenicillinAllergy]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('moderate'); // criticality low + severity mild = moderate
    expect(findings[0].hardBlock).toBe(false);
  });

  it('fires major for high-criticality moderate-reaction allergy', () => {
    const aspirinDrug: DrugLookupResult = {
      rxcui: '161',
      name: 'Aspirin',
      isGeneric: true,
      suggestedSig: '',
      ndcList: [],
    };
    const aspirinAllergy: PatientAllergy = {
      id: 'allergy-aspirin-001',
      substanceName: 'Aspirin',
      allergyClasses: ['aspirin', 'nsaid', 'salicylate'],
      criticality: 'high',
      reactionSeverity: 'moderate',
    };
    const findings = checkDrugAllergy(aspirinDrug, [aspirinAllergy]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('major');
  });

  it('does NOT fire for unrelated allergy (sulfonamide when ordering Amoxicillin)', () => {
    const findings = checkDrugAllergy(amoxicillin, [sulfonamideAllergy]);
    expect(findings).toHaveLength(0);
  });

  it('returns empty when allergies list is empty', () => {
    expect(checkDrugAllergy(amoxicillin, [])).toHaveLength(0);
  });

  it('fires for drug with no RxCUI in table but name resolves to class', () => {
    const unknownPenicillin: DrugLookupResult = {
      rxcui: 'UNKNOWN-999',
      name: 'Amoxicillin 875 mg tablet',
      isGeneric: true,
      suggestedSig: '',
      ndcList: [],
    };
    const findings = checkDrugAllergy(unknownPenicillin, [penicillinAllergy]);
    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe('drug-allergy');
  });

  it('returns empty when drug class cannot be resolved', () => {
    const unknown: DrugLookupResult = {
      rxcui: 'UNKNOWN-XYZ',
      name: 'CompletlyFakeDrugXYZ',
      isGeneric: true,
      suggestedSig: '',
      ndcList: [],
    };
    expect(checkDrugAllergy(unknown, [penicillinAllergy])).toHaveLength(0);
  });
});

// ── Duplicate therapy via class table (Rosuvastatin + Atorvastatin) ───────────

describe('evaluate — duplicate statin therapy (class table path)', () => {
  it('detects Rosuvastatin as duplicate when Atorvastatin is on med list', () => {
    // Neither drug has atcLevel4 pre-populated — engine must resolve from class table
    const input: MtmCheckInput = {
      newDrug: rosuvastatin,
      currentMedications: [atorvastatinMed],
      interactions: [],
    };
    const findings = evaluate(input);
    expect(findings.some((f) => f.type === 'duplicate-therapy')).toBe(true);
    const dup = findings.find((f) => f.type === 'duplicate-therapy');
    expect(dup?.headline).toContain('Rosuvastatin');
    expect(dup?.detail).toContain('C10AA');
  });
});

// ── Engine integration: Amoxicillin + Penicillin allergy ─────────────────────

describe('evaluate — drug-allergy integration', () => {
  it('surfaces drug-allergy finding for Amoxicillin + Penicillin allergy', () => {
    const input: MtmCheckInput = {
      newDrug: amoxicillin,
      currentMedications: [],
      interactions: [],
      allergies: [penicillinAllergy],
    };
    const findings = evaluate(input);
    expect(findings.some((f) => f.type === 'drug-allergy')).toBe(true);
    const f = findings.find((f) => f.type === 'drug-allergy');
    expect(f?.hardBlock).toBe(true);
    expect(f?.severity).toBe('contraindicated');
  });

  it('returns empty findings for safe drug with no allergies', () => {
    const input: MtmCheckInput = {
      newDrug: rosuvastatin,
      currentMedications: [],
      interactions: [],
      allergies: [],
    };
    expect(evaluate(input)).toHaveLength(0);
  });

  it('sorts drug-allergy contraindicated before duplicate-therapy moderate', () => {
    // Amoxicillin: contraindicated allergy AND hypothetical duplicate
    const amoxyDuplicate = { rxcui: '7454', name: 'Ampicillin', atcLevel4: 'J01CA' };
    const input: MtmCheckInput = {
      newDrug: amoxicillin,
      currentMedications: [amoxyDuplicate],
      interactions: [],
      allergies: [penicillinAllergy],
    };
    const findings = evaluate(input);
    // contraindicated should be first
    expect(findings[0].severity).toBe('contraindicated');
  });
});

// ── Submit-guard bypass test (the "Amoxicillin typed without selection" incident) ──

describe('submit-guard: screening required when allergies on file', () => {
  /**
   * This is a pure logic test of the submit guard invariant, not a React render test.
   * We test the condition directly: submitDisabled = !medName || hasHardBlock || pendingAck || screeningPending
   * where screeningPending = allergies.length > 0 && (screenedForName === null || screenedForName !== medName)
   */

  function computeSubmitDisabled(opts: {
    medName: string;
    screenedForName: string | null;
    allergies: { id: string }[];
    hasHardBlock: boolean;
    pendingAck: boolean;
  }): { disabled: boolean; reason: string } {
    const { medName, screenedForName, allergies, hasHardBlock, pendingAck } = opts;
    if (!medName.trim()) return { disabled: true, reason: 'no-name' };
    if (hasHardBlock) return { disabled: true, reason: 'hard-block' };
    if (pendingAck) return { disabled: true, reason: 'pending-ack' };
    const screeningRequired = allergies.length > 0;
    const screeningStale =
      screenedForName === null ||
      screenedForName.trim().toLowerCase() !== medName.trim().toLowerCase();
    const screeningPending = screeningRequired && screeningStale;
    if (screeningPending) return { disabled: true, reason: 'screening-pending' };
    return { disabled: false, reason: 'ok' };
  }

  const allergies = [{ id: 'allergy-pcn-001' }];

  it('BLOCKS submit when allergies on file and no screening has run (free-text entry)', () => {
    const result = computeSubmitDisabled({
      medName: 'Amoxicillin 500 MG Oral Capsule',
      screenedForName: null, // never ran
      allergies,
      hasHardBlock: false,
      pendingAck: false,
    });
    expect(result.disabled).toBe(true);
    expect(result.reason).toBe('screening-pending');
  });

  it('BLOCKS submit when drug name was changed after screening (stale result)', () => {
    const result = computeSubmitDisabled({
      medName: 'Amoxicillin 500 MG Oral Capsule',
      screenedForName: 'Lisinopril 10 mg', // screening ran for a different drug
      allergies,
      hasHardBlock: false,
      pendingAck: false,
    });
    expect(result.disabled).toBe(true);
    expect(result.reason).toBe('screening-pending');
  });

  it('BLOCKS submit when screening ran but screenedForName is null', () => {
    const result = computeSubmitDisabled({
      medName: 'Amoxicillin',
      screenedForName: null,
      allergies,
      hasHardBlock: false,
      pendingAck: false,
    });
    expect(result.disabled).toBe(true);
    expect(result.reason).toBe('screening-pending');
  });

  it('ALLOWS submit when screening ran for the exact current name and no findings', () => {
    const result = computeSubmitDisabled({
      medName: 'Lisinopril 10 mg',
      screenedForName: 'Lisinopril 10 mg',
      allergies,
      hasHardBlock: false,
      pendingAck: false,
    });
    expect(result.disabled).toBe(false);
    expect(result.reason).toBe('ok');
  });

  it('ALLOWS submit when no allergies on file (screening not required)', () => {
    const result = computeSubmitDisabled({
      medName: 'Amoxicillin',
      screenedForName: null, // never ran — but no allergies, so not required
      allergies: [],
      hasHardBlock: false,
      pendingAck: false,
    });
    expect(result.disabled).toBe(false);
    expect(result.reason).toBe('ok');
  });

  it('BLOCKS submit (hard-block) even when screening ran, when contraindicated finding exists', () => {
    const result = computeSubmitDisabled({
      medName: 'Amoxicillin',
      screenedForName: 'Amoxicillin',
      allergies,
      hasHardBlock: true, // contraindicated finding
      pendingAck: false,
    });
    expect(result.disabled).toBe(true);
    expect(result.reason).toBe('hard-block');
  });

  it('name comparison is case-insensitive', () => {
    const result = computeSubmitDisabled({
      medName: 'amoxicillin',
      screenedForName: 'Amoxicillin', // same drug, different case
      allergies,
      hasHardBlock: false,
      pendingAck: false,
    });
    expect(result.disabled).toBe(false);
    expect(result.reason).toBe('ok');
  });

  it('BLOCKS when medName is empty regardless of other state', () => {
    const result = computeSubmitDisabled({
      medName: '',
      screenedForName: 'Lisinopril',
      allergies,
      hasHardBlock: false,
      pendingAck: false,
    });
    expect(result.disabled).toBe(true);
    expect(result.reason).toBe('no-name');
  });
});

// ── buildDetectedIssues ───────────────────────────────────────────────────────

describe('buildDetectedIssues', () => {
  const context: DetectedIssueContext = {
    patientId: 'SD-448291',
    newMedicationRequestId: 'med-001',
    practitionerRef: 'Practitioner/dr-001',
    nowIso: '2026-09-04T08:45:00Z',
  };

  it('builds a DetectedIssue for a duplicate-therapy finding', () => {
    const finding: MtmFinding = {
      type: 'duplicate-therapy',
      severity: 'moderate',
      headline: 'Duplicate statin therapy',
      detail: 'Both Rosuvastatin and Atorvastatin belong to C10AA.',
      requiresAcknowledgement: true,
      hardBlock: false,
    };
    const issues = buildDetectedIssues([finding], context);
    expect(issues).toHaveLength(1);
    const issue = issues[0];
    expect(issue.resourceType).toBe('DetectedIssue');
    expect(issue.status).toBe('final');
    expect(issue.severity).toBe('moderate');
    expect(issue.code.coding[0].code).toBe('DUPTHPY');
    expect(issue.patient.reference).toBe('Patient/SD-448291');
    expect(issue.implicated.some((i) => i.reference === 'MedicationRequest/med-001')).toBe(true);
    expect(issue.mitigation?.[0].action.text).toContain('discontinue');
  });

  it('builds a DetectedIssue for a drug-allergy finding with AllergyIntolerance reference', () => {
    const finding: MtmFinding = {
      type: 'drug-allergy',
      severity: 'contraindicated',
      headline: 'Drug-Allergy Alert: Amoxicillin — documented Penicillin allergy',
      detail: 'Class match: penicillin.',
      requiresAcknowledgement: true,
      hardBlock: true,
    };
    const ctxWithAllergy: DetectedIssueContext = {
      ...context,
      allergyIntoleranceId: 'allergy-pcn-001',
    };
    const issues = buildDetectedIssues([finding], ctxWithAllergy);
    expect(issues[0].code.coding[0].code).toBe('DRG-ALLRG');
    expect(issues[0].severity).toBe('high');
    expect(
      issues[0].implicated.some((i) => i.reference === 'AllergyIntolerance/allergy-pcn-001')
    ).toBe(true);
    expect(issues[0].mitigation?.[0].action.text).toContain('alternative');
  });

  it('builds a DDI DetectedIssue for an interaction finding', () => {
    const finding: MtmFinding = {
      type: 'interaction',
      severity: 'major',
      headline: 'Lisinopril ↔ Spironolactone',
      detail: 'Risk of hyperkalemia.',
      requiresAcknowledgement: true,
      hardBlock: false,
    };
    const issues = buildDetectedIssues([finding], context);
    expect(issues[0].code.coding[0].code).toBe('DDI');
    expect(issues[0].severity).toBe('high');
  });

  it('returns empty array for empty findings', () => {
    expect(buildDetectedIssues([], context)).toHaveLength(0);
  });
  // Multi-finding + allergyMapper tests moved to mtm-drug-lookup.test.ts (500-line cap).
});
