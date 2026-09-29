/**
 * Cross-Patient Uniqueness Checks
 *
 * Extracted verbatim from tests/api-integration.test.mjs.
 */

import { strict as assert } from 'assert';
import { ok, section } from '../harness.mjs';
import { PATIENTS, PA_SCENARIOS, PIDS } from '../fixtures.mjs';
import { devCrdCards } from '../helpers.mjs';

export function run() {
  // ───────────────────────────────────────────────────────────────────────────
  section('Cross-Patient Uniqueness Checks');
  // ───────────────────────────────────────────────────────────────────────────

  ok('All 5 patients have unique names', () => {
    const names = PIDS.map((pid) => PATIENTS[pid].name);
    const unique = new Set(names);
    assert.equal(unique.size, 5, `Names: ${JSON.stringify(names)}`);
  });
  ok('All 5 patients have unique CPT codes', () => {
    const cpts = PIDS.map((pid) => PA_SCENARIOS[pid].cptCode);
    const unique = new Set(cpts);
    assert.equal(unique.size, 5, `CPTs: ${JSON.stringify(cpts)}`);
  });
  ok('All 5 patients have unique prior payers', () => {
    const payers = PIDS.map((pid) => PA_SCENARIOS[pid].priorPayer);
    const unique = new Set(payers);
    assert.equal(unique.size, 5, `Payers: ${JSON.stringify(payers)}`);
  });
  ok('All 5 patients have unique DOBs', () => {
    const dobs = PIDS.map((pid) => PATIENTS[pid].dob);
    const unique = new Set(dobs);
    assert.equal(unique.size, 5, `DOBs: ${JSON.stringify(dobs)}`);
  });
  ok('No patient name contains "Redhawk" except Maria', () => {
    for (const pid of PIDS) {
      if (pid !== 'MARIA_SD_001') {
        assert.ok(
          !PATIENTS[pid].name.includes('Redhawk'),
          `${PATIENTS[pid].name} must not contain Redhawk`
        );
      }
    }
  });
  ok('No patient CRD card mentions wrong CPT code', () => {
    for (const pid of PIDS) {
      const cards = devCrdCards(pid);
      const expectedCpt = PA_SCENARIOS[pid].cptCode;
      const critCard = cards.find((c) => c.indicator === 'critical');
      assert.ok(
        critCard.summary.includes(expectedCpt),
        `${PATIENTS[pid].name} card must mention ${expectedCpt}, got: ${critCard.summary}`
      );
      // Check no OTHER patient's CPT leaks in
      for (const otherPid of PIDS) {
        if (otherPid === pid) continue;
        const otherCpt = PA_SCENARIOS[otherPid].cptCode;
        if (otherCpt !== expectedCpt) {
          assert.ok(
            !critCard.summary.includes(otherCpt),
            `${PATIENTS[pid].name} card must NOT mention ${otherCpt} (${PATIENTS[otherPid].name}'s CPT)`
          );
        }
      }
    }
  });
}
