/**
 * Plain-node mirror of the seam invariants, so the gate is verifiable without a
 * TS toolchain. `npm run seams:check` runs this.
 *
 *  1. every binding names a tool some agent manifest GRANTS  (no authority creation)
 *  2. the production table fails closed (no silent mock fallback)
 *  3. an MCP binding carrying member references needs a BAA
 *  4. no duplicate bindings; known provider kinds only
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const ADL = join(ROOT, 'src/lib/agents/adl/data');
const SEAMS = join(ROOT, 'src/lib/agents/seams/data');

const granted = new Set();
for (const f of readdirSync(ADL).filter((x) => x.endsWith('.agent.json'))) {
  for (const t of JSON.parse(readFileSync(join(ADL, f), 'utf8')).toolAllowlist) granted.add(t);
}

const failures = [];
const KINDS = new Set(['in-process', 'typed-client', 'mcp']);

for (const file of readdirSync(SEAMS).filter((x) => x.startsWith('tool-bindings.'))) {
  const t = JSON.parse(readFileSync(join(SEAMS, file), 'utf8'));
  if (t.mode !== 'mock' && t.mode !== 'production') failures.push(`${file}: bad mode "${t.mode}"`);
  const seen = new Set();
  for (const b of t.bindings) {
    if (!KINDS.has(b.kind)) failures.push(`${file}: unknown provider kind "${b.kind}"`);
    if (!granted.has(b.tool))
      failures.push(
        `${file}: binds "${b.tool}" which no agent manifest grants — a binding cannot create authority`
      );
    if (seen.has(b.tool)) failures.push(`${file}: "${b.tool}" bound more than once`);
    seen.add(b.tool);
    if (b.phiClass !== 'none' && b.phiClass !== 'references-only')
      failures.push(`${file}: "${b.tool}" bad phiClass "${b.phiClass}"`);
    if (b.kind === 'mcp') {
      if (!b.pinnedToolHash)
        failures.push(`${file}: MCP binding "${b.tool}" has no pinnedToolHash`);
      if (b.phiClass !== 'none' && b.baaOnFile !== true)
        failures.push(
          `${file}: MCP binding "${b.tool}" carries member references with no BAA on file`
        );
      if (b.transport !== 'stdio' && b.transport !== 'streamable-http')
        failures.push(`${file}: MCP binding "${b.tool}" unsupported transport "${b.transport}"`);
    }
  }
  if (t.mode === 'production' && t.bindings.length === 0) {
    // expected: production ships unbound and fails closed at resolve time
  }
}

const prod = JSON.parse(readFileSync(join(SEAMS, 'tool-bindings.production.json'), 'utf8'));
const unbound = [...granted].filter((t) => !prod.bindings.some((b) => b.tool === t));

if (failures.length) {
  console.error('SEAMS CHECK FAILED');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `SEAMS CHECK PASSED — ${granted.size} granted tools; production has ${prod.bindings.length} binding(s), ` +
    `${unbound.length} granted tool(s) will FAIL CLOSED until bound at deployment`
);
