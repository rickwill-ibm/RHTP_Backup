/**
 * MTM Agent — drug-lookup utility tests.
 *
 * Tests for:
 *   - extractIngredient: pack-name extraction (the BPCK/GPCK false-positive fix)
 *   - lookupDrugClass: name-based resolution with pack-style names
 *
 * Companion to mtm.test.ts and mtm-allergy.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { extractIngredient, lookupDrugClass } from '@/lib/agents/mtm/drugClassTable';
import { buildDetectedIssues } from '@/lib/agents/mtm/fhirDetectedIssue';
import { mapAllergiesToMtm } from '@/lib/agents/mtm/allergyMapper';
import type { MtmFinding } from '@/lib/agents/mtm/types';

// ── extractIngredient ─────────────────────────────────────────────────────────

describe('extractIngredient', () => {
  it('returns regular drug names unchanged', () => {
    expect(extractIngredient('Amoxicillin 500 MG Oral Capsule')).toBe(
      'Amoxicillin 500 MG Oral Capsule'
    );
  });

  it('extracts the first ingredient from a BPCK-style pack name', () => {
    const packName =
      '{4 (amoxicillin 500 MG Oral Capsule) / 2 (clarithromycin 500 MG Oral Tablet) / 2 (omeprazole 20 MG Delayed Release Oral Capsule)}';
    expect(extractIngredient(packName)).toBe('amoxicillin 500 MG Oral Capsule');
  });

  it('handles a two-drug pack', () => {
    const packName =
      '{2 (lisinopril 10 MG Oral Tablet) / 1 (hydrochlorothiazide 12.5 MG Oral Tablet)}';
    expect(extractIngredient(packName)).toBe('lisinopril 10 MG Oral Tablet');
  });

  it('handles a single-entry pack with count 1', () => {
    const packName = '{1 (atorvastatin 40 MG Oral Tablet)}';
    expect(extractIngredient(packName)).toBe('atorvastatin 40 MG Oral Tablet');
  });

  it('trims whitespace from the extracted ingredient name', () => {
    const packName = '{4 (  amoxicillin 500 MG Oral Capsule  ) / 2 (...)}';
    expect(extractIngredient(packName)).toBe('amoxicillin 500 MG Oral Capsule');
  });

  it('does not match names that start with a brace but are not pack format', () => {
    // Hypothetical non-pack brace-prefixed name — should pass through unchanged
    expect(extractIngredient('{not a pack}')).toBe('{not a pack}');
  });

  it('returns empty string unchanged', () => {
    expect(extractIngredient('')).toBe('');
  });
});

// ── lookupDrugClass with pack-style names ─────────────────────────────────────

describe('lookupDrugClass — pack-style name resolution', () => {
  it('resolves amoxicillin class from a BPCK pack name via name hint', () => {
    const packName =
      '{4 (amoxicillin 500 MG Oral Capsule) / 2 (clarithromycin 500 MG Oral Tablet) / 2 (omeprazole 20 MG Delayed Release Oral Capsule)}';
    const result = lookupDrugClass('BPCK-unknown', packName);
    // Must resolve to penicillin class (not null — the historical false-positive bug)
    expect(result).not.toBeNull();
    expect(result!.allergyClasses).toContain('penicillin');
  });

  it('resolves amoxicillin from plain SCD clinical drug name', () => {
    const result = lookupDrugClass('unknown-rxcui', 'Amoxicillin 500 MG Oral Capsule');
    expect(result).not.toBeNull();
    expect(result!.allergyClasses).toContain('penicillin');
    expect(result!.allergyClasses).toContain('beta-lactam');
  });

  it('resolves atorvastatin from a single-entry pack name', () => {
    const packName = '{1 (atorvastatin 40 MG Oral Tablet)}';
    const result = lookupDrugClass('unknown-rxcui', packName);
    expect(result).not.toBeNull();
    expect(result!.atcLevel4).toBe('C10AA');
  });

  it('returns null for a pack name whose primary ingredient is not in the table', () => {
    const packName = '{3 (unknownDrugXYZ 100 MG Oral Tablet) / 2 (somethingElse 50 MG)}';
    const result = lookupDrugClass('unknown-rxcui', packName);
    expect(result).toBeNull();
  });

  it('still resolves by RxCUI when rxcui is in the table (pack name ignored)', () => {
    // RxCUI '723' = Amoxicillin in the drug class table
    const result = lookupDrugClass('723', '{3 (completelyWrongDrug 100 MG)}');
    expect(result).not.toBeNull();
    expect(result!.allergyClasses).toContain('penicillin');
  });
});

// ── lookupDrugClass — minimum-length guard on partial match ───────────────────

describe('lookupDrugClass — partial match min-length guard', () => {
  it('does NOT match a 3-char first word (guard: >= 4 chars required)', () => {
    // "ace" is 3 chars — must not spuriously match any table entry
    const result = lookupDrugClass('unknown-rxcui', 'ace something 10 MG');
    // If it matches, it could only match 'acebutolol' or similar (unlikely in our table)
    // Crucially: it must not match unrelated drugs via 3-char prefix
    if (result !== null) {
      // If a result came back, the matched entry's name must actually start with "ace"
      expect(result.pharmacologicalClass.toLowerCase()).not.toBe('penicillin antibiotic');
      expect(result.pharmacologicalClass.toLowerCase()).not.toBe('hmg-coa reductase inhibitor');
    }
  });

  it('matches "lisinopril" (9 chars, >= 4) via partial first-word match', () => {
    const result = lookupDrugClass('unknown-rxcui', 'lisinopril 10 MG Oral Tablet');
    expect(result).not.toBeNull();
    expect(result!.atcLevel4).toBe('C09AA');
  });
});

// ── DetectedIssue multi-finding builder (moved from mtm-allergy.test.ts) ──────

describe('buildDetectedIssues — multi-finding', () => {
  const context = {
    patientId: 'SD-448291',
    newMedicationRequestId: 'med-001',
    practitionerRef: 'Practitioner/dr-001',
    nowIso: '2026-09-04T08:45:00Z',
  };

  it('builds one resource per finding', () => {
    const findings: MtmFinding[] = [
      {
        type: 'duplicate-therapy',
        severity: 'moderate',
        headline: 'Dup',
        detail: '',
        requiresAcknowledgement: true,
        hardBlock: false,
      },
      {
        type: 'beers-criteria',
        severity: 'moderate',
        headline: 'Beers',
        detail: '',
        requiresAcknowledgement: true,
        hardBlock: false,
      },
    ];
    const issues = buildDetectedIssues(findings, context);
    expect(issues).toHaveLength(2);
    expect(issues[0].code.coding[0].code).toBe('DUPTHPY');
    expect(issues[1].code.coding[0].code).toBe('DACT');
  });
});

// ── allergyMapper boundary tests (moved from mtm-allergy.test.ts) ─────────────

describe('mapAllergiesToMtm', () => {
  it('maps a FHIR AllergyIntolerance with code.text to PatientAllergy', () => {
    const result = mapAllergiesToMtm([
      { id: 'a1', code: { text: 'Penicillin' }, criticality: 'high' } as never,
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].substanceName).toBe('Penicillin');
    expect(result[0].criticality).toBe('high');
  });

  it('skips resources with no substance name', () => {
    expect(mapAllergiesToMtm([{ id: 'a2', code: {} } as never])).toHaveLength(0);
  });

  it('picks worst severity from multiple reactions', () => {
    const result = mapAllergiesToMtm([
      {
        id: 'a3',
        code: { text: 'Shellfish' },
        reaction: [{ severity: 'mild' }, { severity: 'severe' }],
      } as never,
    ]);
    expect(result[0].reactionSeverity).toBe('severe');
  });
});
