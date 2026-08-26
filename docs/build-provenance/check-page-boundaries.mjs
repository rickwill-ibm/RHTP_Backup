#!/usr/bin/env node
// check-page-boundaries.mjs — shift-left companion to E16 (build/bundle-resolution gate).
// Catches, in SECONDS at commit time, the page-level build-breaker classes that otherwise
// only surface in the slow `next build` (E16) in CI. Dependency-free (Node fs + regex).
//
// Classes (each a real failure this repo hit):
//   A) a page.tsx calling useSearchParams() with no <Suspense> in the file
//      -> "useSearchParams() should be wrapped in a suspense boundary" prerender bailout.
//   B) a src/app file importing a HEAVY Node-only package not in serverExternalPackages
//      -> bundler tries to bundle it and a transitive dep fails (e.g. newman -> terser).
//   C) a src/app file importing a Node builtin (fs/path/net/...) without runtime='nodejs'
//      -> compiled for edge/client and fails to resolve the builtin.
//
// Usage: node docs/build-provenance/check-page-boundaries.mjs [srcAppDir] [nextConfig]
// Exit 1 with a report on any finding; 0 if clean.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const APP_DIR = process.argv[2] || 'src/app';
const NEXT_CONFIG = process.argv[3] || 'next.config.mjs';

const HEAVY_NODE_PKGS = [
  'newman',
  'pg',
  'pg-native',
  'neo4j-driver',
  'mongodb',
  'mysql2',
  'ioredis',
  'testcontainers',
  'playwright',
  '@playwright/test',
  'puppeteer',
];
const NODE_BUILTINS = [
  'fs',
  'fs/promises',
  'path',
  'os',
  'net',
  'tls',
  'dns',
  'child_process',
  'crypto',
  'http',
  'http2',
  'https',
  'zlib',
  'worker_threads',
];

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const p = join(dir, name);
    let s;
    try {
      s = statSync(p);
    } catch {
      continue;
    }
    if (s.isDirectory()) out.push(...walk(p));
    else if (/\.(t|j)sx?$/.test(name)) out.push(p);
  }
  return out;
}

const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;

let externals = [];
try {
  const cfg = readFileSync(NEXT_CONFIG, 'utf8');
  const m = cfg.match(/serverExternalPackages\s*:\s*\[([^\]]*)\]/);
  if (m) externals = [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
} catch {
  /* no config -> empty allowlist */
}

const findings = [];
const files = walk(APP_DIR);

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const isPage = /(^|\/)page\.tsx$/.test(file);
  const head = src.slice(0, 200);
  const isClient = /['"]use client['"]/.test(head);
  const isEdge = /runtime\s*=\s*['"]edge['"]/.test(src);

  const _pdir = file.slice(0, Math.max(0, file.lastIndexOf('/')));
  const _hasLoading =
    existsSync(join(_pdir, 'loading.tsx')) || existsSync(join(_pdir, 'loading.jsx'));
  if (isPage && /\buseSearchParams\s*\(/.test(src) && !/\bSuspense\b/.test(src) && !_hasLoading) {
    const idx = src.search(/\buseSearchParams\s*\(/);
    findings.push({
      file,
      line: lineOf(src, idx),
      cls: 'A',
      msg: 'useSearchParams() with no <Suspense> in this page - static prerender will bail out.',
      fix: 'Move the body into an inner component and wrap the default export in <Suspense fallback={...}>.',
    });
  }

  const importRe = /(?:import[^'"]*from\s*|require\(\s*)['"]([^'"]+)['"]/g;
  let mm;
  while ((mm = importRe.exec(src))) {
    const pkg = mm[1];
    if (HEAVY_NODE_PKGS.includes(pkg) && !externals.includes(pkg)) {
      findings.push({
        file,
        line: lineOf(src, mm.index),
        cls: 'B',
        msg: `heavy Node-only package '${pkg}' imported in src/app but not in serverExternalPackages.`,
        fix: `Add '${pkg}' to serverExternalPackages in ${NEXT_CONFIG} (and set runtime='nodejs' on the route).`,
      });
    }
    if (NODE_BUILTINS.includes(pkg) && (isClient || isEdge)) {
      findings.push({
        file,
        line: lineOf(src, mm.index),
        cls: 'C',
        msg: `Node builtin '${pkg}' imported in a client/edge file - will fail to resolve in that bundle.`,
        fix: `Move the Node-only code to a nodejs route/server seam, or drop runtime='edge'; client code cannot import Node builtins.`,
      });
    }
  }
}

if (findings.length === 0) {
  console.log(
    `page-boundaries: OK (${files.length} files scanned, 0 findings) - E16 shift-left clean`
  );
  process.exit(0);
}
console.error(
  `page-boundaries: ${findings.length} finding(s) - these WILL fail \`next build\` (E16):\n`
);
for (const f of findings) {
  console.error(`  [${f.cls}] ${f.file}:${f.line}`);
  console.error(`      ${f.msg}`);
  console.error(`      fix: ${f.fix}\n`);
}
process.exit(1);
