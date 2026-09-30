/**
 * Pure-logic simulators (mirror route handlers exactly).
 *
 * Extracted verbatim from tests/api-integration.test.mjs.
 */

import { PATIENTS, PA_SCENARIOS, PA_HISTORY, CPT_META } from './fixtures.mjs';

export function profileFor(pid) {
  return PA_SCENARIOS[pid] ?? PA_SCENARIOS['MARIA_SD_001'];
}

export function devMemberMatch(patientId) {
  const p = PA_SCENARIOS[patientId] ?? PA_SCENARIOS['MARIA_SD_001'];
  const patient = PATIENTS[patientId] ?? PATIENTS['MARIA_SD_001'];
  return {
    resourceType: 'Parameters',
    parameter: [
      {
        name: 'MemberPatient',
        resource: {
          resourceType: 'Patient',
          id: patientId ?? 'MARIA_SD_001',
          name: [{ family: patient.name.split(' ').pop(), given: [patient.name.split(' ')[0]] }],
          birthDate: patient.dob,
          gender: patient.gender,
          identifier: [{ system: 'https://rhtp.example/prior-payer-id', value: p.priorMemberId }],
        },
      },
    ],
  };
}

export function devBulkStatus(patientId) {
  const scenarios = {
    MARIA_SD_001: {
      priorPayer: 'Aetna Medicaid SD',
      priorMemberId: 'AETNA-MBR-00182734',
      priorCoverageStart: '2019-01-01',
      priorCoverageEnd: '2024-01-31',
      eobCount: 412,
      claimCount: 388,
      claimResponseCount: 19,
      conditionCount: 8,
      medicationCount: 12,
      observationCount: 64,
      procedureCount: 31,
      encounterCount: 87,
      coverageCount: 3,
    },
    'PAT-0042': {
      priorPayer: 'UnitedHealthcare Community Plan MO',
      priorMemberId: 'UHC-MBR-00487291',
      priorCoverageStart: '2019-01-01',
      priorCoverageEnd: '2023-12-31',
      eobCount: 847,
      claimCount: 791,
      claimResponseCount: 42,
      conditionCount: 14,
      medicationCount: 31,
      observationCount: 156,
      procedureCount: 67,
      encounterCount: 203,
      coverageCount: 4,
    },
    'PAT-0087': {
      priorPayer: 'Molina Healthcare of South Dakota',
      priorMemberId: 'MOL-MBR-00294817',
      priorCoverageStart: '2019-01-01',
      priorCoverageEnd: '2023-06-30',
      eobCount: 531,
      claimCount: 502,
      claimResponseCount: 27,
      conditionCount: 9,
      medicationCount: 19,
      observationCount: 98,
      procedureCount: 44,
      encounterCount: 134,
      coverageCount: 3,
    },
    'PAT-0103': {
      priorPayer: 'Anthem BCBS South Dakota',
      priorMemberId: 'ANTH-MBR-00731028',
      priorCoverageStart: '2019-01-01',
      priorCoverageEnd: '2024-03-31',
      eobCount: 623,
      claimCount: 589,
      claimResponseCount: 33,
      conditionCount: 11,
      medicationCount: 22,
      observationCount: 112,
      procedureCount: 51,
      encounterCount: 161,
      coverageCount: 3,
    },
    'PAT-0156': {
      priorPayer: 'Meridian Health Plan SD',
      priorMemberId: 'MER-MBR-00118847',
      priorCoverageStart: '2019-01-01',
      priorCoverageEnd: '2023-09-30',
      eobCount: 289,
      claimCount: 271,
      claimResponseCount: 14,
      conditionCount: 6,
      medicationCount: 9,
      observationCount: 48,
      procedureCount: 22,
      encounterCount: 73,
      coverageCount: 2,
    },
  };
  const p = scenarios[patientId] ?? scenarios['MARIA_SD_001'];
  return {
    state: 'completed',
    completedAt: new Date(Date.now() - 8000).toISOString(),
    priorPayer: p.priorPayer,
    memberMatchedId: p.priorMemberId,
    coveragePeriod: { start: p.priorCoverageStart, end: p.priorCoverageEnd },
    fileUrls: [
      '/dev/export/eob.ndjson',
      '/dev/export/coverage.ndjson',
      '/dev/export/pa-history.ndjson',
      '/dev/export/clinical.ndjson',
    ],
    resourceCounts: {
      ExplanationOfBenefit: p.eobCount,
      Coverage: p.coverageCount,
      Claim: p.claimCount,
      ClaimResponse: p.claimResponseCount,
      Condition: p.conditionCount,
      MedicationRequest: p.medicationCount,
      Observation: p.observationCount,
      Procedure: p.procedureCount,
      Encounter: p.encounterCount,
    },
    paHistory: PA_HISTORY[patientId] ?? PA_HISTORY['MARIA_SD_001'],
  };
}

export function devClaimResponseApproved(approvedBy, patientId) {
  const pid = patientId ?? 'MARIA_SD_001';
  const s = PA_SCENARIOS[pid] ?? PA_SCENARIOS['MARIA_SD_001'];
  return {
    resourceType: 'ClaimResponse',
    id: `dev-cr-approved-${pid}`,
    status: 'active',
    type: { text: s.procedureName },
    use: 'preauthorization',
    patient: { reference: `Patient/${pid}` },
    outcome: 'complete',
    disposition: `Prior authorization approved (dev demo). Reviewed by ${approvedBy}.`,
    addItem: [
      {
        productOrService: {
          coding: [
            { system: 'http://www.ama-assn.org/go/cpt', code: s.cptCode, display: s.procedureName },
          ],
        },
      },
    ],
  };
}

export function devCrdCards(patientId) {
  const s = PA_SCENARIOS[patientId] ?? PA_SCENARIOS['MARIA_SD_001'];
  return [
    {
      summary: `Prior authorization required: ${s.procedureName} (CPT ${s.cptCode})`,
      indicator: 'critical',
    },
    { summary: 'Alternative covered without prior authorization — see policy', indicator: 'info' },
  ];
}

export function devDtrEvaluation(patientId, cptCode) {
  if (patientId === 'PAT-0042' || cptCode === '75561') {
    return {
      policyTitle: 'Cardiac MRI — Medical Necessity Policy (CPT 75561)',
      cptCode,
      allMet: false,
      groups: [
        { id: 1, title: 'Echocardiogram Performed First', status: 'met' },
        { id: 3, title: 'Clinical Justification — Beyond Echocardiogram', status: 'gap' },
      ],
    };
  }
  if (patientId === 'PAT-0087' || cptCode === '93306') {
    return {
      policyTitle: 'Echocardiogram — Medical Necessity Policy (CPT 93306)',
      cptCode,
      allMet: true,
      groups: [
        { id: 1, title: 'Documented Heart Failure or Cardiac Symptom', status: 'met' },
        { id: 2, title: 'Not Repeated Within 12 Months', status: 'met' },
      ],
    };
  }
  if (patientId === 'PAT-0103' || cptCode === '99243') {
    return {
      policyTitle: 'Specialty Consult — Medical Necessity Policy (CPT 99243)',
      cptCode,
      allMet: true,
      groups: [
        { id: 1, title: 'Documented Chronic Kidney Disease (CKD Stage ≥ 3)', status: 'met' },
        { id: 2, title: 'Hypertension Poorly Controlled Despite Therapy', status: 'met' },
        { id: 3, title: 'Specialist Not Seen Within Prior 12 Months', status: 'met' },
      ],
    };
  }
  if (patientId === 'PAT-0156' || cptCode === '99244') {
    return {
      policyTitle: 'Specialty Consult — Medical Necessity Policy (CPT 99244)',
      cptCode,
      allMet: true,
      groups: [
        { id: 1, title: 'Documented Severe Persistent Asthma', status: 'met' },
        { id: 2, title: 'Step 3–4 Controller Therapy Active', status: 'met' },
        { id: 3, title: 'Spirometry Confirms Obstruction', status: 'met' },
      ],
    };
  }
  // Default: Maria's lumbar MRI
  return {
    policyTitle: 'MRI Lumbar Spine — Medical Necessity Policy (CPT 72148)',
    cptCode,
    allMet: false,
    groups: [
      { id: 1, title: '≥ 6 Weeks Conservative Therapy', status: 'met' },
      { id: 2, title: 'Neurological Deficit or Red Flag Symptom', status: 'gap' },
    ],
  };
}

export function mockFhirGetClaimResponse(patientId) {
  const paHistory = devBulkStatus(patientId).paHistory;
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    total: paHistory.length,
    entry: paHistory.map((h, i) => ({
      resource: {
        resourceType: 'ClaimResponse',
        id: `cr-${patientId}-${i}`,
        patient: { reference: `Patient/${patientId}` },
        outcome: h.decision === 'approved' ? 'complete' : 'error',
        disposition:
          h.decision === 'approved'
            ? `Approved — Auth# ${h.authNumber ?? 'N/A'}`
            : `Denied — ${h.denialReason ?? 'See details'}`,
        type: { text: h.service },
        created: h.date,
      },
    })),
  };
}

export function seededEvidenceRecord(id) {
  const ts = '2026-05-15T14:22:00Z';
  const withoutPrefix = id.startsWith('ev-') ? id.slice(3) : id;
  const parts = withoutPrefix.split('-');
  const cptCode = parts.length >= 3 ? parts[parts.length - 2] : '72148';
  const memberId = parts.length >= 3 ? parts.slice(0, parts.length - 2).join('-') : 'MARIA_SD_001';
  const code = cptCode || '72148';
  const meta = CPT_META[code] ?? CPT_META['72148'];
  const patient = PATIENTS[memberId];
  const patientName = patient?.name ?? memberId;
  return {
    id,
    memberId,
    patientName,
    order: { code, display: meta.display },
    policyRef: meta.policyRef,
    payer: meta.payer,
    propensity: meta.propensity,
    propensityBand: meta.propensityBand,
  };
}

export function validateEvidenceId(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9._:\-]{1,128}$/.test(id))
    return { ok: false, error: 'invalid evidence id' };
  return { ok: true };
}

export function buildEvidenceId(pid, cptCode) {
  return `ev-${pid}-${cptCode}-1730154782`;
}
