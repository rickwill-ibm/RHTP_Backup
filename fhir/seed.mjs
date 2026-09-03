#!/usr/bin/env node
/**
 * Seed the local HAPI FHIR server with the demo bundles.
 *
 * Usage:  node fhir/seed.mjs [--base http://localhost:8080/fhir]
 *
 * The same bundle JSON files are imported by the app as mock-mode fixtures
 * (src/lib/fhir/fixtures), so mock and live modes render identical patients.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const baseArg = process.argv.indexOf('--base');
const FHIR_BASE =
  baseArg > -1 ? process.argv[baseArg + 1] : process.env.FHIR_BASE_URL ?? 'http://localhost:8080/fhir';

const seedDir = join(__dirname, 'seed');
const files = readdirSync(seedDir).filter((f) => f.endsWith('.bundle.json'));

if (files.length === 0) {
  console.error('No *.bundle.json files found in fhir/seed');
  process.exit(1);
}

console.log(`Seeding ${files.length} bundle(s) → ${FHIR_BASE}`);

// Resource types where an existing server record is canonical (e.g. RHTP's
// migrated patients) — never overwrite these if they already exist.
const PRESERVE_IF_EXISTS = new Set(['Patient', 'Practitioner', 'CareTeam', 'Coverage']);

async function resourceExists(resourceType, id) {
  try {
    const res = await fetch(`${FHIR_BASE}/${resourceType}/${id}`, {
      headers: { Accept: 'application/fhir+json' },
    });
    return res.ok;
  } catch {
    return false;
  }
}

for (const file of files) {
  const bundle = JSON.parse(readFileSync(join(seedDir, file), 'utf8'));
  // Filter out entries that would overwrite canonical existing records
  const kept = [];
  let skipped = 0;
  for (const entry of bundle.entry ?? []) {
    const r = entry.resource;
    if (r && PRESERVE_IF_EXISTS.has(r.resourceType) && (await resourceExists(r.resourceType, r.id))) {
      skipped += 1;
      continue;
    }
    kept.push(entry);
  }
  bundle.entry = kept;
  process.stdout.write(
    `  ${file} (${kept.length} resources${skipped ? `, ${skipped} preserved existing` : ''}) ... `,
  );
  try {
    const res = await fetch(FHIR_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/fhir+json', Accept: 'application/fhir+json' },
      body: JSON.stringify(bundle),
    });
    if (!res.ok) {
      const text = await res.text();
      console.log(`FAILED (${res.status})`);
      console.error(text.slice(0, 500));
      process.exitCode = 1;
    } else {
      console.log('OK');
    }
  } catch (err) {
    console.log('FAILED');
    console.error(`  Could not reach ${FHIR_BASE} — is the HAPI server running?`);
    console.error(`  ${err.message}`);
    process.exitCode = 1;
  }
}
