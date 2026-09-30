#!/usr/bin/env node
/**
 * TERMINOLOGY REGISTRY FRESHNESS - a maintenance alarm, deliberately NOT a push gate.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT IN ci-gates.sh. On 2026-09-30 a behaviour test asserted a
 * clock-dependent fact (`icd-10-cm-fy2026` is the active ICD-10-CM asset) and failed on the last
 * day of that asset's window, against byte-identical code, blocking a push. Two fixes followed:
 * `inWindow` now compares civil dates so a closed interval is actually closed, and that test now
 * pins a fixed clock.
 *
 * But the test was ALSO doing something useful by accident - it was the only thing that noticed
 * the registry has no successor seeded past 2026-09-30. Pinning it would have removed the
 * detector along with the defect, and left the suite green while the registry rotted. So the
 * question the failure was really asking moved HERE, where it is answered against the real clock
 * and reported, and where a calendar date can never again block a commit.
 *
 * Run it on a schedule (or before a demo), not in the pre-push path:
 *   npm run check:terminology-freshness
 *
 * Exit 1 on findings so a scheduled job can alert. Nothing in scripts/ci-gates.sh calls it, and
 * nothing should: that is the whole point. A control whose failure blocks unrelated work gets
 * disabled, and a disabled control is the defect class this repo keeps finding.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SEED = join('src', 'lib', 'terminology', 'registry', 'data', 'terminology-assets.json');
const HORIZON_DAYS = 90;
const DAY_MS = 86_400_000;

/** Civil-date frame, matching valueSetRegistry.ts exactly (UTC, lexicographic). */
const dayOf = (d) => d.toISOString().slice(0, 10);
const civil = (iso) => String(iso).slice(0, 10);
const plusDays = (d, n) => new Date(d.getTime() + n * DAY_MS);

function collectAssets(node, out = []) {
  if (Array.isArray(node)) {
    for (const v of node) collectAssets(v, out);
  } else if (node && typeof node === 'object') {
    if (typeof node.id === 'string' && typeof node.system === 'string') out.push(node);
    for (const v of Object.values(node)) collectAssets(v, out);
  }
  return out;
}

const inWindow = (a, day) =>
  day >= civil(a.effectiveDate) && (!a.expirationDate || day <= civil(a.expirationDate));

const assets = collectAssets(JSON.parse(readFileSync(SEED, 'utf8')));
const today = dayOf(new Date());
const horizon = dayOf(plusDays(new Date(), HORIZON_DAYS));
const systems = [...new Set(assets.map((a) => a.system))].sort();

const findings = [];

// 1. An asset declared `active` whose window has already lapsed. Stored status and the calendar
//    are two sources of truth for one fact; this is where they drift apart.
for (const a of assets) {
  if (a.status === 'active' && a.expirationDate && today > civil(a.expirationDate)) {
    findings.push(`LAPSED   ${a.id} is status:'active' but expired ${civil(a.expirationDate)}`);
  }
}

// 2. A system with no active in-window asset TODAY. Under posture 'enforce' this quarantines
//    every code in that system (currency.ts -> noActiveVersion), which is correct fail-closed
//    behaviour and still something an operator must know about before a demo.
for (const sys of systems) {
  const group = assets.filter((a) => a.system === sys);
  if (!group.some((a) => a.status === 'active' && inWindow(a, today))) {
    findings.push(`NO-ACTIVE ${sys} has no active in-window asset as of ${today}`);
  }
}

// 3. A system that loses coverage inside the horizon. This is the one the blocked push was
//    really reporting: FY2026 expires and no successor is seeded. It is a LEAD TIME warning,
//    which is exactly why it must not be a gate - the answer is to load real steward content,
//    and that is work, not a commit-time decision.
for (const sys of systems) {
  const group = assets.filter((a) => a.system === sys);
  if (!group.some((a) => a.status === 'active' && inWindow(a, horizon))) {
    const last = group
      .filter((a) => a.expirationDate)
      .map((a) => civil(a.expirationDate))
      .sort()
      .pop();
    findings.push(
      `EXPIRING ${sys} has no coverage at ${horizon} (+${HORIZON_DAYS}d); last window ends ${last ?? '(none)'}`
    );
  }
}

console.log(
  `terminology freshness - ${assets.length} assets, ${systems.length} systems, as of ${today}`
);
if (findings.length === 0) {
  console.log(`  OK - every system has an active in-window asset today and at +${HORIZON_DAYS}d.`);
  process.exit(0);
}
for (const f of findings) console.log(`  ${f}`);
console.log(
  `\n${findings.length} finding(s). These do NOT block a commit or a push by design - load real` +
    ` steward content for the expiring systems, or record the gap in the risk register.`
);
process.exit(1);
