/**
 * The ADL gate. Runs the two checks that must both pass:
 *   1. AUTHORITY LOCK (security) — compiled authority is within the separately
 *      reviewed lock. The compiler can narrow, never widen.
 *   2. DRIFT (consistency) — the committed artifacts equal the compiled bytes,
 *      so a generated authority file cannot be hand-edited.
 *
 * Byte-equality alone proves nothing (widen the allowlist, regenerate, pass) —
 * which is why gate 1 exists and is checked against the lock, not against self.
 * `npm run adl:check` runs this.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileFromDisk, MANIFEST, ROUTING } from './compile.mjs';

const root = process.cwd();
const { defs, lock, manifestJson, routingJson, failures } = compileFromDisk(root);

// Only compare when the authority gates passed. A failed gate produces NO
// artifacts, and reporting "differs from compile" on top of the real refusal
// would bury the reason under a symptom.
if (failures.length === 0) {
  if (manifestJson !== readFileSync(join(root, MANIFEST), 'utf8'))
    failures.push(
      'agent-manifests.json differs from compile(definitions) — run npm run adl:emit, do not hand-edit'
    );
  if (routingJson !== readFileSync(join(root, ROUTING), 'utf8'))
    failures.push(
      'agent-routing.json differs from compile(definitions) — run npm run adl:emit, do not hand-edit'
    );
}

if (failures.length) {
  console.error('ADL CHECK FAILED');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
const routeCount = defs.reduce((n, d) => n + (d.routes?.length ?? 0), 0);
console.log(
  `ADL CHECK PASSED — ${defs.length} definitions, ${lock.entries.length} lock entries, ` +
    `${routeCount} routes in authored precedence, manifest + routing byte-identical`
);
