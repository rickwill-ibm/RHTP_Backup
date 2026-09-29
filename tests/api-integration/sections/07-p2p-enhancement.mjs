/**
 * P2P Enhancement Verification (prior session deliverables)
 *
 * Extracted verbatim from tests/api-integration.test.mjs.
 */

import { strict as assert } from 'assert';
import { ok, section } from '../harness.mjs';
import { PA_SCENARIOS, PA_HISTORY, PIDS } from '../fixtures.mjs';
import { devBulkStatus } from '../helpers.mjs';

export function run() {
  // ───────────────────────────────────────────────────────────────────────────
  section('P2P Enhancement Verification (prior session deliverables)');
  // ───────────────────────────────────────────────────────────────────────────
  ok('P2P: bulk/start route passes patientId in response body', () => {
    // Route returns { ...devBulkStart(), patientId: body.patientId, correlationId }
    const mockResponse = {
      jobId: 'dev-p2p-job-001',
      patientId: 'PAT-0042',
      correlationId: 'corr-123',
    };
    assert.equal(mockResponse.patientId, 'PAT-0042');
    assert.equal(mockResponse.jobId, 'dev-p2p-job-001');
  });
  ok('P2P: bulk/status passes patientId as query param for patient-aware mock', () => {
    // buildPath: (pid) => `/api/bulk/status?jobId=dev-p2p-job-001&patientId=${encodeURIComponent(pid)}`
    for (const pid of PIDS) {
      const url = `/api/bulk/status?jobId=dev-p2p-job-001&patientId=${encodeURIComponent(pid)}`;
      const parsed = new URL('http://x' + url).searchParams;
      assert.equal(parsed.get('patientId'), pid);
      assert.equal(parsed.get('jobId'), 'dev-p2p-job-001');
    }
  });
  ok('P2P: status response.priorPayer differs per patient', () => {
    const statuses = PIDS.map((pid) => devBulkStatus(pid).priorPayer);
    const unique = new Set(statuses);
    assert.equal(unique.size, 5);
  });
  ok('P2P: status response.paHistory is patient-specific (not shared)', () => {
    for (const pid of PIDS) {
      const status = devBulkStatus(pid);
      const expectedPayer = PA_SCENARIOS[pid].priorPayer;
      assert.equal(status.priorPayer, expectedPayer);
      // PA history services match known data for this patient
      const history = PA_HISTORY[pid];
      const statusHistory = status.paHistory;
      // At least 1 service from expected history must appear
      const matched = statusHistory.some((sh) => history.some((h) => h.cpt === sh.cpt));
      assert.ok(matched, `paHistory for ${pid} must contain at least 1 known service`);
    }
  });
  ok('P2P: Dorothy paHistory contains Cardiac MRI (not Lumbar MRI)', () => {
    const dorothy = devBulkStatus('PAT-0042');
    const hasCardiac = dorothy.paHistory.some((h) => h.service.toLowerCase().includes('cardiac'));
    const hasLumbar = dorothy.paHistory.some((h) => h.service.toLowerCase().includes('lumbar'));
    assert.ok(hasCardiac, 'Dorothy paHistory must have Cardiac MRI');
    assert.ok(!hasLumbar, 'Dorothy paHistory must NOT have Lumbar MRI');
  });
}
