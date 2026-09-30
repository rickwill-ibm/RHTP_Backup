#!/usr/bin/env node
/**
 * check-client-bundle.mjs — does any `'use client'` page reach a Node builtin THROUGH the import
 * graph? The hole that let a broken build ship.
 *
 * WHY THIS EXISTS. `check-page-boundaries.mjs` already has a class C — "a src/app file importing a
 * Node builtin" — and it reported `OK (264 files scanned, 0 findings)` while `next build` was
 * failing with:
 *
 *   UnhandledSchemeError: Reading from "node:crypto" is not handled by plugins
 *   node:crypto → src/lib/dataSources/submissionGateway.ts → src/lib/dataSources/index.ts
 *              → src/app/cbo-directory/cboDirectory.data.ts → src/app/cbo-directory/page.tsx
 *
 * Class C scans DIRECT imports in `src/app` files only. Not one link in that chain is a direct
 * `node:crypto` import from `src/app`; the builtin is three hops away, behind a BARREL in `src/lib`
 * that re-exports a server-only module beside client-safe ones. So the gate was structurally
 * incapable of seeing the failure it was written to shift left, and the repo's authoritative answer
 * — `next build` — is not in `check:all`. Nothing between a developer and CI could catch this.
 *
 * WHAT MAKES THIS LEG DIFFERENT. It is derived from the code's ACTUAL IMPORTS, walked transitively,
 * rather than from a declaration or a direct-import regex. A new barrel export, a new leaf that
 * imports a builtin, or a new client page reaching an old one all fail here without anyone updating
 * a list. That is the standing lesson of this programme applied to the one gate class that had it
 * backwards.
 *
 * WHY IT IS A RATCHET AND NOT A HARD FAIL — the first cut of this gate was WRONG and this paragraph
 * is the correction. It reported two findings against a tree that BUILDS GREEN, because webpack
 * tree-shakes a barrel re-export whose value is never actually used. A gate that goes red on a
 * passing build is worse than no gate: the next person disables it, which is precisely the
 * self-detonating-gate failure this programme's own adversarial rounds keep finding.
 *
 * So what it reports is LATENT risk, not breakage: a client entry whose import chain reaches a
 * builtin and survives only because nothing along it is used as a value. Add one value import to
 * that chain and the build dies the way `cbo-directory` did. The count is baselined and may only
 * improve.
 *
 * THE AUTHORITATIVE GATE IS `next build`, and the real hole was that it was not in `check:all` —
 * E16 is named as a CI gate in CLAUDE.md while the chain a developer actually runs never built the
 * app. `check:build` is now in that chain, ahead of `lint`, so it runs.
 *
 * WHAT IT DOES NOT CLAIM. It resolves `@/` and relative TypeScript imports only, and it does not
 * model tree-shaking, so its count is an UPPER bound on real risk. A builtin reached through a
 * node_modules package is out of scope — `check-page-boundaries.mjs` class B covers the heavy
 * package case. This is about OUR OWN graph, which is where the defect was.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const ROOT = process.cwd();
const APP = join(ROOT, process.argv[2] || 'src/app');
const SRC = join(ROOT, 'src');

/** Bare specifiers that cannot exist in a browser bundle. `node:`-prefixed is the modern spelling. */
const BUILTIN =
  /^(node:|fs$|fs\/|path$|os$|crypto$|net$|tls$|http$|https$|zlib$|child_process$|worker_threads$|perf_hooks$|stream$|buffer$|util$|dns$|v8$|vm$)/;

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)[\s\S]{0,400}?from\s+['"]([^'"]+)['"]/g;
const SIDE_EFFECT_RE = /(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g;

function walkFiles(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walkFiles(p, out);
    else if (/\.(ts|tsx)$/.test(e) && !/\.d\.ts$/.test(e)) out.push(p);
  }
  return out;
}

function specifiers(file) {
  const src = readFileSync(file, 'utf8');
  const out = [];
  for (const re of [IMPORT_RE, SIDE_EFFECT_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) out.push(m[1]);
  }
  return out;
}

/** Resolve one specifier to a file in OUR tree, or null when it is a package / unresolvable. */
function resolveLocal(spec, fromFile) {
  let base;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
  else return null;
  for (const cand of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}

const rel = (p) => p.replace(`${ROOT}/`, '');

/** Depth-first from one client entry; returns the first import chain that reaches a builtin. */
function findBuiltinPath(entry) {
  const seen = new Set();
  const stack = [{ file: entry, chain: [entry] }];
  while (stack.length > 0) {
    const { file, chain } = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of specifiers(file)) {
      if (BUILTIN.test(spec)) return { builtin: spec, chain: [...chain] };
      const next = resolveLocal(spec, file);
      if (next && !seen.has(next)) stack.push({ file: next, chain: [...chain, next] });
    }
  }
  return null;
}

function main() {
  const appFiles = walkFiles(APP);
  const clientEntries = appFiles.filter((f) =>
    /^\s*(['"])use client\1/m.test(readFileSync(f, 'utf8').slice(0, 400))
  );

  if (clientEntries.length === 0) {
    console.error(
      'client-bundle: found NO "use client" entries — refusing to report a green zero.'
    );
    process.exit(2); // an empty read is a failure, never a pass
  }

  const findings = [];
  for (const entry of clientEntries) {
    const hit = findBuiltinPath(entry);
    if (hit) findings.push({ entry, ...hit });
  }

  console.log(
    `client-bundle: ${clientEntries.length} "use client" entr${clientEntries.length === 1 ? 'y' : 'ies'} walked transitively through src/.`
  );
  if (findings.length === 0) {
    console.log(
      'client-bundle: OK — no client entry reaches a Node builtin through our own graph.'
    );
    return;
  }
  const BASELINE = 'docs/build-provenance/client-bundle-baseline.json';
  const base = existsSync(join(ROOT, BASELINE))
    ? JSON.parse(readFileSync(join(ROOT, BASELINE), 'utf8'))
    : { latentEntries: 0 };
  const baseline = Number(base.latentEntries ?? 0);

  console.log(
    `client-bundle: ${findings.length} client entr(ies) reach a Node builtin through our graph ` +
      `(baseline ${baseline}). These build green today only because webpack tree-shakes them.`
  );
  for (const f of findings) {
    console.error(`\n  ${f.builtin}`);
    for (const step of [...f.chain].reverse()) console.error(`    ← ${rel(step)}`);
    console.error(
      '    FIX: import the LEAF module directly instead of a barrel that also re-exports server-only code.'
    );
  }
  if (findings.length > baseline) {
    console.error(
      `\nFAIL: latent client-bundle risk rose (${baseline} -> ${findings.length}). ` +
        'Each of these is one value import away from breaking `next build`.'
    );
    process.exit(1);
  }
  if (findings.length < baseline) {
    console.log(`\nPROGRESS: ${baseline} -> ${findings.length}. Lock the gain in ${BASELINE}.`);
  }
  console.log(
    '\nOK — baseline held or improved. `next build` (check:build) is the authoritative gate.'
  );
}

main();
