#!/usr/bin/env node
// Registry-driven de-attribution sweep.
//
// Wave 1 de-attributed three screens BY HAND and the same real names survived in 30+
// other files, so the demo showed one organisation under two names one click apart.
// This tool exists so the substitution is applied from ONE place — the canonical
// registry at src/lib/dataSources/data/synthetic-entities.seed.json — instead of by
// more hand-edits.
//
//   node tools/deattribution/sweep.mjs --check   # report, change nothing
//   node tools/deattribution/sweep.mjs --write   # apply
//
// HOMOGRAPH CARVE-OUT (load-bearing, do not remove without reading the note below):
// the string 'Bennett County Health' has THREE referents in this repo. In the RHTP
// South Dakota corpus it is a clinic — the entity this registry renames. But inside
// src/uhg/** and src/app/uhg-orchestrate/** an earlier de-attribution pass find/replaced
// a physician persona ('Dr. Chen') AND an enterprise entity ('Optum Health') to the same
// string, leaving sentences like "Bennett County Health spent 8 minutes ... He
// discontinued a duplicate therapy" and "how many Bennett County Healths are still
// working blind". Renaming those would read as a hospital being called "he" and would
// cement a defect that belongs to a different owner. Proof the carve-out is real:
// generateTalkTrackPDF.ts still labels the beat 'INTERNAL UHG/OPTUM FRAGMENTATION',
// storyNarrative.maria.json still says '"persona": "Primary Care Physician — Dr. Chen"',
// and agentData.ts still carries `id: 'optumrx-gate'` beside `label: 'Martin Pharmacy'`.
// Every OTHER entity (Winner Regional, Avera, ...) IS swept in those trees, because
// there it genuinely is the South Dakota organisation.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { relative, resolve } from 'node:path';

const REPO = resolve(import.meta.dirname, '..', '..');
const REGISTRY = resolve(REPO, 'src/lib/dataSources/data/synthetic-entities.seed.json');

/** Old strings whose substitution is restricted to the non-UHG trees. */
const HOMOGRAPH_PREFIX = 'Bennett County Health';
const HOMOGRAPH_EXCLUDED = [/^src\/uhg\//, /^src\/app\/uhg-orchestrate\//];

/** Files that own the substitution itself, so they legitimately contain old names. */
const REGISTRY_OWNED = [
  'src/lib/dataSources/data/synthetic-entities.seed.json',
  'src/lib/dataSources/syntheticEntities.ts',
  'tests/dataSources/syntheticEntities.test.ts',
  'tools/deattribution/sweep.mjs',
];

/** Scratch trees the repo-hygiene rule says are never committed (AGENTS.md). */
const SKIPPED = [/_to_delete_samples\//];

function loadPairs() {
  const seed = JSON.parse(readFileSync(REGISTRY, 'utf8'));
  const pairs = [];
  for (const entity of seed.entities) {
    for (const old of entity.oldNames) pairs.push([old, entity.name]);
  }
  for (const [old, next] of Object.entries(seed.variantSubstitutions)) pairs.push([old, next]);
  const { phones, domains, streets } = seed.contactSubstitutions;
  for (const group of [streets, phones, domains]) {
    for (const [old, next] of Object.entries(group)) pairs.push([old, next]);
  }
  // Longest old string first: 'Avera Sacred Heart CAH — BH' must beat 'Avera Sacred Heart'.
  return pairs.sort((a, b) => b[0].length - a[0].length);
}

function candidateFiles() {
  const out = execFileSync(
    'git',
    ['ls-files', '-co', '--exclude-standard', 'src', 'tests', 'e2e'],
    { cwd: REPO, encoding: 'utf8' }
  );
  return out.split('\n').filter(Boolean);
}

function listFilesFallback() {
  const out = execFileSync(
    'find',
    [
      'src',
      'tests',
      'e2e',
      '-type',
      'f',
      '(',
      '-name',
      '*.ts',
      '-o',
      '-name',
      '*.tsx',
      '-o',
      '-name',
      '*.mjs',
      '-o',
      '-name',
      '*.js',
      '-o',
      '-name',
      '*.json',
      ')',
    ],
    { cwd: REPO, encoding: 'utf8' }
  );
  return out.split('\n').filter(Boolean);
}

function escapeRegExp(literal) {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Word-boundary-aware matcher. A bare stem like 'Avera' must not match inside
 * 'Average', and 'Bennett County Health' must not match inside 'Bennett County
 * Healths'. Boundaries are added only on the sides where the literal actually ends in
 * a word character, so '(605) 685-6622' and 'Avera Sacred Heart CAH — BH' still match.
 */
function matcherFor(old) {
  const head = /^[A-Za-z0-9]/.test(old) ? '(?<![A-Za-z0-9])' : '';
  const tail = /[A-Za-z0-9]$/.test(old) ? '(?![A-Za-z0-9])' : '';
  return new RegExp(`${head}${escapeRegExp(old)}${tail}`, 'g');
}

function applicablePairs(relPath, pairs) {
  const inUhg = HOMOGRAPH_EXCLUDED.some((re) => re.test(relPath));
  if (!inUhg) return pairs;
  return pairs.filter(([old]) => !old.startsWith(HOMOGRAPH_PREFIX));
}

function sweep({ write }) {
  const pairs = loadPairs();
  let files;
  try {
    files = candidateFiles();
  } catch {
    files = listFilesFallback();
  }
  const touched = [];
  let totalReplacements = 0;

  for (const relPath of files) {
    if (REGISTRY_OWNED.includes(relPath)) continue;
    if (SKIPPED.some((re) => re.test(relPath))) continue;
    const abs = resolve(REPO, relPath);
    let text;
    try {
      text = readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    let next = text;
    let count = 0;
    for (const [old, replacement] of applicablePairs(relPath, pairs)) {
      if (!next.includes(old)) continue;
      const matches = next.match(matcherFor(old));
      if (!matches) continue;
      next = next.replace(matcherFor(old), replacement);
      count += matches.length;
    }
    if (count > 0) {
      touched.push([relPath, count]);
      totalReplacements += count;
      if (write) writeFileSync(abs, next);
    }
  }

  touched.sort((a, b) => b[1] - a[1]);
  for (const [relPath, count] of touched) {
    process.stdout.write(`${String(count).padStart(5)}  ${relPath}\n`);
  }
  process.stdout.write(
    `\n${write ? 'APPLIED' : 'WOULD APPLY'} ${totalReplacements} replacements across ` +
      `${touched.length} files (${pairs.length} substitution pairs in registry)\n`
  );
  return touched.length;
}

const write = process.argv.includes('--write');
if (!write && !process.argv.includes('--check')) {
  process.stderr.write('usage: sweep.mjs --check | --write\n');
  process.exit(2);
}
sweep({ write });
