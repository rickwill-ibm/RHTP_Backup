/**
 * The landing gate.
 *
 * 1. BYTE EQUALITY — the committed authority artifacts equal compile(definitions),
 *    so a generated file can never be hand-edited without the gate going red.
 * 2. SEMANTIC EQUALITY — the canonical rewrite of those artifacts changed
 *    FORMATTING ONLY: the parsed content still deep-equals the pre-ADL originals.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AdlError,
  assertNoDrift,
  compile,
  loadAuthorityLock,
  loadDefinitions,
  type DefinitionSource,
} from '@/lib/agents/adl';

const ROOT = process.cwd();
const ADL_DATA = join(ROOT, 'src/lib/agents/adl/data');
const MANIFEST_PATH = join(ROOT, 'src/lib/agents/manifest/data/agent-manifests.json');
const ROUTING_PATH = join(ROOT, 'src/lib/agents/dispatch/data/agent-routing.json');
const FIXTURES = join(ROOT, 'tests/agents/adl/fixtures');

const source: DefinitionSource = {
  listDefinitionFiles: () =>
    readdirSync(ADL_DATA)
      .filter((f) => f.endsWith('.agent.json'))
      .map((f) => join(ADL_DATA, f)),
  readTextFile: (p) => readFileSync(p, 'utf8'),
};

const LOCK_PATH = join(ROOT, 'src/lib/agents/authority/data/authority-lock.json');

/** The committed lock, parsed through the one parser. */
function loadCommittedLock() {
  return loadAuthorityLock(source, LOCK_PATH);
}

function compileCommitted() {
  const defs = loadDefinitions(source);
  const lock = loadCommittedLock();
  const committedManifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as { version: string };
  const committedRouting = JSON.parse(readFileSync(ROUTING_PATH, 'utf8')) as { version: string };
  return {
    defs,
    compiled: compile(defs, lock, {
      manifest: committedManifest.version,
      routing: committedRouting.version,
    }),
    committed: {
      manifestJson: readFileSync(MANIFEST_PATH, 'utf8'),
      routingJson: readFileSync(ROUTING_PATH, 'utf8'),
    },
  };
}

describe('ADL compile — the committed artifacts are generated, not authored', () => {
  it('loads every committed definition', () => {
    const { defs } = compileCommitted();
    expect(defs.length).toBeGreaterThanOrEqual(4);
    expect(defs.map((d) => d.id).sort()).toEqual([
      'bh-screening-triage-agent',
      'outreach-agent',
      'pa-documentation-agent',
      'referral-coordination-agent',
      'revenue-cycle-agent',
    ]);
  });

  it('every definition is inside its locked authority', () => {
    expect(() => compileCommitted()).not.toThrow();
  });

  it('compiles byte-for-byte to the committed manifest', () => {
    const { compiled, committed } = compileCommitted();
    expect(compiled.manifestJson).toBe(committed.manifestJson);
  });

  it('compiles byte-for-byte to the committed routing table', () => {
    const { compiled, committed } = compileCommitted();
    expect(compiled.routingJson).toBe(committed.routingJson);
  });

  it('assertNoDrift passes on the committed state', () => {
    const { compiled, committed } = compileCommitted();
    expect(() => assertNoDrift(compiled, committed)).not.toThrow();
  });

  it('assertNoDrift refuses a one-character hand-edit of a generated file', () => {
    const { compiled } = compileCommitted();
    const tampered = { ...compiled, manifestJson: `${compiled.manifestJson} ` };
    try {
      assertNoDrift(compiled, tampered);
      throw new Error('expected drift refusal');
    } catch (err) {
      expect(err).toBeInstanceOf(AdlError);
      expect((err as AdlError).code).toBe('ADL_DRIFT');
    }
  });

  it('is deterministic — compiling twice produces identical bytes', () => {
    const a = compileCommitted().compiled;
    const b = compileCommitted().compiled;
    expect(a.manifestJson).toBe(b.manifestJson);
    expect(a.routingJson).toBe(b.routingJson);
  });
});

/**
 * THE STALE-GRANT GATE, enforced rather than asserted.
 *
 * `assertNoOrphanLockEntries` lived in `authority/lockSchema.ts` with a header
 * claiming "the stricter rule won the merge" and ZERO callers in `src/` — only a
 * barrel re-export and two test files. `compile()` ran uniqueness + the authority
 * subset check and stopped, `loadAuthorityLock` parsed and returned, and the
 * load-time gate parsed and stopped. A lock granting authority to a deleted agent
 * was accepted everywhere that mattered.
 *
 * `compile()` is the one place both operands are in hand: the FULL ADL definition
 * roster and the lock. The load-time manifest gate deliberately does NOT get this
 * rule — see the header of `authority/lockSchema.ts`.
 *
 * The plain-node mirror (`tools/adl/compile.mjs`) has refused an orphan grant all
 * along, so this was also a live divergence between the gate CI runs and the
 * reviewed TypeScript source — the exact failure mode the parser merge was
 * performed to close.
 */
describe('compile() refuses a stale authority grant', () => {
  const versions = { manifest: 'v-test', routing: 'v-test' };

  it('refuses a lock entry whose agent has no definition', () => {
    const { defs, lock } = { ...compileCommitted(), lock: loadCommittedLock() };
    const deleted = 'revenue-cycle-agent';
    const survivors = defs.filter((d) => d.id !== deleted);
    expect(survivors.length).toBe(defs.length - 1);
    try {
      compile(survivors, lock, versions);
      throw new Error('expected a stale-grant refusal');
    } catch (err) {
      expect(err).toBeInstanceOf(AdlError);
      expect((err as AdlError).code).toBe('ADL_AUTHORITY_LOCK');
      expect((err as AdlError).message).toContain(deleted);
    }
  });

  it('emits NOTHING when the stale-grant gate fails', () => {
    const { defs } = compileCommitted();
    const lock = loadCommittedLock();
    let emitted: unknown = 'not-called';
    try {
      emitted = compile(defs.slice(0, 1), lock, versions);
    } catch {
      emitted = 'refused';
    }
    expect(emitted).toBe('refused');
  });

  it('the committed roster covers every lock entry, so the gate passes today', () => {
    const { defs } = compileCommitted();
    const lock = loadCommittedLock();
    const ids = new Set(defs.map((d) => d.id));
    expect(lock.entries.filter((e) => !ids.has(e.agentId))).toEqual([]);
    expect(() => compile(defs, lock, versions)).not.toThrow();
  });

  it('the plain-node mirror refuses the same thing, so the two cannot diverge again', () => {
    // The mirror is the gate CI runs without a TS toolchain. It enforced the
    // orphan rule while the TypeScript source did not; pinning both here means a
    // future removal from either side is visible from this one test.
    const mirror = readFileSync(join(ROOT, 'tools/adl/compile.mjs'), 'utf8');
    expect(mirror).toMatch(/orphan grant/);
    const engine = readFileSync(join(ROOT, 'src/lib/agents/adl/adlEngine.ts'), 'utf8');
    expect(engine).toMatch(/assertNoOrphanLockEntries\(/);
  });
});

describe('the canonical rewrite changed formatting only', () => {
  it('manifest content still deep-equals the pre-ADL original', () => {
    const original = JSON.parse(readFileSync(join(FIXTURES, 'original-manifest.json'), 'utf8')) as {
      version: string;
      agents: { id: string }[];
    };
    const now = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
      version: string;
      agents: { id: string }[];
    };
    expect(now.version).toEqual(original.version);
    const byId = (xs: { id: string }[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));
    // `dataCapability` is an ADDITIVE governance field the pre-ADL manifest did
    // not have. Strip it, then assert every pre-existing field is untouched — so
    // this test still catches a semantic change to the original content while
    // permitting the declared addition.
    const strip = (xs: Record<string, unknown>[]) =>
      byId(xs as { id: string }[]).map((a) => {
        const { dataCapability: _omit, ...rest } = a as Record<string, unknown>;
        return rest;
      });
    // A newly DEFINED agent has no counterpart in the pre-ADL snapshot. Compare
    // only the agents that existed then: the guarantee is that the ADL rewrite
    // did not change them, not that no agent may ever be added.
    const originalIds = new Set(original.agents.map((a) => a.id));
    const nowOriginals = (now.agents as unknown as Record<string, unknown>[]).filter((a) =>
      originalIds.has(a.id as string)
    );
    expect(nowOriginals).toHaveLength(original.agents.length);
    expect(strip(nowOriginals)).toEqual(
      strip(original.agents as unknown as Record<string, unknown>[])
    );
  });

  it('every shipped agent declares the data capability the lock caps', () => {
    const now = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
      agents: { id: string; dataCapability?: { purposeOfUse: string; dataClasses: string[] } }[];
    };
    for (const a of now.agents) {
      expect(a.dataCapability, `${a.id} declares no data capability`).toBeDefined();
      expect(a.dataCapability?.dataClasses.length).toBeGreaterThan(0);
    }
  });

  /**
   * Routing is compared IN ORDER, unlike the manifest above.
   *
   * The manifest is a lookup table — the registry keys it by id, so its array
   * order carries no meaning and sorting before comparison is correct. Routing
   * is resolved by first match, so its array order IS the behaviour. Sorting
   * this comparison by id (as an earlier version of this test did) makes it
   * blind to a reordering of the shipped routing table, which is precisely the
   * regression worth catching here.
   */
  it('routing content still deep-equals the pre-ADL original, IN ORDER', () => {
    const original = JSON.parse(readFileSync(join(FIXTURES, 'original-routing.json'), 'utf8')) as {
      version: string;
      routes: { id: string }[];
    };
    const now = JSON.parse(readFileSync(ROUTING_PATH, 'utf8')) as {
      version: string;
      routes: { id: string }[];
    };
    expect(now.version).toEqual(original.version);
    expect(now.routes.map((r) => r.id)).toEqual(original.routes.map((r) => r.id));
    const byId = (xs: { id: string }[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));
    expect(byId(now.routes)).toEqual(byId(original.routes));
  });
});
