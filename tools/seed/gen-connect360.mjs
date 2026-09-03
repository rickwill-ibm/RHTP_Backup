/**
 * gen-connect360.mjs — generate the Connect360 (UUIDv4 + PUT) seed bundles.
 *
 * Two-state seed: the traditional bundles at fhir/seed/patients/*.bundle.json
 * (human-readable slug ids, POST) are the preexisting pipeline and are NEVER touched.
 * This driver reads them and writes a SEPARATE Connect360 projection into
 * fhir/seed/patients/connect360/ (resource.id = UUIDv4, PUT-as-create) for the
 * Connect360 FHIR server, which accepts only UUIDv4 ids and upserts by id.
 *
 * The projection is a pure deterministic function of the committed traditional
 * bundles (see tools/seed/lib/connect360Transform.mjs), so the committed
 * connect360/ output can be regenerated and byte-verified — that is exactly what the
 * drift guard (tests/seed/connect360.test.ts) does.
 *
 * Run:  node tools/seed/gen-connect360.mjs      (npm run seed:connect360)
 * After ANY intentional change to a traditional bundle, re-run this so the
 * Connect360 projection tracks it (the drift guard fails otherwise).
 */

import { readFileSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformBundle } from './lib/connect360Transform.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const SRC_DIR = path.join(ROOT, 'fhir/seed/patients');
const OUT_DIR = path.join(SRC_DIR, 'connect360');

/**
 * Build the Connect360 projection in memory. Pure w.r.t. the on-disk traditional
 * bundles — no writes. Returned in manifest order so callers (driver + drift guard)
 * see a stable sequence.
 * @returns {{ pid:string, slug:string, file:string, bundle:object }[]}
 */
export function buildConnect360() {
  const manifest = JSON.parse(readFileSync(path.join(SRC_DIR, 'manifest.json'), 'utf8'));
  return manifest.map((m) => {
    const traditional = JSON.parse(readFileSync(path.join(ROOT, m.file), 'utf8'));
    return { pid: m.pid, slug: m.slug, file: m.file, bundle: transformBundle(traditional) };
  });
}

function resourceTypeCounts(bundle) {
  const counts = {};
  for (const e of bundle.entry) {
    const t = e.resource.resourceType;
    counts[t] = (counts[t] || 0) + 1;
  }
  return counts;
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  mkdirSync(OUT_DIR, { recursive: true });
  const manifest = [];
  for (const { pid, slug, bundle } of buildConnect360()) {
    const outFile = path.join(OUT_DIR, `${slug}.bundle.json`);
    writeFileSync(outFile, JSON.stringify(bundle, null, 2));
    manifest.push({
      pid,
      slug,
      file: `fhir/seed/patients/connect360/${slug}.bundle.json`,
      entries: bundle.entry.length,
      resourceTypes: resourceTypeCounts(bundle),
      idScheme: 'uuidv4',
      requestMethod: 'PUT',
      derivedFrom: `fhir/seed/patients/${slug}.bundle.json`,
    });
    console.log(`✔ connect360 ${slug}: ${bundle.entry.length} entries (uuidv4/PUT)`);
  }
  writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(
    `Wrote ${manifest.length} Connect360 bundles + manifest.json to fhir/seed/patients/connect360/`
  );
}
