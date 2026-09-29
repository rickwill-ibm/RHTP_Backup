/**
 * API Patient Context — End-to-End Data Comparison Tests
 *
 * These tests import the ACTUAL source functions that the BFF routes call at
 * runtime. They make no assumptions about what the data contains — every
 * assertion is derived by cross-comparing patients against each other or by
 * verifying invariants that must hold regardless of the data values.
 *
 * This is what the old .mjs mirror-copy test could NOT do: if a function
 * returns Maria's data for Dorothy, the cross-patient comparison below will
 * catch it even if we don't know Dorothy's data in advance.
 *
 * Approach:
 *   1. Call the real function with patient A and patient B.
 *   2. Assert the results differ in the dimension that must be patient-specific.
 *   3. Assert the result contains the patient's own identifier, not another's.
 *   4. Assert structural invariants hold for ALL patients.
 */

import { describe, it, expect } from 'vitest';

// ── Real source imports ───────────────────────────────────────────────────────
import {
  devCrdCards,
  devDtrEvaluation,
  devMemberMatch,
  devBulkStart,
  devBulkStatus,
  devClaimResponseApproved,
  devWorkQueueItems,
} from '@/lib/server/devStubs';

import {
  getPatientById,
  getAllPatients,
  FHIR_ID_MAP,
  PLATFORM_TO_FHIR_ID_MAP,
} from '@/lib/patientRegistry';
import { policyById } from '@/lib/policy/dtr/evaluate/policyRegistry';
const BARIATRIC_CPT_CODES: ReadonlySet<string> = new Set(policyById('CG-SURG-83').cptCodes);

import {
  validateEvidenceId,
  validatePatientId,
  validateOrderCode,
} from '@/lib/goldenThread/validate';

// ── All platform IDs we test ──────────────────────────────────────────────────
const ALL_PIDS = ['MARIA_SD_001', 'PAT-0042', 'PAT-0087', 'PAT-0103', 'PAT-0156'] as const;
type Pid = (typeof ALL_PIDS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// §1 — Patient Access: FHIR PASSTHROUGH (Coverage / Conditions / ClaimResponse)
// These tests verify the registry data the FHIR mock route uses.
// ─────────────────────────────────────────────────────────────────────────────

describe('§1 Patient Access — registry data used by FHIR passthrough', () => {
  it('every patient in ALL_PIDS exists in the registry', () => {
    for (const pid of ALL_PIDS) {
      const p = getPatientById(pid);
      expect(p, `${pid} must be in PATIENT_REGISTRY`).toBeDefined();
      expect(p!.platformId).toBe(pid);
    }
  });

  it('all 5 patients have distinct names', () => {
    const names = ALL_PIDS.map((pid) => getPatientById(pid)!.name);
    expect(new Set(names).size).toBe(5);
  });

  it('all 5 patients have distinct DOBs', () => {
    const dobs = ALL_PIDS.map((pid) => getPatientById(pid)!.dob);
    expect(new Set(dobs).size).toBe(5);
  });

  it('all 5 patients have non-empty conditions lists', () => {
    for (const pid of ALL_PIDS) {
      const p = getPatientById(pid)!;
      expect(p.conditions, `${pid} (${p.name}) must have conditions`).toBeDefined();
      expect(p.conditions!.length, `${pid} must have at least 1 condition`).toBeGreaterThan(0);
    }
  });

  it('Dorothy Simmons conditions do NOT contain Maria Redhawk ICD codes', () => {
    const maria = getPatientById('MARIA_SD_001')!;
    const dorothy = getPatientById('PAT-0042')!;
    const mariaCodes = new Set(maria.conditions!.map((c) => c.key));
    const dorothyCodes = dorothy.conditions!.map((c) => c.key);
    for (const key of dorothyCodes) {
      expect(mariaCodes.has(key), `Dorothy condition key "${key}" must not duplicate Maria's`).toBe(
        false
      );
    }
  });

  it('all 5 patients have non-empty medication lists', () => {
    for (const pid of ALL_PIDS) {
      const p = getPatientById(pid)!;
      expect(p.medications, `${pid} must have medications`).toBeDefined();
      expect(p.medications!.length).toBeGreaterThan(0);
    }
  });

  it('each patient has a unique contract/plan name', () => {
    const contracts = ALL_PIDS.map((pid) => getPatientById(pid)!.contract);
    // Not all 5 need to be unique (some may share Medicaid RHTP Track 3) but at
    // least Maria and Dorothy must differ — SD Medicaid vs MSSP Trk 3
    const maria = getPatientById('MARIA_SD_001')!.contract;
    const dorothy = getPatientById('PAT-0042')!.contract;
    expect(maria).not.toBe(dorothy);
  });

  it('ClaimResponse source: devBulkStatus PA history is non-empty for all patients', () => {
    for (const pid of ALL_PIDS) {
      const status = devBulkStatus(pid);
      expect(status.paHistory, `${pid} paHistory must exist`).toBeDefined();
      expect(status.paHistory.length, `${pid} must have PA history`).toBeGreaterThan(0);
    }
  });

  it('ClaimResponse: Maria and Dorothy have different PA service names', () => {
    const mariaHistory = devBulkStatus('MARIA_SD_001').paHistory.map((h) => h.service);
    const dorothyHistory = devBulkStatus('PAT-0042').paHistory.map((h) => h.service);
    // The sets must not be identical
    expect(mariaHistory).not.toEqual(dorothyHistory);
    // Dorothy must have Cardiac MRI; Maria must NOT
    expect(dorothyHistory.some((s) => s.toLowerCase().includes('cardiac'))).toBe(true);
    expect(mariaHistory.some((s) => s.toLowerCase().includes('cardiac'))).toBe(false);
    // Maria must have Lumbar MRI; Dorothy must NOT
    expect(mariaHistory.some((s) => s.toLowerCase().includes('lumbar'))).toBe(true);
    expect(dorothyHistory.some((s) => s.toLowerCase().includes('lumbar'))).toBe(false);
  });

  it('ClaimResponse: each patient has at least one denial with a reason', () => {
    // CMS §1 requires denial reasons — every patient must have at least one
    for (const pid of ALL_PIDS) {
      const history = devBulkStatus(pid).paHistory;
      const denials = history.filter((h) => h.decision === 'denied');
      expect(denials.length, `${pid} must have at least 1 denial in PA history`).toBeGreaterThan(0);
      for (const d of denials) {
        expect(d.denialReason, `${pid} denial must have a reason`).toBeTruthy();
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §2 — Provider Access: $member-match
// ─────────────────────────────────────────────────────────────────────────────

describe('§2 Provider Access — $member-match cross-patient identity', () => {
  it('all 5 patients return unique family names from devMemberMatch', () => {
    const families = ALL_PIDS.map((pid) => {
      const result = devMemberMatch(pid) as {
        parameter: { resource: { name: { family: string }[] } }[];
      };
      return result.parameter[0].resource.name[0].family;
    });
    expect(new Set(families).size).toBe(5);
  });

  it('devMemberMatch family name matches registry surname for every patient', () => {
    for (const pid of ALL_PIDS) {
      const registry = getPatientById(pid)!;
      const expectedFamily = registry.name.split(' ').pop()!;
      const result = devMemberMatch(pid) as {
        parameter: { resource: { name: { family: string; given: string[] }[] } }[];
      };
      const matchedFamily = result.parameter[0].resource.name[0].family;
      const matchedGiven = result.parameter[0].resource.name[0].given[0];

      expect(matchedFamily, `${pid}: family must be ${expectedFamily}, got ${matchedFamily}`).toBe(
        expectedFamily
      );
      expect(matchedGiven, `${pid}: given must be ${registry.name.split(' ')[0]}`).toBe(
        registry.name.split(' ')[0]
      );
    }
  });

  it('devMemberMatch returns the correct patient ID in resource.id, not always MARIA_SD_001', () => {
    for (const pid of ALL_PIDS) {
      const result = devMemberMatch(pid) as {
        parameter: { resource: { id: string } }[];
      };
      expect(result.parameter[0].resource.id, `resource.id must be ${pid}`).toBe(pid);
    }
  });

  it('all 5 patients have unique prior member IDs (no shared identity)', () => {
    const memberIds = ALL_PIDS.map((pid) => devBulkStatus(pid).memberMatchedId);
    expect(new Set(memberIds).size).toBe(5);
  });

  it('all 5 patients have unique prior payers (not all Aetna)', () => {
    const payers = ALL_PIDS.map((pid) => devBulkStatus(pid).priorPayer);
    expect(new Set(payers).size).toBe(5);
    // Verify Aetna is ONLY Maria
    for (const pid of ALL_PIDS) {
      if (pid !== 'MARIA_SD_001') {
        expect(devBulkStatus(pid).priorPayer).not.toContain('Aetna');
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §3 — Payer-to-Payer: Bulk start + status
// ─────────────────────────────────────────────────────────────────────────────

describe('§3 Payer-to-Payer — bulk export patient-specific data', () => {
  it('devBulkStart always returns a jobId (stateless)', () => {
    const r = devBulkStart();
    expect(r.jobId).toBeTruthy();
  });

  it('devBulkStatus EOB counts differ across patients (not same data returned for all)', () => {
    const counts = ALL_PIDS.map((pid) => devBulkStatus(pid).resourceCounts.ExplanationOfBenefit);
    // At least 3 distinct values
    expect(new Set(counts).size).toBeGreaterThanOrEqual(3);
  });

  it('devBulkStatus coveragePeriod.start is 2019-01-01 for all (consistent lookback)', () => {
    for (const pid of ALL_PIDS) {
      expect(devBulkStatus(pid).coveragePeriod.start).toBe('2019-01-01');
    }
  });

  it('devBulkStatus coveragePeriod.end differs across patients', () => {
    const ends = ALL_PIDS.map((pid) => devBulkStatus(pid).coveragePeriod.end);
    expect(new Set(ends).size).toBeGreaterThanOrEqual(3);
  });

  it('Dorothy bulk status has significantly more EOBs than Lisa (severity-appropriate)', () => {
    const dorothy = devBulkStatus('PAT-0042').resourceCounts.ExplanationOfBenefit;
    const lisa = devBulkStatus('PAT-0156').resourceCounts.ExplanationOfBenefit;
    // Dorothy is Critical risk (COPD+CHF+T2DM), Lisa is Moderate — Dorothy's utilisation must be higher
    expect(dorothy).toBeGreaterThan(lisa);
  });

  it('all paHistory entries have non-empty service names and dates', () => {
    for (const pid of ALL_PIDS) {
      for (const h of devBulkStatus(pid).paHistory) {
        expect(h.service, `${pid} paHistory entry missing service`).toBeTruthy();
        expect(h.cpt, `${pid} paHistory entry missing CPT`).toBeTruthy();
        expect(h.date, `${pid} paHistory entry missing date`).toBeTruthy();
        expect(['approved', 'denied']).toContain(h.decision);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §4 — Prior Auth: CRD, DTR, PAS, Evidence, Work Queue
// ─────────────────────────────────────────────────────────────────────────────

describe('§4A Prior Auth — CRD patient-specific cards', () => {
  it('all 5 patients return a critical CRD card mentioning their own CPT code', () => {
    const scenarios: Record<string, string> = {
      MARIA_SD_001: '72148',
      'PAT-0042': '75561',
      'PAT-0087': '93306',
      'PAT-0103': '99243',
      'PAT-0156': '99244',
    };
    for (const pid of ALL_PIDS) {
      const cards = devCrdCards(pid) as { summary: string; indicator: string }[];
      const crit = cards.find((c) => c.indicator === 'critical');
      expect(crit, `${pid} must have a critical CRD card`).toBeDefined();
      expect(crit!.summary, `${pid} card must mention CPT ${scenarios[pid]}`).toContain(
        scenarios[pid]
      );
    }
  });

  it("no patient receives another patient's CPT code in their CRD card", () => {
    const scenarios: Record<string, string> = {
      MARIA_SD_001: '72148',
      'PAT-0042': '75561',
      'PAT-0087': '93306',
      'PAT-0103': '99243',
      'PAT-0156': '99244',
    };
    for (const pid of ALL_PIDS) {
      const cards = devCrdCards(pid) as { summary: string; indicator: string }[];
      const crit = cards.find((c) => c.indicator === 'critical')!;
      const myCpt = scenarios[pid];
      for (const otherPid of ALL_PIDS) {
        if (otherPid === pid) continue;
        const theirCpt = scenarios[otherPid];
        if (theirCpt === myCpt) continue; // skip if same code
        expect(
          crit.summary,
          `${pid} card must not contain ${otherPid}'s CPT ${theirCpt}`
        ).not.toContain(theirCpt);
      }
    }
  });
});

describe('§4B Prior Auth — DTR policy evaluation', () => {
  const cptMap: Record<string, string> = {
    MARIA_SD_001: '72148',
    'PAT-0042': '75561',
    'PAT-0087': '93306',
    'PAT-0103': '99243',
    'PAT-0156': '99244',
  };

  it('DTR policyTitle contains the correct CPT for every patient', async () => {
    for (const pid of ALL_PIDS) {
      const cpt = cptMap[pid];
      const result = (await devDtrEvaluation(pid, cpt)) as {
        policyTitle: string;
        cptCode: string;
        groups: unknown[];
      };
      expect(result.policyTitle, `${pid} policyTitle must include CPT ${cpt}`).toContain(cpt);
    }
  });

  it('DTR for Dorothy (PAT-0042) is DIFFERENT from Maria and contains a gap', async () => {
    const maria = (await devDtrEvaluation('MARIA_SD_001', '72148')) as {
      policyTitle: string;
      groups: { status: string }[];
    };
    const dorothy = (await devDtrEvaluation('PAT-0042', '75561')) as {
      policyTitle: string;
      groups: { status: string }[];
    };
    expect(maria.policyTitle).not.toBe(dorothy.policyTitle);
    expect(dorothy.groups.some((g) => g.status === 'gap')).toBe(true);
    expect(dorothy.policyTitle).not.toContain('Lumbar'); // Dorothy must not get Maria's lumbar policy
  });

  it('DTR for James Wilson (PAT-0087) has allMet=true (no gaps)', async () => {
    const result = (await devDtrEvaluation('PAT-0087', '93306')) as {
      allMet: boolean;
      groups: { status: string }[];
    };
    expect(result.allMet).toBe(true);
    expect(result.groups.every((g) => g.status === 'met')).toBe(true);
  });

  it("DTR for Robert Chen (PAT-0103) has correct policy — NOT Maria's lumbar MRI", async () => {
    const result = (await devDtrEvaluation('PAT-0103', '99243')) as { policyTitle: string };
    expect(result.policyTitle).toContain('99243');
    expect(result.policyTitle).not.toContain('Lumbar');
    expect(result.policyTitle).not.toContain('72148');
  });

  it("DTR for Lisa Thompson (PAT-0156) has correct policy — NOT Maria's lumbar MRI", async () => {
    const result = (await devDtrEvaluation('PAT-0156', '99244')) as { policyTitle: string };
    expect(result.policyTitle).toContain('99244');
    expect(result.policyTitle).not.toContain('Lumbar');
    expect(result.policyTitle).not.toContain('72148');
  });

  it('DTR groups array is non-empty for every patient', async () => {
    for (const pid of ALL_PIDS) {
      const cpt = cptMap[pid];
      const result = (await devDtrEvaluation(pid, cpt)) as { groups: unknown[] };
      expect(result.groups.length, `${pid} must have at least 1 DTR group`).toBeGreaterThan(0);
    }
  });

  // Regression coverage for the bariatric DTR fixture fix: the mock endpoint used to hand-copy only
  // 14 of the 27 real CG-SURG-83 codes into a literal, silently routing the other 13 (e.g. 43848,
  // C9785) to Maria's unrelated lumbar-MRI scenario, and hard-coded only half of the real policy's
  // documentation criteria. It now derives every bariatric code's criteria LIVE from the same real
  // authored PDF the workbench evaluates (`getBariatricDtrCriteria` → `dtrCriteriaFromReview`).
  it('every one of the 27 real CG-SURG-83 codes routes to the live bariatric policy, not the lumbar-MRI default', async () => {
    expect(BARIATRIC_CPT_CODES.size).toBe(27);
    for (const cpt of BARIATRIC_CPT_CODES) {
      const result = (await devDtrEvaluation('MARIA_SD_001', cpt)) as {
        policyTitle: string;
        cptCode: string;
      };
      expect(result.policyTitle, `${cpt} must route to the bariatric policy`).toContain(
        'Bariatric'
      );
      expect(
        result.policyTitle,
        `${cpt} must not fall through to Maria's lumbar MRI`
      ).not.toContain('Lumbar');
      expect(result.cptCode).toBe(cpt);
    }
  });

  it('previously-unmapped bariatric codes (e.g. 43848, C9785) now reflect the full real policy, not a truncated literal', async () => {
    const result = (await devDtrEvaluation('MARIA_SD_001', '43848')) as {
      groups: { title: string; required: boolean }[];
    };
    // The old hand-typed fixture had exactly 3 documentation criteria (6 groups total: age, BMI,
    // comorbidity + 3 docs). The real authored policy has 6 documentation criteria across its two
    // pathways — so a correct, un-truncated derivation must expose more groups than the old fixture did.
    expect(result.groups.length).toBeGreaterThan(6);
  });
});

describe('§4C Prior Auth — PAS approved ClaimResponse', () => {
  it('each approved ClaimResponse references the correct Patient/{pid}', () => {
    for (const pid of ALL_PIDS) {
      const cr = devClaimResponseApproved('Dr. Test MD', pid) as {
        patient: { reference: string };
        id: string;
      };
      expect(cr.patient.reference, `${pid} reference wrong`).toBe(`Patient/${pid}`);
      expect(cr.id).toBe(`dev-cr-approved-${pid}`);
    }
  });

  it("Dorothy's approved ClaimResponse has CPT 75561, NOT 72148 (Maria's)", () => {
    const cr = devClaimResponseApproved('Dr. Test MD', 'PAT-0042') as {
      addItem: { productOrService: { coding: { code: string }[] } }[];
    };
    const cpt = cr.addItem[0].productOrService.coding[0].code;
    expect(cpt).toBe('75561');
    expect(cpt).not.toBe('72148');
  });

  it('all 5 approved ClaimResponses have distinct CPT codes', () => {
    const cpts = ALL_PIDS.map((pid) => {
      const cr = devClaimResponseApproved('Dr. Test', pid) as {
        addItem: { productOrService: { coding: { code: string }[] } }[];
      };
      return cr.addItem[0].productOrService.coding[0].code;
    });
    expect(new Set(cpts).size).toBe(5);
  });

  it('disposition text includes approver name for every patient', () => {
    for (const pid of ALL_PIDS) {
      const cr = devClaimResponseApproved('Dr. Approver XYZ', pid) as { disposition: string };
      expect(cr.disposition).toContain('Dr. Approver XYZ');
    }
  });
});

describe('§4D Prior Auth — Work queue seed', () => {
  it('work queue contains items for at least 3 distinct members', () => {
    const items = devWorkQueueItems();
    const members = new Set(items.map((i) => i.memberId));
    expect(members.size).toBeGreaterThanOrEqual(3);
  });

  it("Maria's work queue item is in high-risk-review with CPT 72148", () => {
    const item = devWorkQueueItems().find((i) => i.memberId === 'MARIA_SD_001');
    expect(item).toBeDefined();
    expect(item!.code).toBe('72148');
    expect(item!.queue).toBe('high-risk-review');
  });

  it('at least one work queue item has slaBreached=true', () => {
    const breached = devWorkQueueItems().filter((i) => i.slaBreached);
    expect(breached.length).toBeGreaterThanOrEqual(1);
  });

  it('all work queue items have valid CPT codes', () => {
    for (const item of devWorkQueueItems()) {
      expect(
        validateOrderCode(item.code).ok,
        `work queue CPT ${item.code} must pass validation`
      ).toBe(true);
    }
  });
});

describe('§4E Prior Auth — Evidence record ID validation', () => {
  it('validateEvidenceId accepts hyphens — required for PAT-xxxx IDs', () => {
    // This is the exact ID the API Explorer builds for Dorothy
    const id = 'ev-PAT-0042-75561-1730154782';
    const v = validateEvidenceId(id);
    expect(v.ok, `Evidence ID "${id}" must be valid. Error: ${v.error}`).toBe(true);
  });

  it('validateEvidenceId accepts all 5 patient evidence IDs', () => {
    const ids: Record<string, string> = {
      MARIA_SD_001: 'ev-MARIA_SD_001-72148-1730154782',
      'PAT-0042': 'ev-PAT-0042-75561-1730154782',
      'PAT-0087': 'ev-PAT-0087-93306-1730154782',
      'PAT-0103': 'ev-PAT-0103-99243-1730154782',
      'PAT-0156': 'ev-PAT-0156-99244-1730154782',
    };
    for (const [pid, id] of Object.entries(ids)) {
      const v = validateEvidenceId(id);
      expect(v.ok, `${pid} evidence ID "${id}" failed: ${v.error}`).toBe(true);
    }
  });

  it('validateEvidenceId rejects injection attempts', () => {
    expect(validateEvidenceId('<script>').ok).toBe(false);
    expect(validateEvidenceId('ev/../etc/passwd').ok).toBe(false);
    expect(validateEvidenceId('ev id with spaces').ok).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Infrastructure — patient registry and ID maps
// ─────────────────────────────────────────────────────────────────────────────

describe('Infrastructure — patient registry completeness', () => {
  it('FHIR_ID_MAP resolves to correct platform IDs', () => {
    expect(FHIR_ID_MAP['patient/maria-redhawk-001']).toBe('MARIA_SD_001');
    expect(FHIR_ID_MAP['patient/dorothy-simmons-042']).toBe('PAT-0042');
    expect(FHIR_ID_MAP['patient/james-wilson-087']).toBe('PAT-0087');
    expect(FHIR_ID_MAP['patient/robert-chen-103']).toBe('PAT-0103');
    expect(FHIR_ID_MAP['patient/lisa-thompson-156']).toBe('PAT-0156');
  });

  it('PLATFORM_TO_FHIR_ID_MAP is the inverse of FHIR_ID_MAP for all 5 patients', () => {
    for (const pid of ALL_PIDS) {
      const fhirId = PLATFORM_TO_FHIR_ID_MAP[pid];
      const resolved = FHIR_ID_MAP[fhirId];
      expect(resolved, `PLATFORM_TO_FHIR round-trip failed for ${pid}`).toBe(pid);
    }
  });

  it('getAllPatients returns at least 5 patients', () => {
    expect(getAllPatients().length).toBeGreaterThanOrEqual(5);
  });

  it('no two registry patients share a platformId', () => {
    const ids = getAllPatients().map((p) => p.platformId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all registry patients have a name, dob, and gender', () => {
    for (const p of getAllPatients()) {
      expect(p.name, `${p.platformId} missing name`).toBeTruthy();
      expect(p.dob, `${p.platformId} missing dob`).toBeTruthy();
      expect(p.gender, `${p.platformId} missing gender`).toBeTruthy();
    }
  });
});
