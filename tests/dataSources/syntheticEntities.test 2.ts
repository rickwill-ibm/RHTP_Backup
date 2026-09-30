// Canonical synthetic-entity registry — shape, contact-safety and repo-wide coherence.
//
// Wave 1 de-attributed three screens by hand and the same real names survived in 30+
// other files, so a click moved between two names for one organisation. The registry
// fixed that; THIS test is what stops it coming back: the coherence case walks src/,
// tests/ and e2e/ and fails if any retired real name reappears anywhere outside the
// registry's own provenance fields.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, type Dirent } from 'node:fs';
import { join } from 'node:path';
import {
  SYNTHETIC_ENTITIES,
  entityName,
  entityShortName,
  substitutionPairs,
  retiredStrings,
} from '@/lib/dataSources';
import { MO_CBOS, ANCHOR_CBO_ORG } from '@/app/cbo-directory/cboDirectory.data';
import { NETWORK_ORGS } from '@/app/contract-program-selection/networkParticipants.data';

const REPO = process.cwd();

/** Files that own the substitution and so legitimately contain retired names. */
const REGISTRY_OWNED = [
  'src/lib/dataSources/data/synthetic-entities.seed.json',
  'src/lib/dataSources/syntheticEntities.ts',
  'tools/deattribution/sweep.mjs',
  'tests/dataSources/syntheticEntities.test.ts',
];

/**
 * 'Bennett County Health' is a homograph: in the RHTP South Dakota corpus it is the
 * clinic this registry renames, but inside src/uhg/** an earlier de-attribution pass
 * find/replaced a physician persona ('Dr. Chen') and an enterprise entity ('Optum
 * Health') onto the same string — leaving "…spent 8 minutes … He discontinued …" and
 * "how many Bennett County Healths are still working blind". Renaming those would read
 * as a hospital called "he" and belongs to a different owner, so they are excluded here
 * and reported rather than swept. Every other entity IS swept in those trees.
 */
const HOMOGRAPH_PREFIX = 'Bennett County Health';
const HOMOGRAPH_EXCLUDED = /^src\/(uhg|app\/uhg-orchestrate)\//;
const SKIPPED = /_to_delete_samples\//;

/**
 * Walk the repo for scannable files — in Node, not in a shell.
 *
 * THIS USED TO BE `execFileSync('find', ['src','tests','e2e','-type','f', ...])`, which is a
 * Unix-only assumption and crashed the whole test file on Windows: `find` there resolves to
 * `C:\Windows\System32\FIND.EXE`, a string-search utility that shares nothing but the name, so
 * the call fails before a single assertion runs. This test is the control that stops retired real
 * entity names reappearing across the repo — a control that cannot START on a developer's machine
 * is not a control, and the failure looked like a test bug rather than a blind spot.
 *
 * The walk is deliberately equivalent to the `find` it replaces — same three roots, same five
 * extensions, same recursion, paths normalised to forward slashes so the callers' regexes
 * (HOMOGRAPH_EXCLUDED, SKIPPED) keep matching on every platform. `node_modules`, `.next` and `.git`
 * are skipped because `find` never reached them under these roots either; widening the scan here
 * would change what the coherence case asserts, which is not a portability fix.
 */
function repoFiles(): string[] {
  const EXT = /\.(ts|tsx|mjs|js|json)$/;
  const SKIP_DIR = new Set(['node_modules', '.next', '.git', 'dist', 'coverage']);
  const out: string[] = [];
  const walk = (dir: string): void => {
    let entries: Dirent[];
    try {
      entries = readdirSync(join(REPO, dir), { withFileTypes: true });
    } catch {
      return; // a root that does not exist here is not a failure — `find` skipped it too
    }
    for (const e of entries) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) {
        if (!SKIP_DIR.has(e.name)) walk(rel);
      } else if (e.isFile() && EXT.test(e.name)) {
        out.push(rel);
      }
    }
  };
  for (const root of ['src', 'tests', 'e2e']) walk(root);
  return out;
}

function boundedMatcher(literal: string): RegExp {
  const escaped = literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const head = /^[A-Za-z0-9]/.test(literal) ? '(?<![A-Za-z0-9])' : '';
  const tail = /[A-Za-z0-9]$/.test(literal) ? '(?![A-Za-z0-9])' : '';
  return new RegExp(`${head}${escaped}${tail}`);
}

describe('synthetic-entity registry — shape', () => {
  it('has entities, each with unique id and non-empty display forms', () => {
    expect(SYNTHETIC_ENTITIES.length).toBeGreaterThan(20);
    const ids = SYNTHETIC_ENTITIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of SYNTHETIC_ENTITIES) {
      expect(e.name.length, e.id).toBeGreaterThan(0);
      expect(e.shortName.length, e.id).toBeGreaterThan(0);
      expect(e.graphLabel.length, e.id).toBeGreaterThan(0);
      expect(e.oldNames.length, e.id).toBeGreaterThan(0);
    }
  });

  it('entityName / entityShortName throw on an unknown id rather than rendering blank', () => {
    expect(() => entityName('ent-does-not-exist')).toThrow(/Unknown synthetic entity/);
    expect(() => entityShortName('ent-does-not-exist')).toThrow(/Unknown synthetic entity/);
  });

  it('every phone is in the NANP-reserved 555-0100..555-0199 range and unique', () => {
    const seen = new Set<string>();
    for (const e of SYNTHETIC_ENTITIES) {
      expect(e.phone, e.id).toMatch(/^\(\d{3}\) 555-01\d{2}$/);
      const subscriber = e.phone.slice(-7);
      expect(seen.has(subscriber), `${e.id} reuses ${subscriber}`).toBe(false);
      seen.add(subscriber);
    }
  });

  it('every email and domain is RFC 2606 example.org', () => {
    for (const e of SYNTHETIC_ENTITIES) {
      expect(e.domain, e.id).toMatch(/\.example\.org$/);
      expect(e.email, e.id).toMatch(/@[a-z0-9.-]+\.example\.org$/);
    }
  });

  it('no display name carries a real place, tribal or person token', () => {
    // The rule the registry encodes: a real place name may appear as a LOCATION but
    // never inside an ORGANISATION name; tribal and people names never appear at all.
    const forbidden =
      /\b(Bennett|Oglala|Lakota|Sioux|Avera|McKennan|Winner|Monument|Rosebud|Crazy Horse|Sacred Heart|Black Hills|SDHDA)\b/;
    for (const e of SYNTHETIC_ENTITIES) {
      for (const form of [e.name, e.shortName, e.graphLabel]) {
        expect(forbidden.test(form), `${e.id}: "${form}"`).toBe(false);
      }
    }
  });

  it('keeps geography: county/city values may still be real places', () => {
    const counties = SYNTHETIC_ENTITIES.map((e) => e.address.county);
    // 'Bennett' and 'Oglala Lakota' are networkAdequacy engine keys — they must survive.
    expect(counties).toContain('Bennett');
    expect(counties).toContain('Oglala Lakota');
  });

  it('substitution pairs are ordered longest-old-first so variants win', () => {
    const pairs = substitutionPairs();
    for (let i = 1; i < pairs.length; i += 1) {
      expect(pairs[i - 1][0].length).toBeGreaterThanOrEqual(pairs[i][0].length);
    }
    const avera = pairs.findIndex(([old]) => old === 'Avera Sacred Heart');
    const averaBh = pairs.findIndex(([old]) => old === 'Avera Sacred Heart CAH — BH');
    expect(averaBh).toBeLessThan(avera);
  });

  it('no substitution is a no-op or reintroduces a retired name', () => {
    const retired = new Set(retiredStrings());
    for (const [old, next] of substitutionPairs()) {
      expect(next, `no-op for "${old}"`).not.toBe(old);
      expect(retired.has(next), `"${old}" -> "${next}" is itself retired`).toBe(false);
    }
  });
});

describe('Wave 1 seeds resolve through the registry (one owner, not four)', () => {
  it('every network-participant row resolves to a registry name', () => {
    expect(NETWORK_ORGS.length).toBe(8);
    for (const org of NETWORK_ORGS) {
      expect(org.name.length, org.id).toBeGreaterThan(0);
      expect(org.name).not.toMatch(/undefined/);
    }
    // The row that diverged from /provider-level before the registry existed.
    expect(NETWORK_ORGS[0].name).toBe(entityName('ent-prairie-health'));
    expect(NETWORK_ORGS[7].name).toBe(`${entityName('ent-summit-regional')} Cardiology`);
  });

  it('every CBO row resolves, composing service lines without doubling the stem', () => {
    expect(MO_CBOS.length).toBeGreaterThan(10);
    for (const cbo of MO_CBOS) {
      expect(cbo.org.length, cbo.id).toBeGreaterThan(0);
      expect(cbo.org, cbo.id).not.toMatch(/undefined/);
      // A doubled stem ('Cedar Valley Critical Access Hospital — CAH — …') is the bug
      // the short-name form exists to avoid.
      expect(cbo.org.match(/Cedar Valley/g)?.length ?? 0, cbo.id).toBeLessThan(2);
    }
    expect(MO_CBOS.map((c) => c.org)).toContain('Cedar Valley CAH — Behavioral Health');
    expect(ANCHOR_CBO_ORG).toBe(entityName('ent-frontier-action'));
  });
});

describe('repo-wide coherence — no retired real name survives', () => {
  it('reports zero residue across src/, tests/ and e2e/', () => {
    const pairs = substitutionPairs();
    const residue: string[] = [];

    for (const relPath of repoFiles()) {
      if (REGISTRY_OWNED.includes(relPath) || SKIPPED.test(relPath)) continue;
      let text: string;
      try {
        text = readFileSync(join(REPO, relPath), 'utf8');
      } catch {
        continue;
      }
      const inUhg = HOMOGRAPH_EXCLUDED.test(relPath);
      for (const [old] of pairs) {
        if (inUhg && old.startsWith(HOMOGRAPH_PREFIX)) continue;
        if (!text.includes(old)) continue;
        if (!boundedMatcher(old).test(text)) continue;
        residue.push(`${relPath}: ${old}`);
      }
    }

    expect(residue, `retired names still present:\n${residue.join('\n')}`).toEqual([]);
  });
});
