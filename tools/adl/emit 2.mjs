/**
 * The regenerator. `assertNoDrift` tells a developer to "regenerate, do not
 * hand-edit"; this is the thing that regenerates. It is the forward projection
 * — definitions in, the two committed authority artifacts out — and it runs the
 * authority lock FIRST, so it can never be used to launder a widening into the
 * artifacts: an emit that would exceed the lock refuses and writes nothing.
 *
 *   node tools/adl/emit.mjs            # write the artifacts
 *   node tools/adl/emit.mjs --check    # exit non-zero if they would change
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileFromDisk, MANIFEST, ROUTING } from './compile.mjs';

const check = process.argv.includes('--check');
const { manifestJson, routingJson, failures, defs } = compileFromDisk(process.cwd());

if (failures.length) {
  console.error('ADL EMIT REFUSED — the authority lock rejected the definitions:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

let changed = false;
for (const [path, next] of [
  [MANIFEST, manifestJson],
  [ROUTING, routingJson],
]) {
  const current = readFileSync(join(process.cwd(), path), 'utf8');
  if (current === next) continue;
  changed = true;
  if (check) console.error(`  - ${path} would change`);
  else {
    writeFileSync(join(process.cwd(), path), next);
    console.log(`  wrote ${path}`);
  }
}

if (check && changed) {
  console.error('ADL EMIT CHECK FAILED — run: npm run adl:emit');
  process.exit(1);
}
console.log(
  changed
    ? `ADL EMIT — regenerated from ${defs.length} definitions`
    : `ADL EMIT — already current (${defs.length} definitions)`
);
