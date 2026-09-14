/**
 * FHIR DetectedIssue Builder — Da Vinci MTM pattern.
 *
 * Converts MtmFinding[] → FhirDetectedIssue[] ready to write to the FHIR store.
 * Each finding becomes one DetectedIssue resource with:
 *   - Standard ActCode coding (DUPTHPY, DRG-ALLRG, DDI, etc.)
 *   - implicated[] references to the relevant MedicationRequest / AllergyIntolerance
 *   - mitigation action text
 *   - severity mapped to FHIR severity enum
 *
 * Pure function: no I/O — the caller writes the resources via getFhirClient().
 *
 * Reference: HL7 FHIR R4 DetectedIssue + Da Vinci Risk Adjustment / MTM IG pattern
 * ActCode system: http://terminology.hl7.org/CodeSystem/v3-ActCode
 */
import type { MtmFinding, MtmFindingType, FhirDetectedIssue, MtmSeverity } from './types';

// ── Coding maps ───────────────────────────────────────────────────────────────

const ACT_CODE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/v3-ActCode';

const FINDING_CODE: Record<MtmFindingType, { code: string; display: string }> = {
  'duplicate-therapy': { code: 'DUPTHPY', display: 'Duplicate Therapy Alert' },
  'drug-allergy': { code: 'DRG-ALLRG', display: 'Drug-Allergy Interaction' },
  interaction: { code: 'DDI', display: 'Drug-Drug Interaction' },
  'beers-criteria': { code: 'DACT', display: 'Drug Action Alert (Beers Criteria)' },
  'refill-too-soon': { code: 'COMPLIANCE', display: 'Refill Too Soon' },
};

const SEVERITY_MAP: Record<MtmSeverity, FhirDetectedIssue['severity']> = {
  contraindicated: 'high',
  major: 'high',
  moderate: 'moderate',
  minor: 'low',
  info: 'low',
};

const MITIGATION_TEXT: Record<MtmFindingType, string> = {
  'duplicate-therapy':
    'Review current medication regimen and discontinue one agent if clinically appropriate.',
  'drug-allergy': 'Select an alternative medication from a different drug class.',
  interaction:
    'Review interaction risk. Consider dose adjustment, timing separation, or alternative therapy.',
  'beers-criteria':
    'Review appropriateness for this patient. Consider non-pharmacological alternatives or safer substitutes.',
  'refill-too-soon':
    'Confirm clinical indication for early refill and document reason if proceeding.',
};

// ── Builder ───────────────────────────────────────────────────────────────────

export interface DetectedIssueContext {
  patientId: string;
  /** FHIR id of the newly created MedicationRequest (if already saved) */
  newMedicationRequestId?: string;
  /** FHIR ids of existing MedicationRequests involved in the finding */
  impliedMedicationIds?: string[];
  /** FHIR id of the AllergyIntolerance resource that triggered a drug-allergy finding */
  allergyIntoleranceId?: string;
  /** ISO datetime — defaults to now */
  nowIso?: string;
  /** Practitioner reference for mitigation author */
  practitionerRef?: string;
}

/**
 * Build FHIR DetectedIssue resources from MTM findings.
 *
 * @param findings  - MtmFinding[] from evaluate()
 * @param context   - FHIR references needed to populate implicated[]
 * @returns         - Array of DetectedIssue resources (one per finding)
 */
export function buildDetectedIssues(
  findings: MtmFinding[],
  context: DetectedIssueContext
): FhirDetectedIssue[] {
  const now = context.nowIso ?? new Date().toISOString();

  return findings.map((finding) => {
    const codeDef = FINDING_CODE[finding.type];
    const fhirSeverity = SEVERITY_MAP[finding.severity];
    const mitigationText = MITIGATION_TEXT[finding.type];

    // Build implicated[] references
    const implicated: Array<{ reference: string }> = [];

    if (finding.type === 'drug-allergy') {
      if (context.newMedicationRequestId) {
        implicated.push({ reference: `MedicationRequest/${context.newMedicationRequestId}` });
      }
      if (context.allergyIntoleranceId) {
        implicated.push({ reference: `AllergyIntolerance/${context.allergyIntoleranceId}` });
      }
    } else if (finding.type === 'duplicate-therapy' || finding.type === 'interaction') {
      if (context.newMedicationRequestId) {
        implicated.push({ reference: `MedicationRequest/${context.newMedicationRequestId}` });
      }
      for (const id of context.impliedMedicationIds ?? []) {
        implicated.push({ reference: `MedicationRequest/${id}` });
      }
    } else {
      if (context.newMedicationRequestId) {
        implicated.push({ reference: `MedicationRequest/${context.newMedicationRequestId}` });
      }
    }

    const resource: FhirDetectedIssue = {
      resourceType: 'DetectedIssue',
      status: 'final',
      code: {
        coding: [{ system: ACT_CODE_SYSTEM, code: codeDef.code, display: codeDef.display }],
        text: finding.headline,
      },
      severity: fhirSeverity,
      patient: { reference: `Patient/${context.patientId}` },
      identifiedDateTime: now,
      implicated,
      detail: finding.detail,
      mitigation: [
        {
          action: { text: mitigationText },
          date: now,
          ...(context.practitionerRef ? { author: { reference: context.practitionerRef } } : {}),
        },
      ],
    };

    return resource;
  });
}
