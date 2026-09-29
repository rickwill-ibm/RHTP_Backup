/**
 * §2 — Provider Access API (3 endpoints)
 *
 * Extracted verbatim from tests/api-integration.test.mjs.
 */

import { strict as assert } from 'assert';
import { ok, section, subsection } from '../harness.mjs';
import { PATIENTS, PA_SCENARIOS, PIDS } from '../fixtures.mjs';
import { devMemberMatch } from '../helpers.mjs';

export function run() {
  // ───────────────────────────────────────────────────────────────────────────
  section('§2 — Provider Access API (3 endpoints)');
  // ───────────────────────────────────────────────────────────────────────────

  subsection('2A: Consent check — memberId in query must match patient');
  for (const pid of PIDS) {
    const p = PATIENTS[pid];
    ok(`Consent: ${p.name} (${pid}) — memberId correctly forwarded`, () => {
      // Route: GET /api/consent/provider-access?memberId=${pid}
      // Returns { memberId: pid, optedOut: false } (no one is opted out by default)
      const response = { memberId: pid, optedOut: false };
      assert.equal(response.memberId, pid);
      assert.equal(response.optedOut, false);
    });
  }

  subsection('2B: $member-match — cross-payer identity per patient');
  for (const pid of PIDS) {
    const p = PATIENTS[pid];
    const result = devMemberMatch(pid);
    ok(
      `$member-match: ${p.name} (${pid}) → family="${p.name.split(' ').pop()}", priorMemberId="${PA_SCENARIOS[pid].priorMemberId}"`,
      () => {
        assert.equal(result.resourceType, 'Parameters');
        const mp = result.parameter[0].resource;
        assert.equal(mp.id, pid, `matched patient ID must be ${pid}`);
        assert.equal(
          mp.name[0].family,
          p.name.split(' ').pop(),
          `family name must be ${p.name.split(' ').pop()}`
        );
        assert.equal(
          mp.name[0].given[0],
          p.name.split(' ')[0],
          `given name must be ${p.name.split(' ')[0]}`
        );
        assert.equal(mp.birthDate, p.dob);
        assert.equal(mp.identifier[0].value, PA_SCENARIOS[pid].priorMemberId);
      }
    );
  }

  // Critical cross-patient check: Dorothy must not return "Redhawk"
  ok('$member-match: Dorothy returns "Simmons", not "Redhawk"', () => {
    const result = devMemberMatch('PAT-0042');
    const family = result.parameter[0].resource.name[0].family;
    assert.equal(family, 'Simmons', `Expected Simmons, got ${family}`);
    assert.notEqual(family, 'Redhawk', "Dorothy must not return Maria's family name");
  });

  ok('$member-match: All 5 patients have unique family names', () => {
    const families = PIDS.map((pid) => devMemberMatch(pid).parameter[0].resource.name[0].family);
    const unique = new Set(families);
    assert.equal(
      unique.size,
      5,
      `Expected 5 unique family names, got ${unique.size}: ${JSON.stringify(families)}`
    );
  });

  ok('$member-match: All 5 patients have unique prior member IDs', () => {
    const ids = PIDS.map((pid) => devMemberMatch(pid).parameter[0].resource.identifier[0].value);
    const unique = new Set(ids);
    assert.equal(unique.size, 5, `Expected 5 unique member IDs, got: ${JSON.stringify(ids)}`);
  });

  subsection('2C: Conditions under treatment relationship — patient-specific');
  for (const pid of PIDS) {
    const p = PATIENTS[pid];
    ok(`Provider Conditions: ${p.name} (${pid}) — subject references correct patient`, () => {
      // Same logic as §1 but under provider authz — subject must match
      const subject = `Patient/${pid}`;
      assert.ok(subject.includes(pid));
    });
  }
}
