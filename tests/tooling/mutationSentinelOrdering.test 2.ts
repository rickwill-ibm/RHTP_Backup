/**
 * G-009 — the E13 mutation harness's ORDERING invariant, as an executable check.
 *
 * `docs/build-provenance/check-mutation.mjs` may write arbitrary bytes over a file named
 * by an on-disk crash sentinel. Four containments make that safe, and all four rest on one
 * ordering fact: RECOVERY NEVER RUNS BEFORE THE DECLARED TARGET SET IS KNOWN. Before W9
 * that was a statement-order convention inside one file. It is now a data dependency —
 * `createSentinelGuard(declaredTargets)` is the only way to reach `recover()` and it
 * requires the Set — but extraction also introduced an ESM hazard the single file did not
 * have: imports are hoisted and an imported module body runs BEFORE the importer's, so an
 * import-time side effect in the sentinel module would run before argv is even parsed.
 *
 * These tests run the REAL harness with `execFileSync` against throwaway `mkdtempSync`
 * trees. Each asserts an EXIT CODE **and** the stderr text, because exit code alone does
 * not discriminate: a correct usage refusal and a containment refusal BOTH exit 2. The
 * usage-error case is the ordering test — a harness that recovered first prints the
 * sentinel refusal instead of the usage line, and this file goes red.
 *
 * Nothing here needs a green vitest run inside the fixture: every case exits during
 * recovery, before any test command is spawned.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const REPO = resolve(__dirname, '..', '..');
const HARNESS_SRC = join(REPO, 'docs', 'build-provenance', 'check-mutation.mjs');
const SENTINEL_SRC = join(REPO, 'docs', 'build-provenance', 'lib', 'mutation-sentinel.mjs');
const PROV_DIR = join('docs', 'build-provenance');
const SENTINEL_MODULE_REL = join(PROV_DIR, 'lib', 'mutation-sentinel.mjs');

const PRISTINE = 'export const f = (x) => (x >= 3 ? true : false);\n';
const MUTANT = 'export const f = (x) => (x > 3 ? true : false);\n';

const sha256 = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');

interface Run {
  status: number;
  stderr: string;
  stdout: string;
}

/** A throwaway repo-shaped tree carrying the REAL harness and the REAL sentinel module. */
function makeFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'e13-ordering-'));
  mkdirSync(join(root, PROV_DIR, 'lib'), { recursive: true });
  mkdirSync(join(root, 'src'), { recursive: true });
  cpSync(HARNESS_SRC, join(root, PROV_DIR, 'check-mutation.mjs'));
  cpSync(SENTINEL_SRC, join(root, SENTINEL_MODULE_REL));
  writeFileSync(join(root, 'src', 'target.mjs'), PRISTINE);
  return root;
}

interface SentinelRec {
  v: number;
  pid: number;
  file: string;
  original: string;
  mutantHash: string;
  atMs: number;
}

function putSentinel(root: string, pid: number, rec: Partial<SentinelRec>): string {
  const p = join(root, PROV_DIR, `.mutation-inflight.${String(pid)}.json`);
  writeFileSync(p, JSON.stringify({ v: 2, pid, atMs: Date.now(), ...rec }));
  return p;
}

function run(root: string, args: string[]): Run {
  const opts = { cwd: root, encoding: 'utf8' as const, timeout: 60_000 };
  try {
    const stdout = execFileSync('node', [join(PROV_DIR, 'check-mutation.mjs'), ...args], opts);
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status?: number | null; stdout?: string; stderr?: string };
    return { status: e.status ?? -1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

/** Import the sentinel module (and only that) in a child, with `root` as cwd. */
function importSentinelOnly(root: string): Run {
  const spec = `./${SENTINEL_MODULE_REL.split('\\').join('/')}`;
  const opts = { cwd: root, encoding: 'utf8' as const, timeout: 60_000 };
  try {
    const stdout = execFileSync(
      'node',
      ['--input-type=module', '-e', `await import(${JSON.stringify(spec)});`],
      opts
    );
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status?: number | null; stdout?: string; stderr?: string };
    return { status: e.status ?? -1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

let victim = '';

afterEach(() => {
  victim = '';
});

/** An out-of-repo file a hostile sentinel points at. Must never be written. */
function makeVictim(): string {
  victim = join(mkdtempSync(join(tmpdir(), 'e13-victim-')), 'npmrc.txt');
  writeFileSync(victim, 'PRISTINE-OUTSIDE\n');
  return victim;
}

describe('E13 mutation harness — recovery ordering (G-009)', () => {
  it('a usage error refuses BEFORE the sentinel directory is ever read', () => {
    const root = makeFixture();
    const v = makeVictim();
    const s = putSentinel(root, 999_999, {
      file: v,
      original: 'PWNED\n',
      mutantHash: sha256('PRISTINE-OUTSIDE\n'),
    });

    const r = run(root, []); // no argv at all -> loadTargets() must refuse first

    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/^usage: node check-mutation\.mjs/m);
    // THE ORDERING ASSERTION. Exit 2 alone proves nothing — a containment refusal is also
    // exit 2. A harness that recovered before parsing argv prints THIS instead, so the
    // absence of it is what pins the order.
    expect(r.stderr).not.toMatch(/crash sentinel/);
    expect(r.stderr).not.toMatch(/file restored/);
    // and the filesystem was not touched
    expect(readFileSync(v, 'utf8')).toBe('PRISTINE-OUTSIDE\n');
    expect(existsSync(s)).toBe(true);
  });

  it('importing the sentinel module has no import-time side effects (ESM hoisting)', () => {
    const root = makeFixture();
    const v = makeVictim();
    const s = putSentinel(root, 999_999, {
      file: v,
      original: 'PWNED\n',
      mutantHash: sha256('PRISTINE-OUTSIDE\n'),
    });

    const r = importSentinelOnly(root);

    expect(r.status).toBe(0);
    expect(r.stderr).not.toMatch(/crash sentinel|file restored|CONCURRENT/);
    expect(readFileSync(v, 'utf8')).toBe('PRISTINE-OUTSIDE\n');
    expect(existsSync(s)).toBe(true);
  });

  it('createSentinelGuard refuses to exist without a declared target Set', () => {
    const root = makeFixture();
    const spec = `./${SENTINEL_MODULE_REL.split('\\').join('/')}`;
    const script = [
      `const m = await import(${JSON.stringify(spec)});`,
      'for (const bad of [undefined, null, [], new Map(), "src/target.mjs"]) {',
      '  try { m.createSentinelGuard(bad); console.error("ACCEPTED:" + String(bad)); process.exit(3); }',
      '  catch (e) { if (!(e instanceof TypeError)) { console.error("WRONGERR"); process.exit(4); } }',
      '}',
      'console.log("ALL REFUSED");',
    ].join('\n');
    let out = '';
    try {
      out = execFileSync('node', ['--input-type=module', '-e', script], {
        cwd: root,
        encoding: 'utf8',
        timeout: 60_000,
      });
    } catch (err) {
      const e = err as { stderr?: string };
      throw new Error(`guard construction did not refuse: ${e.stderr ?? ''}`);
    }
    expect(out).toMatch(/ALL REFUSED/);
  });
});

describe('E13 mutation harness — sentinel containments', () => {
  it('CONTAINMENT: a sentinel naming a path outside the repo is refused, not written', () => {
    const root = makeFixture();
    const v = makeVictim();
    putSentinel(root, 999_999, {
      file: v,
      original: 'PWNED\n',
      mutantHash: sha256('PRISTINE-OUTSIDE\n'),
    });

    const r = run(root, ['src/target.mjs', 'node -e 0', '2']);

    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/which is not a declared/);
    expect(r.stderr).toMatch(/REFUSING to write it/);
    expect(readFileSync(v, 'utf8')).toBe('PRISTINE-OUTSIDE\n');
  });

  it('CONTAINMENT: an in-repo file that is not a declared target is refused', () => {
    const root = makeFixture();
    writeFileSync(join(root, 'src', 'bystander.mjs'), 'export const keep = 1;\n');
    putSentinel(root, 999_999, {
      file: 'src/bystander.mjs',
      original: 'PWNED\n',
      mutantHash: sha256('export const keep = 1;\n'),
    });

    const r = run(root, ['src/target.mjs', 'node -e 0', '2']);

    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/which is not a declared/);
    expect(readFileSync(join(root, 'src', 'bystander.mjs'), 'utf8')).toBe(
      'export const keep = 1;\n'
    );
  });

  it('PROVENANCE: bytes that are not the recorded mutant are never overwritten', () => {
    const root = makeFixture();
    const target = join(root, 'src', 'target.mjs');
    writeFileSync(target, '// a developer edit, not our mutant\n');
    putSentinel(root, 999_999, {
      file: 'src/target.mjs',
      original: PRISTINE,
      mutantHash: sha256(MUTANT), // on-disk bytes will NOT hash to this
    });

    const r = run(root, ['src/target.mjs', 'node -e 0', '2']);

    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/does NOT match/);
    expect(readFileSync(target, 'utf8')).toBe('// a developer edit, not our mutant\n');
  });

  it('OWNERSHIP: a sentinel held by a LIVE pid is a peer, so the run refuses to start', () => {
    const root = makeFixture();
    putSentinel(root, process.pid, {
      file: 'src/target.mjs',
      original: PRISTINE,
      mutantHash: sha256(MUTANT),
    });

    const r = run(root, ['src/target.mjs', 'node -e 0', '2']);

    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/a CONCURRENT mutation run/);
  });

  it('RECOVERY: a declared target whose bytes ARE the recorded mutant is restored, exit 1', () => {
    const root = makeFixture();
    const target = join(root, 'src', 'target.mjs');
    writeFileSync(target, MUTANT);
    const s = putSentinel(root, 999_999, {
      file: 'src/target.mjs',
      original: PRISTINE,
      mutantHash: sha256(MUTANT),
    });

    const r = run(root, ['src/target.mjs', 'node -e 0', '2']);

    // exit 1, NOT 0: a tree that was silently wrong gets a stop, not a silent heal.
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/A PRIOR MUTATION RUN WAS KILLED/);
    expect(r.stderr).toMatch(/file restored/);
    expect(readFileSync(target, 'utf8')).toBe(PRISTINE);
    expect(existsSync(s)).toBe(false);
  });

  it('a sentinel that is unreadable or malformed stops the run rather than guessing', () => {
    const root = makeFixture();
    writeFileSync(join(root, PROV_DIR, '.mutation-inflight.999999.json'), '{ not json');

    const r = run(root, ['src/target.mjs', 'node -e 0', '2']);

    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/is unreadable or malformed/);
  });
});
