/**
 * One-off inverse projection: committed manifest + routing -> *.agent.json
 * definitions + authority-lock.json. Run once to bootstrap the ADL so the
 * generated artifacts equal the committed ones by construction.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const MANIFEST = join(ROOT, 'src/lib/agents/manifest/data/agent-manifests.json');
const ROUTING = join(ROOT, 'src/lib/agents/dispatch/data/agent-routing.json');
const OUT = join(ROOT, 'src/lib/agents/adl/data');
const FIXTURES = join(ROOT, 'tests/agents/adl/fixtures');

const sortValue = (v) =>
  Array.isArray(v)
    ? v.map(sortValue)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, sortValue(v[k])])
        )
      : v;
const stable = (v) => `${JSON.stringify(sortValue(v), null, 2)}\n`;

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const routing = JSON.parse(readFileSync(ROUTING, 'utf8'));

// Snapshot the ORIGINAL committed content as test fixtures, so a later test can
// prove the canonical rewrite changed formatting only, never semantics.
writeFileSync(join(FIXTURES, 'original-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(join(FIXTURES, 'original-routing.json'), JSON.stringify(routing, null, 2) + '\n');

const routesByAgent = new Map();
for (const r of routing.routes) {
  const { agentId, ...rest } = r;
  if (!routesByAgent.has(agentId)) routesByAgent.set(agentId, []);
  routesByAgent.get(agentId).push(rest);
}

const lockEntries = [];
for (const a of manifest.agents) {
  const def = {
    id: a.id,
    version: a.version,
    purpose: a.purpose,
    autonomyTier: a.autonomyTier,
    escalationPolicyRef: a.escalationPolicyRef,
    phiPosture: a.phiPosture,
    owningModule: a.owningModule,
    toolAllowlist: a.toolAllowlist,
    routes: routesByAgent.get(a.id) ?? [],
    body: { kind: 'module', owningModule: a.owningModule },
  };
  writeFileSync(join(OUT, `${a.id}.agent.json`), stable(def));
  lockEntries.push({
    agentId: a.id,
    tools: [...a.toolAllowlist].sort(),
    maxAutonomyTier: a.autonomyTier,
    maxPhiPosture: a.phiPosture,
    escalationPolicyRef: a.escalationPolicyRef,
  });
}

writeFileSync(
  join(OUT, 'authority-lock.json'),
  stable({
    version: '1.0.0',
    entries: lockEntries.sort((x, y) => x.agentId.localeCompare(y.agentId)),
  })
);

// Rewrite the generated artifacts in canonical form (formatting only).
const compiledManifest = {
  version: manifest.version,
  agents: [...manifest.agents].sort((x, y) => x.id.localeCompare(y.id)),
};
const compiledRouting = {
  version: routing.version,
  routes: [...manifest.agents]
    .sort((x, y) => x.id.localeCompare(y.id))
    .flatMap((a) => (routesByAgent.get(a.id) ?? []).map((r) => ({ ...r, agentId: a.id }))),
};
writeFileSync(MANIFEST, stable(compiledManifest));
writeFileSync(ROUTING, stable(compiledRouting));

console.log(
  `definitions: ${manifest.agents.length}  routes: ${compiledRouting.routes.length}  lock entries: ${lockEntries.length}`
);
