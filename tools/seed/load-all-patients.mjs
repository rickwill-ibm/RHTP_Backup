#!/usr/bin/env node
/**
 * Load every generated patient transaction Bundle into a FHIR R4 server.
 *
 * Usage:
 *   FHIR_BASE=http://localhost:8090/fhir \
 *   [BEARER=<token>] \
 *   node tools/seed/load-all-patients.mjs
 *
 * Defaults to the local HAPI backbone (npm run backbone:up → :8090).
 * POSTs each Bundle as a FHIR `transaction`; prints per-bundle HTTP status and
 * the count of created resources. Node 18+ (global fetch).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(__dirname, '../../fhir/seed/patients');
const base = (process.env.FHIR_BASE || 'http://localhost:8090/fhir').replace(/\/$/, '');
const bearer = process.env.BEARER || '';
const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'));

let ok = 0,
  fail = 0;
for (const m of manifest) {
  const bundle = JSON.parse(readFileSync(path.resolve(__dirname, '../..', m.file), 'utf8'));
  process.stdout.write(`→ ${m.slug} (${m.entries} entries) … `);
  try {
    const res = await fetch(base, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/fhir+json',
        Accept: 'application/fhir+json',
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify(bundle),
    });
    const text = await res.text();
    if (!res.ok) {
      console.log(`HTTP ${res.status}\n${text.slice(0, 400)}`);
      fail++;
      continue;
    }
    let created = 0;
    try {
      const rb = JSON.parse(text);
      created = (rb.entry || []).filter(
        (e) =>
          (e.response?.status || '').startsWith('201') ||
          (e.response?.status || '').startsWith('200')
      ).length;
    } catch {}
    console.log(`OK (HTTP ${res.status}, ${created} resources created)`);
    ok++;
  } catch (err) {
    console.log(`ERROR ${err.message}`);
    fail++;
  }
}
console.log(`\nLoaded ${ok}/${manifest.length} bundles${fail ? ` · ${fail} failed` : ''}.`);
process.exit(fail ? 1 : 0);
