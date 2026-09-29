/**
 * The plain-node mirror (tools/adl/compile.mjs) is what `npm run adl:check`
 * actually runs, so a gate that only the mirror enforces is only as good as the
 * mirror. Two independent implementations of the same projection drift; this
 * test pins them together, and fails the moment they disagree on a single byte.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  compile,
  loadDefinitions,
  loadAuthorityLock,
  loadArtifactVersions,
  type DefinitionSource,
} from '@/lib/agents/adl';
import { AGENT_TASK_KINDS } from '@/lib/agents/dispatch/types';
import { PA_EVENT_TYPES, PA_STATES } from '@/lib/workflow/paMachine';
import { AUTONOMY_ORDER, PHI_ORDER } from '@/lib/agents/authority';

const ROOT = process.cwd();
const DATA = join(ROOT, 'src/lib/agents/adl/data');

const source: DefinitionSource = {
  listDefinitionFiles: () =>
    readdirSync(DATA)
      .filter((f) => f.endsWith('.agent.json'))
      .map((f) => join(DATA, f)),
  readTextFile: (path) => readFileSync(path, 'utf8'),
};

describe('the TypeScript compiler and the plain-node mirror agree', () => {
  it('produces byte-identical manifest and routing', async () => {
    const mirror = await import(join(ROOT, 'tools/adl/compile.mjs'));
    const fromMirror = mirror.compileFromDisk(ROOT);
    expect(fromMirror.failures).toEqual([]);

    const compiled = compile(
      loadDefinitions(source),
      loadAuthorityLock(source, join(ROOT, 'src/lib/agents/authority/data/authority-lock.json')),
      loadArtifactVersions(source, join(DATA, 'artifact-versions.json'))
    );

    expect(compiled.manifestJson).toBe(fromMirror.manifestJson);
    expect(compiled.routingJson).toBe(fromMirror.routingJson);
  });

  it('and both equal the committed artifacts', async () => {
    const mirror = await import(join(ROOT, 'tools/adl/compile.mjs'));
    const { manifestJson, routingJson } = mirror.compileFromDisk(ROOT);
    expect(manifestJson).toBe(
      readFileSync(join(ROOT, 'src/lib/agents/manifest/data/agent-manifests.json'), 'utf8')
    );
    expect(routingJson).toBe(
      readFileSync(join(ROOT, 'src/lib/agents/dispatch/data/agent-routing.json'), 'utf8')
    );
  });
});

describe('the two copies of the closed task-kind vocabulary', () => {
  /**
   * WHY THE BYTE-IDENTITY TESTS ABOVE CANNOT COVER THIS. Both implementations are
   * driven by the SAME valid definition set, and a valid set exercises neither
   * validator's rejection path — so a mirror that accepts a kind the TS schema
   * refuses produces byte-identical output and passes every assertion above. The
   * drift is only visible by comparing the vocabularies themselves.
   *
   * `compile.mjs` is a plain-node module with no TS imports, so it RESTATES the set
   * rather than importing it. This is the assertion that makes the restatement safe:
   * add a member to `AgentTaskKind` and the exhaustive `Record` in dispatch/types.ts
   * forces it into `AGENT_TASK_KINDS`, and this test then fails until the mirror
   * carries it too.
   */
  it('are the same set, member for member', async () => {
    const mirror = await import(join(ROOT, 'tools/adl/compile.mjs'));

    expect(new Set(mirror.TASK_KINDS)).toEqual(new Set(AGENT_TASK_KINDS));
    // Length too, because `Set` collapses a duplicated mirror entry that set equality
    // alone would read as agreement.
    expect(mirror.TASK_KINDS.length).toBe(AGENT_TASK_KINDS.length);
  });

  /**
   * The mirror restates FOUR vocabularies and the first cut of this test pinned only
   * `TASK_KINDS` — the one that is not an authority or state-machine control. `PA_STATES`
   * and `PA_EVENT_TYPES` govern whether an authored advancement reaches a state machine
   * that fails SOFT, so a mirror looser than the TS side there emits a route the shipped
   * loader refuses, or worse, one it accepts and cannot advance.
   */
  it('and the PA machine vocabularies agree too, member for member', async () => {
    const mirror = await import(join(ROOT, 'tools/adl/compile.mjs'));

    expect(new Set(mirror.PA_STATES)).toEqual(new Set(PA_STATES));
    expect(mirror.PA_STATES.length).toBe(PA_STATES.length);
    expect(new Set(mirror.PA_EVENT_TYPES)).toEqual(new Set(PA_EVENT_TYPES));
    expect(mirror.PA_EVENT_TYPES.length).toBe(PA_EVENT_TYPES.length);
  });

  /**
   * AND THE TWO AUTHORITY LADDERS — the pair the register (G-005) named as the ones left unpinned
   * while the three that are NOT authority ceilings were covered. These are ORDERED: the mirror ranks
   * a definition's tier against its lock entry by `indexOf`, so a mirror whose order differs from the
   * TypeScript side does not merely accept a different vocabulary, it accepts a different ANSWER to
   * "is this agent within its locked ceiling" — and `adl:check` is the build-time gate whose verdict
   * the committed manifest carries. `toEqual` on the arrays, not on sets: order IS the semantics.
   */
  it('and the authority ladders agree, member for member AND in strength order', async () => {
    const mirror = await import(join(ROOT, 'tools/adl/compile.mjs'));

    expect(mirror.AUTONOMY).toEqual([...AUTONOMY_ORDER]);
    expect(mirror.PHI).toEqual([...PHI_ORDER]);
  });
});
