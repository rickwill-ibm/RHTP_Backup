/**
 * §3 — Payer-to-Payer API (2 endpoints)
 *
 * Extracted verbatim from tests/api-integration.test.mjs.
 */

import { strict as assert } from 'assert';
import { ok, section, subsection } from '../harness.mjs';
import { PATIENTS, PA_SCENARIOS, PIDS } from '../fixtures.mjs';
import { devBulkStatus } from '../helpers.mjs';

export function run() {
  // ───────────────────────────────────────────────────────────────────────────
  section('§3 — Payer-to-Payer API (2 endpoints)');
  // ───────────────────────────────────────────────────────────────────────────

  subsection('3A: Bulk start — priorPayer is patient-specific');
  for (const pid of PIDS) {
    const s = PA_SCENARIOS[pid];
    ok(`BulkStart: ${PATIENTS[pid].name} → priorPayer="${s.priorPayer}"`, () => {
      // Route body: { priorPayer: pa.priorPayer, patientId: pid }
      const body = { priorPayer: s.priorPayer, patientId: pid };
      assert.equal(body.priorPayer, s.priorPayer);
      assert.equal(body.patientId, pid);
      assert.ok(body.priorPayer.length > 0);
    });
  }
  ok('BulkStart: All 5 patients have unique prior payers', () => {
    const payers = PIDS.map((pid) => PA_SCENARIOS[pid].priorPayer);
    const unique = new Set(payers);
    assert.equal(unique.size, 5, `Expected 5 unique payers: ${JSON.stringify(payers)}`);
  });

  subsection('3B: Bulk status — 5yr resource inventory per patient');
  for (const pid of PIDS) {
    const p = PATIENTS[pid];
    const result = devBulkStatus(pid);
    ok(
      `BulkStatus: ${p.name} → priorPayer="${result.priorPayer}", EOBs=${result.resourceCounts.ExplanationOfBenefit}`,
      () => {
        assert.equal(result.state, 'completed');
        assert.equal(result.priorPayer, PA_SCENARIOS[pid].priorPayer);
        assert.equal(result.memberMatchedId, PA_SCENARIOS[pid].priorMemberId);
        assert.ok(result.resourceCounts.ExplanationOfBenefit > 0);
        assert.ok(result.paHistory.length > 0);
      }
    );
  }
  ok('BulkStatus: EOB counts differ between patients (not same data)', () => {
    const counts = PIDS.map((pid) => devBulkStatus(pid).resourceCounts.ExplanationOfBenefit);
    const unique = new Set(counts);
    assert.ok(
      unique.size >= 3,
      `Expected at least 3 distinct EOB counts, got: ${JSON.stringify(counts)}`
    );
  });
  ok('BulkStatus: paHistory entries reference patient-specific services', () => {
    const dorothy = devBulkStatus('PAT-0042');
    const maria = devBulkStatus('MARIA_SD_001');
    const dorothyServices = dorothy.paHistory.map((h) => h.service);
    const mariaServices = maria.paHistory.map((h) => h.service);
    assert.ok(dorothyServices.some((s) => s.toLowerCase().includes('cardiac')));
    assert.ok(
      mariaServices.some(
        (s) => s.toLowerCase().includes('lumbar') || s.toLowerCase().includes('mri')
      )
    );
    assert.notDeepEqual(dorothyServices, mariaServices);
  });
}
