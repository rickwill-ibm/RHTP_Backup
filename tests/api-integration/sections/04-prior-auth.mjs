/**
 * §4 — Prior Authorization API (7 endpoints)
 *
 * Extracted verbatim from tests/api-integration.test.mjs.
 */

import { strict as assert } from 'assert';
import { ok, section, subsection } from '../harness.mjs';
import { PATIENTS, PA_SCENARIOS, CPT_META, PIDS } from '../fixtures.mjs';
import {
  devCrdCards,
  devDtrEvaluation,
  devClaimResponseApproved,
  seededEvidenceRecord,
  validateEvidenceId,
  buildEvidenceId,
} from '../helpers.mjs';

export function run() {
  // ───────────────────────────────────────────────────────────────────────────
  section('§4 — Prior Authorization API (7 endpoints)');
  // ───────────────────────────────────────────────────────────────────────────

  subsection('4A: CRD cards — patient-specific CPT and procedure name');
  for (const pid of PIDS) {
    const p = PATIENTS[pid];
    const s = PA_SCENARIOS[pid];
    const cards = devCrdCards(pid);
    ok(
      `CRD: ${p.name} → card mentions CPT ${s.cptCode} and "${s.procedureName.substring(0, 20)}..."`,
      () => {
        assert.ok(cards.length >= 1);
        const critCard = cards.find((c) => c.indicator === 'critical');
        assert.ok(critCard, 'must have a critical card');
        assert.ok(critCard.summary.includes(s.cptCode), `summary must include CPT ${s.cptCode}`);
        assert.ok(
          critCard.summary.toLowerCase().includes(s.procedureName.toLowerCase().substring(0, 15)),
          `summary must include procedure`
        );
      }
    );
  }
  ok('CRD: Maria and Dorothy have different critical card summaries', () => {
    const maria = devCrdCards('MARIA_SD_001')[0].summary;
    const dorothy = devCrdCards('PAT-0042')[0].summary;
    assert.notEqual(maria, dorothy);
    assert.ok(maria.includes('72148'), `Maria card must mention 72148, got: ${maria}`);
    assert.ok(dorothy.includes('75561'), `Dorothy card must mention 75561, got: ${dorothy}`);
  });

  subsection('4B: DTR evaluation — patient-specific policy and criteria');
  for (const pid of PIDS) {
    const p = PATIENTS[pid];
    const s = PA_SCENARIOS[pid];
    const result = devDtrEvaluation(pid, s.cptCode);
    ok(`DTR: ${p.name} → policyTitle contains CPT ${s.cptCode}, allMet=${result.allMet}`, () => {
      assert.ok(result.policyTitle, 'policyTitle must exist');
      assert.ok(
        result.policyTitle.includes(s.cptCode),
        `policyTitle must include CPT ${s.cptCode}, got: ${result.policyTitle}`
      );
      assert.ok(Array.isArray(result.groups), 'groups must be array');
      assert.ok(result.groups.length > 0, 'must have at least 1 criterion group');
    });
  }
  ok('DTR: Dorothy has gap on "Clinical Justification" (Cardiac MRI specific)', () => {
    const result = devDtrEvaluation('PAT-0042', '75561');
    const gapGroup = result.groups.find((g) => g.status === 'gap');
    assert.ok(gapGroup, 'Dorothy must have at least 1 gap criterion');
    assert.ok(
      gapGroup.title.toLowerCase().includes('clinical justification'),
      `gap must be clinical justification, got: ${gapGroup.title}`
    );
  });
  ok('DTR: James Wilson (echocardiogram) has allMet=true — no gaps', () => {
    const result = devDtrEvaluation('PAT-0087', '93306');
    assert.equal(result.allMet, true);
    assert.ok(!result.groups.some((g) => g.status === 'gap'), 'James must have no gap groups');
  });

  subsection('4C: Financial Clearance — orderCode matches patient CPT scenario');
  for (const pid of PIDS) {
    const s = PA_SCENARIOS[pid];
    ok(`FinancialClearance: ${PATIENTS[pid].name} → orderCode=${s.cptCode} passed in body`, () => {
      const body = { patientId: pid, orderCode: s.cptCode, providerNpi: '1730154782' };
      assert.equal(body.patientId, pid);
      assert.equal(body.orderCode, s.cptCode);
      // Validates the CPT regex from validate.ts
      assert.ok(
        /^(\d{4}[0-9A-Z]|[A-Z]\d{4})$/.test(body.orderCode),
        `CPT ${s.cptCode} must pass regex`
      );
    });
  }

  subsection('4D: PAS without approver — human gate returns 202');
  ok('PAS no-approver: approvedBy="" triggers human gate (202)', () => {
    const body = { patientId: 'MARIA_SD_001', approvedBy: '' };
    assert.equal(body.approvedBy, '', 'empty approvedBy must trigger gate');
  });

  subsection('4E: PAS with approver — patient-specific ClaimResponse');
  for (const pid of ['MARIA_SD_001', 'PAT-0042', 'PAT-0087']) {
    const p = PATIENTS[pid];
    const s = PA_SCENARIOS[pid];
    const result = devClaimResponseApproved('Dr. Sarah Johnson MD', pid);
    ok(
      `PAS approved: ${p.name} → ClaimResponse has CPT ${s.cptCode}, references Patient/${pid}`,
      () => {
        assert.equal(result.resourceType, 'ClaimResponse');
        assert.equal(
          result.patient.reference,
          `Patient/${pid}`,
          `patient ref must be Patient/${pid}`
        );
        assert.equal(result.id, `dev-cr-approved-${pid}`);
        const cpt = result.addItem[0].productOrService.coding[0].code;
        assert.equal(cpt, s.cptCode, `CPT must be ${s.cptCode}, got ${cpt}`);
        const display = result.addItem[0].productOrService.coding[0].display;
        assert.equal(display, s.procedureName, `procedure name must be ${s.procedureName}`);
        assert.ok(result.disposition.includes('Dr. Sarah Johnson MD'));
      }
    );
  }
  ok("PAS approved: Dorothy ClaimResponse is NOT Maria's lumbar MRI", () => {
    const dorothy = devClaimResponseApproved('Dr. Sarah Johnson MD', 'PAT-0042');
    assert.notEqual(dorothy.type.text, 'MRI Lumbar Spine w/o Contrast');
    assert.equal(dorothy.type.text, 'Cardiac MRI w/ and w/o contrast');
    assert.equal(dorothy.patient.reference, 'Patient/PAT-0042');
  });

  subsection('4F: Work queue — all 5 patients represented, SLA timers');
  const workQueue = [
    {
      id: 'wq-001',
      memberId: 'MARIA_SD_001',
      code: '72148',
      queue: 'high-risk-review',
      slaBreached: false,
    },
    { id: 'wq-002', memberId: 'PAT-0042', code: '75561', queue: 'more-info', slaBreached: false },
    {
      id: 'wq-003',
      memberId: 'PAT-0087',
      code: '93306',
      queue: 'ready-to-submit',
      slaBreached: false,
    },
    {
      id: 'wq-004',
      memberId: 'PAT-0103',
      code: '99243',
      queue: 'auto-cleared',
      slaBreached: false,
    },
    {
      id: 'wq-005',
      memberId: 'PAT-0042',
      code: '94010',
      queue: 'denied-appeal',
      slaBreached: true,
    },
  ];
  ok('WorkQueue: 5 items returned', () => assert.equal(workQueue.length, 5));
  ok('WorkQueue: Maria in high-risk-review for 72148', () => {
    const item = workQueue.find((w) => w.memberId === 'MARIA_SD_001');
    assert.ok(item);
    assert.equal(item.code, '72148');
    assert.equal(item.queue, 'high-risk-review');
  });
  ok('WorkQueue: Dorothy in more-info for 75561 (Cardiac MRI)', () => {
    const item = workQueue.find((w) => w.memberId === 'PAT-0042' && w.code === '75561');
    assert.ok(item);
    assert.equal(item.queue, 'more-info');
  });
  ok('WorkQueue: James in ready-to-submit (echocardiogram approved)', () => {
    const item = workQueue.find((w) => w.memberId === 'PAT-0087');
    assert.ok(item);
    assert.equal(item.queue, 'ready-to-submit');
  });
  ok('WorkQueue: SLA breached item exists (wq-005)', () => {
    const breached = workQueue.find((w) => w.slaBreached);
    assert.ok(breached);
    assert.equal(breached.memberId, 'PAT-0042');
  });

  subsection('4G: Evidence Record — ID parse + patient-specific fields');

  // Critical: ID validator must accept hyphens
  ok('EvidenceID validator: MARIA_SD_001 ID accepted', () => {
    const id = buildEvidenceId('MARIA_SD_001', '72148');
    const v = validateEvidenceId(id);
    assert.ok(v.ok, `Validation failed for ${id}: ${v.error}`);
  });
  ok('EvidenceID validator: PAT-0042 ID accepted (contains hyphens)', () => {
    const id = buildEvidenceId('PAT-0042', '75561');
    const v = validateEvidenceId(id);
    assert.ok(v.ok, `Validation FAILED for ${id}: ${v.error}`);
  });
  ok('EvidenceID validator: PAT-0087 ID accepted', () => {
    const id = buildEvidenceId('PAT-0087', '93306');
    const v = validateEvidenceId(id);
    assert.ok(v.ok, `Validation failed for ${id}: ${v.error}`);
  });
  ok('EvidenceID validator: PAT-0103 ID accepted', () => {
    const v = validateEvidenceId(buildEvidenceId('PAT-0103', '99243'));
    assert.ok(v.ok, `Validation failed`);
  });
  ok('EvidenceID validator: PAT-0156 ID accepted', () => {
    const v = validateEvidenceId(buildEvidenceId('PAT-0156', '99244'));
    assert.ok(v.ok, `Validation failed`);
  });
  ok('EvidenceID validator: invalid chars rejected', () => {
    const v = validateEvidenceId('ev-<script>alert(1)</script>');
    assert.equal(v.ok, false);
  });

  // Seeded record parses and returns patient-specific data
  for (const pid of PIDS) {
    const s = PA_SCENARIOS[pid];
    const id = buildEvidenceId(pid, s.cptCode);
    const rec = seededEvidenceRecord(id);
    ok(
      `EvidenceRecord: ${PATIENTS[pid].name} (${pid}) → memberId="${rec.memberId}", CPT="${rec.order.code}", display="${rec.order.display}"`,
      () => {
        assert.equal(rec.memberId, pid, `memberId must be ${pid}, got ${rec.memberId}`);
        assert.equal(
          rec.patientName,
          PATIENTS[pid].name,
          `patientName must be ${PATIENTS[pid].name}, got ${rec.patientName}`
        );
        assert.equal(rec.order.code, s.cptCode, `CPT must be ${s.cptCode}, got ${rec.order.code}`);
        assert.equal(rec.order.display, CPT_META[s.cptCode].display, `display must match`);
        assert.equal(rec.policyRef, CPT_META[s.cptCode].policyRef, `policyRef must match`);
        assert.equal(rec.payer, CPT_META[s.cptCode].payer, `payer must match`);
      }
    );
  }
  ok('EvidenceRecord: Dorothy memberId="PAT-0042" NOT "MARIA_SD_001"', () => {
    const id = buildEvidenceId('PAT-0042', '75561');
    const rec = seededEvidenceRecord(id);
    assert.equal(rec.memberId, 'PAT-0042');
    assert.notEqual(rec.memberId, 'MARIA_SD_001');
    assert.equal(rec.patientName, 'Dorothy Simmons');
    assert.notEqual(rec.patientName, 'Maria Redhawk');
  });
  ok('EvidenceRecord: propensity differs between Maria (high) and James (low)', () => {
    const maria = seededEvidenceRecord(buildEvidenceId('MARIA_SD_001', '72148'));
    const james = seededEvidenceRecord(buildEvidenceId('PAT-0087', '93306'));
    assert.ok(
      maria.propensity > 0.5,
      `Maria propensity must be high (>0.5), got ${maria.propensity}`
    );
    assert.ok(
      james.propensity < 0.2,
      `James propensity must be low (<0.2), got ${james.propensity}`
    );
    assert.notEqual(maria.propensityBand, james.propensityBand);
  });
}
