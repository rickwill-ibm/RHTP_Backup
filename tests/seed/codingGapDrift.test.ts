/**
 * Coding-gap DRIFT GUARD.
 *
 * The committed seed bundles (`fhir/seed/patients/*.bundle.json`) are hand-maintained
 * and the generator (`tools/seed/gen-patient-bundles.mjs`) ALSO authors the Da Vinci-RA
 * coding gaps from its `CODING_GAPS` matrix. The two must never silently diverge — if
 * someone edits ONE and not the OTHER, this fails.
 *
 * BIDIRECTIONAL by construction: it iterates the UNION of the matrix slugs and the
 * committed bundle files, so a gap dropped from the matrix (bundle keeps it), a gap
 * added to a bundle with no matrix row, or a whole new patient bundle are all caught —
 * not just matrix-side edits.
 *
 * It compares the SEMANTIC gap fields — model version, HCC code + display, evidence
 * status, suspect type, hierarchical status, and the evidence's resolved ICD codes — as
 * an order-independent set per patient. It ignores only what legitimately churns every
 * regeneration: the random `fullUrl`/`evaluatedResource` UUIDs (the evidence is compared
 * by the *resolved Condition ICD*, not the ref string), `evidenceStatusDate`, and order.
 *
 * Importing `CODING_GAPS` is side-effect-free: the generator lazy-loads fhir-state and
 * runs its write-the-bundles driver only under a realpath main-guard, never on import.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'fs';
// Only the CODING_GAPS data object is read here (see the module's main-guard).
import { CODING_GAPS } from '../../tools/seed/gen-patient-bundles.mjs';

interface GapSpec {
  ver: string;
  hcc: string;
  disp: string;
  status: string;
  suspect: string;
  hier: string;
  ev: string[];
}
const MATRIX = CODING_GAPS as Record<string, GapSpec[]>;
const DIR = 'fhir/seed/patients';

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** A gap rendered as a stable, order-independent comparison key. */
function key(g: {
  ver: string;
  hcc: string;
  disp: string;
  status: string;
  suspect: string;
  hier: string;
  evIcds: string[];
}): string {
  return [
    g.ver,
    g.hcc,
    g.disp,
    g.status,
    g.suspect,
    g.hier || '',
    [...g.evIcds].sort().join(','),
  ].join('|');
}

/** The coding-gap set actually present in the committed bundle ([] if the file is absent). */
function committedGapKeys(slug: string): string[] {
  const path = `${DIR}/${slug}.bundle.json`;
  if (!existsSync(path)) return [];
  const bundle = JSON.parse(readFileSync(path, 'utf8'));
  // index every Condition in the bundle by its id, to resolve evidence refs -> ICD.
  const icdById = new Map<string, string>();
  for (const entry of arr(bundle.entry)) {
    const r = obj(obj(entry).resource);
    if (str(r.resourceType) === 'Condition') {
      icdById.set(str(r.id), str(obj((obj(r.code).coding as unknown[])?.[0]).code));
    }
  }
  const out: string[] = [];
  for (const entry of arr(bundle.entry)) {
    const r = obj(obj(entry).resource);
    if (str(r.resourceType) !== 'MeasureReport') continue;
    const group = obj(arr(r.group)[0]);
    const coding = obj(arr(obj(group.code).coding)[0]);
    const ext: Record<string, string> = {};
    for (const e of arr(group.extension)) {
      const x = obj(e);
      const name = str(x.url).split('/').pop() ?? '';
      ext[name] =
        str(obj(arr(x.valueCodeableConcept && obj(x.valueCodeableConcept).coding)[0]).code) ||
        str(x.valueDate);
    }
    // evidence ICDs = the ICD codes of the cited Condition refs (Encounter refs ignored).
    const evIcds: string[] = [];
    for (const er of arr(r.evaluatedResource)) {
      const ref = str(obj(er).reference);
      if (!ref.startsWith('Condition/')) continue;
      const icd = icdById.get(ref.split('/').pop() ?? '');
      if (icd) evIcds.push(icd);
    }
    out.push(
      key({
        ver: str(r.measure).split('|')[1] ?? '',
        hcc: str(coding.code),
        disp: str(coding.display),
        status: ext['ra-evidenceStatus'],
        suspect: ext['ra-suspectType'],
        hier: ext['ra-hierarchicalStatus'],
        evIcds,
      })
    );
  }
  return out.sort();
}

/** The coding-gap set the generator would author from CODING_GAPS. */
function expectedGapKeys(slug: string): string[] {
  return (MATRIX[slug] ?? [])
    .map((g) =>
      key({
        ver: g.ver,
        hcc: g.hcc,
        disp: g.disp,
        status: g.status,
        suspect: g.suspect,
        hier: g.hier,
        // matrix `ev` is already the list of evidence ICD codes (Encounter is `enc`, not ev).
        evIcds: g.ev ?? [],
      })
    )
    .sort();
}

// UNION of matrix slugs and committed bundle files — so drift is caught in BOTH
// directions (a matrix row without a bundle gap, OR a bundle gap without a matrix row).
const bundleSlugs = readdirSync(DIR)
  .filter((f) => f.endsWith('.bundle.json'))
  .map((f) => f.replace('.bundle.json', ''));
const ALL_SLUGS = [...new Set([...Object.keys(MATRIX), ...bundleSlugs])].sort();

describe('coding-gap drift guard: committed bundles === generator CODING_GAPS', () => {
  it('the generator import is side-effect-free (CODING_GAPS is a plain data object)', () => {
    expect(MATRIX).toBeTruthy();
    expect(Object.keys(MATRIX).length).toBeGreaterThan(0);
  });

  for (const slug of ALL_SLUGS) {
    it(`${slug}: committed coding-gap set matches the generator matrix (both directions)`, () => {
      expect(committedGapKeys(slug)).toEqual(expectedGapKeys(slug));
    });
  }
});
