#!/usr/bin/env node
// genSkillMirror.mjs — generate (or --check) the .claude/skills project-skill mirror of the
// Agentic Build Framework, so any dev who opens the repo auto-loads it in-session with NO
// manual install. Single source of truth = docs/framework/*.md; this mirror is DERIVED.
// "A convention without a gate is a suggestion": the --check mode is wired into ci-gates.sh
// (fast tier) so the mirror can never silently drift from the source docs.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const SRC = 'docs/framework';
const DEST = '.claude/skills/agentic-build-framework';
const MAP = [
  ['SKILL.md', 'SKILL.md'],
  ['personas.md', 'references/personas.md'],
  ['operating-model.md', 'references/operating-model.md'],
  ['enforcement-kit.md', 'references/enforcement-kit.md'],
];

const check = process.argv.includes('--check');
let drift = 0;
for (const [s, d] of MAP) {
  const src = readFileSync(join(SRC, s), 'utf8');
  const destPath = join(DEST, d);
  if (check) {
    const cur = existsSync(destPath) ? readFileSync(destPath, 'utf8') : null;
    if (cur !== src) {
      console.error(`DRIFT: ${destPath} != ${join(SRC, s)}`);
      drift = 1;
    }
  } else {
    mkdirSync(dirname(destPath), { recursive: true });
    writeFileSync(destPath, src);
    console.log(`wrote ${destPath}`);
  }
}
if (check) {
  if (drift) {
    console.error('skill-mirror: DRIFT - run `npm run gen:skill` and commit the mirror.');
    process.exit(1);
  }
  console.log('skill-mirror: in sync with docs/framework');
  process.exit(0);
}
console.log('skill-mirror: generated .claude/skills/agentic-build-framework');
