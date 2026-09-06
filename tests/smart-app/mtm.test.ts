/**
 * MTM Agent — tests
 *
 * Covers: pure engine, all 4 checkers, schema parsing, interaction normaliser.
 * No network calls — all BFF routes are covered by unit-level tests of the
 * pure domain logic they delegate to.
 */
import { describe, it, expect } from 'vitest';
import { evaluate } from '@/lib/agents/mtm/mtmEngine';
import { checkDuplicateTherapy } from '@/lib/agents/mtm/duplicateTherapyChecker';
import { checkRefillTooSoon } from '@/lib/agents/mtm/refillTooSoonChecker';
import { checkBeersCriteria } from '@/lib/agents/mtm/beersCriteriaChecker';
import { normaliseInteractions, normaliseSeverity } from '@/lib/agents/mtm/interactionChecker';
import {
  parseRxNormDrugs,
  parseFdaNdcResponse,
  parseRxNavInteraction,
} from '@/lib/agents/mtm/schema';
import type {
  DrugLookupResult,
  CurrentMedication,
  DrugInteraction,
  MtmCheckInput,
} from '@/lib/agents/mtm/types';

// ── Test fixtures ─────────────────────────────────────────────────────────────

const lisinopril: DrugLookupResult = {
  rxcui: '314076',
  name: 'Lisinopril 10 mg',
  isGeneric: true,
  suggestedSig: '1 tab daily',
  ndcList: ['00071-0535-23'],
  atcLevel4: 'C09AA',
};

const ramipril: CurrentMedication = {
  rxcui: '35296',
  name: 'Ramipril 5 mg',
  atcLevel4: 'C09AA', // same class as Lisinopril
};

const metformin: CurrentMedication = {
  rxcui: '860975',
  name: 'Metformin 500 mg',
  atcLevel4: 'A10BA', // different class
};

const lisinoprilRefillable: CurrentMedication = {
  rxcui: '314076',
  name: 'Lisinopril 10 mg',
  lastFillDaysSupply: 30,
  lastFillDate: '2025-01-01',
};

const amitriptyline: DrugLookupResult = {
  rxcui: '41493',
  name: 'Amitriptyline',
  isGeneric: true,
  suggestedSig: '',
  ndcList: [],
};

// ── normaliseSeverity ─────────────────────────────────────────────────────────

describe('normaliseSeverity', () => {
  it('maps known strings correctly', () => {
    expect(normaliseSeverity('contraindicated')).toBe('contraindicated');
    expect(normaliseSeverity('major')).toBe('major');
    expect(normaliseSeverity('high')).toBe('major');
    expect(normaliseSeverity('moderate')).toBe('moderate');
    expect(normaliseSeverity('low')).toBe('minor');
    expect(normaliseSeverity('minor')).toBe('minor');
  });

  it('defaults unknown values to moderate', () => {
    expect(normaliseSeverity('unknown-severity')).toBe('moderate');
    expect(normaliseSeverity('')).toBe('moderate');
  });

  it('is case-insensitive', () => {
    expect(normaliseSeverity('MAJOR')).toBe('major');
    expect(normaliseSeverity('Contraindicated')).toBe('contraindicated');
  });
});

// ── checkDuplicateTherapy ─────────────────────────────────────────────────────

describe('checkDuplicateTherapy', () => {
  it('returns a finding when ATC level-4 class matches', () => {
    const findings = checkDuplicateTherapy(lisinopril, [ramipril]);
    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe('duplicate-therapy');
    expect(findings[0].severity).toBe('moderate');
    expect(findings[0].hardBlock).toBe(false);
    expect(findings[0].headline).toContain('Lisinopril');
    expect(findings[0].headline).toContain('Ramipril');
  });

  it('returns empty when no class match', () => {
    const findings = checkDuplicateTherapy(lisinopril, [metformin]);
    expect(findings).toHaveLength(0);
  });

  it('returns empty when new drug has no atcLevel4', () => {
    const noClass: DrugLookupResult = { ...lisinopril, atcLevel4: undefined };
    const findings = checkDuplicateTherapy(noClass, [ramipril]);
    expect(findings).toHaveLength(0);
  });

  it('returns empty when existing med has no atcLevel4', () => {
    const noClassMed: CurrentMedication = { rxcui: '35296', name: 'Ramipril 5 mg' };
    const findings = checkDuplicateTherapy(lisinopril, [noClassMed]);
    expect(findings).toHaveLength(0);
  });

  it('matches on first 5 chars of ATC code (level-4)', () => {
    const similar: CurrentMedication = { rxcui: '12345', name: 'Enalapril', atcLevel4: 'C09AA999' };
    const findings = checkDuplicateTherapy(lisinopril, [similar]);
    expect(findings).toHaveLength(1);
  });

  it('can produce multiple findings for multiple duplicates', () => {
    const another: CurrentMedication = { rxcui: '99999', name: 'Captopril', atcLevel4: 'C09AA' };
    const findings = checkDuplicateTherapy(lisinopril, [ramipril, another, metformin]);
    expect(findings).toHaveLength(2);
  });
});

// ── checkRefillTooSoon ────────────────────────────────────────────────────────

describe('checkRefillTooSoon', () => {
  it('returns finding when < 80% of days supply has elapsed', () => {
    // 30-day supply filled 2025-01-01; threshold = 24 days; checking on day 10
    const findings = checkRefillTooSoon(lisinopril, [lisinoprilRefillable], '2025-01-11');
    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe('refill-too-soon');
    expect(findings[0].severity).toBe('minor');
    expect(findings[0].hardBlock).toBe(false);
    expect(findings[0].headline).toContain('Lisinopril');
    expect(findings[0].detail).toContain('80%');
  });

  it('returns empty when >= 80% of days supply has elapsed', () => {
    // 30 days supply, checking on day 25 (>= 24 threshold)
    const findings = checkRefillTooSoon(lisinopril, [lisinoprilRefillable], '2025-01-26');
    expect(findings).toHaveLength(0);
  });

  it('returns empty when RxCUI does not match', () => {
    const findings = checkRefillTooSoon(lisinopril, [metformin], '2025-01-11');
    expect(findings).toHaveLength(0);
  });

  it('returns empty when lastFillDate is absent', () => {
    const med: CurrentMedication = { rxcui: '314076', name: 'Lisinopril', lastFillDaysSupply: 30 };
    const findings = checkRefillTooSoon(lisinopril, [med], '2025-01-11');
    expect(findings).toHaveLength(0);
  });

  it('returns empty when lastFillDaysSupply is absent', () => {
    const med: CurrentMedication = {
      rxcui: '314076',
      name: 'Lisinopril',
      lastFillDate: '2025-01-01',
    };
    const findings = checkRefillTooSoon(lisinopril, [med], '2025-01-11');
    expect(findings).toHaveLength(0);
  });

  it('returns empty on exactly day 24 (threshold met)', () => {
    // 30-day supply × 0.8 = 24 days → day 24 is OK
    const findings = checkRefillTooSoon(lisinopril, [lisinoprilRefillable], '2025-01-25');
    expect(findings).toHaveLength(0);
  });
});

// ── checkBeersCriteria ────────────────────────────────────────────────────────

describe('checkBeersCriteria', () => {
  it('fires for a known Beers drug in a patient ≥65', () => {
    const findings = checkBeersCriteria(amitriptyline, 72);
    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe('beers-criteria');
    expect(findings[0].severity).toBe('moderate');
    expect(findings[0].headline).toContain('Amitriptyline');
    expect(findings[0].hardBlock).toBe(false);
    expect(findings[0].detail).toContain('anticholinergic');
  });

  it('does not fire for patients under 65', () => {
    const findings = checkBeersCriteria(amitriptyline, 64);
    expect(findings).toHaveLength(0);
  });

  it('does not fire for drugs not in the Beers list', () => {
    const findings = checkBeersCriteria(lisinopril, 72);
    expect(findings).toHaveLength(0);
  });

  it('fires at exactly age 65', () => {
    const findings = checkBeersCriteria(amitriptyline, 65);
    expect(findings).toHaveLength(1);
  });
});

// ── normaliseInteractions ────────────────────────────────────────────────────

describe('normaliseInteractions', () => {
  it('normalises a valid RxNav interaction response', () => {
    const raw = {
      fullInteractionTypeGroup: [
        {
          sourceName: 'DrugBank',
          fullInteractionType: [
            {
              interactionPair: [
                {
                  interactionConcept: [
                    { minConceptItem: { rxcui: '1', name: 'Drug A' } },
                    { minConceptItem: { rxcui: '2', name: 'Drug B' } },
                  ],
                  severity: 'major',
                  description: 'Serious interaction',
                },
              ],
            },
          ],
        },
      ],
    };
    const parsed = parseRxNavInteraction(raw);
    const interactions = normaliseInteractions(parsed);
    expect(interactions).toHaveLength(1);
    expect(interactions[0].severity).toBe('major');
    expect(interactions[0].drug1.name).toBe('Drug A');
    expect(interactions[0].source).toBe('DrugBank');
  });

  it('returns empty array for an empty interaction response', () => {
    const parsed = parseRxNavInteraction({});
    const interactions = normaliseInteractions(parsed);
    expect(interactions).toHaveLength(0);
  });
});

// ── Zod schemas ───────────────────────────────────────────────────────────────

describe('parseRxNormDrugs', () => {
  it('parses a minimal valid response', () => {
    const raw = { drugGroup: { name: 'lisinopril', conceptGroup: [] } };
    const result = parseRxNormDrugs(raw);
    expect(result).not.toBeNull();
    expect(result?.drugGroup.name).toBe('lisinopril');
  });

  it('returns null for missing drugGroup', () => {
    expect(parseRxNormDrugs({})).toBeNull();
    expect(parseRxNormDrugs(null)).toBeNull();
    expect(parseRxNormDrugs('not-an-object')).toBeNull();
  });
});

describe('parseFdaNdcResponse', () => {
  it('parses a response with results', () => {
    const raw = {
      results: [
        {
          product_ndc: '00071-0535-23',
          labeler_name: 'Pfizer',
          packaging: [{ description: 'Bottle of 90' }],
        },
      ],
    };
    const result = parseFdaNdcResponse(raw);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].product_ndc).toBe('00071-0535-23');
  });

  it('returns empty results for missing results field', () => {
    const result = parseFdaNdcResponse({});
    expect(result.results).toHaveLength(0);
  });

  it('returns empty results for null input', () => {
    const result = parseFdaNdcResponse(null);
    expect(result.results).toHaveLength(0);
  });
});

// ── evaluate() (engine integration) ──────────────────────────────────────────

describe('evaluate — MTM engine', () => {
  it('returns empty findings for a safe drug with no existing meds', () => {
    const input: MtmCheckInput = {
      newDrug: lisinopril,
      currentMedications: [],
      interactions: [],
    };
    expect(evaluate(input)).toHaveLength(0);
  });

  it('returns duplicate therapy finding when same ATC class present', () => {
    const input: MtmCheckInput = {
      newDrug: lisinopril,
      currentMedications: [ramipril],
      interactions: [],
    };
    const findings = evaluate(input);
    expect(findings.some((f) => f.type === 'duplicate-therapy')).toBe(true);
  });

  it('includes interaction findings when provided', () => {
    const ix: DrugInteraction = {
      drug1: { rxcui: '314076', name: 'Lisinopril' },
      drug2: { rxcui: '35296', name: 'Ramipril' },
      severity: 'major',
      description: 'Additive hypotensive effect.',
      source: 'NDF-RT',
    };
    const input: MtmCheckInput = {
      newDrug: lisinopril,
      currentMedications: [],
      interactions: [ix],
    };
    const findings = evaluate(input);
    expect(findings.some((f) => f.type === 'interaction')).toBe(true);
    expect(findings.some((f) => f.severity === 'major')).toBe(true);
  });

  it('sets hardBlock:true for contraindicated interactions', () => {
    const ix: DrugInteraction = {
      drug1: { rxcui: '314076', name: 'Lisinopril' },
      drug2: { rxcui: '35296', name: 'Ramipril' },
      severity: 'contraindicated',
      description: 'Contraindicated combination.',
      source: 'NDF-RT',
    };
    const input: MtmCheckInput = {
      newDrug: lisinopril,
      currentMedications: [],
      interactions: [ix],
    };
    const findings = evaluate(input);
    expect(findings.some((f) => f.hardBlock)).toBe(true);
  });

  it('includes Beers finding for patient ≥65', () => {
    const input: MtmCheckInput = {
      newDrug: amitriptyline,
      currentMedications: [],
      interactions: [],
      patientAgeYears: 70,
    };
    const findings = evaluate(input);
    expect(findings.some((f) => f.type === 'beers-criteria')).toBe(true);
  });

  it('skips Beers finding when patientAgeYears not provided', () => {
    const input: MtmCheckInput = {
      newDrug: amitriptyline,
      currentMedications: [],
      interactions: [],
    };
    const findings = evaluate(input);
    expect(findings.some((f) => f.type === 'beers-criteria')).toBe(false);
  });

  it('sorts findings most-severe first', () => {
    const ix: DrugInteraction = {
      drug1: { rxcui: '314076', name: 'Lisinopril' },
      drug2: { rxcui: '35296', name: 'Ramipril' },
      severity: 'major',
      description: 'Test.',
      source: 'Test',
    };
    const input: MtmCheckInput = {
      newDrug: lisinopril,
      currentMedications: [ramipril],
      interactions: [ix],
      nowIso: '2025-01-11',
    };
    const findings = evaluate(input);
    expect(findings.length).toBeGreaterThan(1);
    // major (rank 3) should precede moderate (rank 2)
    const severities = findings.map((f) => f.severity);
    const majorIdx = severities.indexOf('major');
    const moderateIdx = severities.indexOf('moderate');
    if (majorIdx !== -1 && moderateIdx !== -1) {
      expect(majorIdx).toBeLessThan(moderateIdx);
    }
  });
});
