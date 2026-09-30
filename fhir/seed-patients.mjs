#!/usr/bin/env node
/**
 * seed-patients.mjs — Seeds the whole-person patient bundles into HAPI FHIR.
 *
 * Usage:  node fhir/seed-patients.mjs [--base http://localhost:8080/fhir]
 *
 * Each bundle's Patient entry is converted from POST (urn:uuid) to
 * PUT (Patient/<correct-id>) so the Patient resource lands at the ID
 * the RHTP registry expects (PLATFORM_TO_FHIR_ID_MAP).
 *
 * ID map (bundle Patient.id → canonical FHIR ID):
 *   denise-fontaine → patient-denise-fontaine
 *   dorothy-simmons → patient-dorothy-042
 *   james-wilson    → patient-james-087
 *   alex-kirby      → patient-alex-kirby
 *   lisa-thompson   → patient-lisa-156
 *   robert-chen     → patient-robert-103
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const baseArg = process.argv.indexOf('--base');
const FHIR_BASE =
  baseArg > -1
    ? process.argv[baseArg + 1]
    : (process.env.FHIR_BASE_URL ?? 'http://localhost:8080/fhir');

const patientsDir = join(__dirname, 'seed', 'patients');
const files = readdirSync(patientsDir).filter((f) => f.endsWith('.bundle.json'));

if (files.length === 0) {
  console.error('No *.bundle.json files found in fhir/seed/patients');
  process.exit(1);
}

console.log(`Seeding ${files.length} patient bundle(s) → ${FHIR_BASE}`);

for (const file of files) {
  const bundle = JSON.parse(readFileSync(join(patientsDir, file), 'utf8'));
  let patientId = null;
  let patientFullUrl = null;

  // Find the Patient entry and extract its canonical id
  for (const entry of bundle.entry ?? []) {
    const r = entry.resource;
    if (r?.resourceType === 'Patient') {
      patientId = r.id;
      patientFullUrl = entry.fullUrl;
      // Force the entry to PUT at the correct ID instead of POST
      entry.request = { method: 'PUT', url: `Patient/${patientId}` };
      entry.fullUrl = `Patient/${patientId}`;
      break;
    }
  }

  if (!patientId) {
    console.log(`  SKIP ${file} — no Patient resource found`);
    continue;
  }

  // Fix up any remaining entries that reference the old urn:uuid fullUrl
  // so internal references resolve correctly after the Patient id is fixed
  if (patientFullUrl && patientFullUrl !== `Patient/${patientId}`) {
    const raw = JSON.stringify(bundle);
    const fixed = raw.replaceAll(patientFullUrl, `Patient/${patientId}`);
    Object.assign(bundle, JSON.parse(fixed));
  }

  process.stdout.write(
    `  ${file} (Patient.id: ${patientId}, ${bundle.entry.length} resources) ... `
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
      console.error('  ' + text.slice(0, 400));
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
