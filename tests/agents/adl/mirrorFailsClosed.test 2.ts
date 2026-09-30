/**
 * THE MIRROR MUST NOT BE MORE PERMISSIVE THAN ITS SOURCE.
 *
 * `tools/adl/compile.mjs` is what `npm run adl:check` executes, so it — not the
 * TypeScript in src/lib/agents/adl — is the gate that stands between a widened
 * grant and a merge. An earlier version compared tiers with
 * `ORDER.indexOf(a) > ORDER.indexOf(b)`; indexOf returns -1 for an unknown
 * value and -1 > 0 is false, so a definition carrying `"autonomyTier":
 * "Autonomous"` cleared every authority check in CI while the TypeScript path
 * refused it outright. A green check over an ungoverned artifact is worse than
 * no check.
 *
 * A parity test cannot catch this: parity compares outputs on inputs that pass.
 * These tests run the mirror over definition sets that must FAIL.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = process.cwd();
const DATA = 'src/lib/agents/adl/data';
const LOCK = 'src/lib/agents/authority/data/authority-lock.json';

interface Mirror {
  compileFromDisk(root: string): {
    manifestJson: string | null;
    routingJson: string | null;
    failures: string[];
  };
}
let mirror: Mirror;
beforeAll(async () => {
  mirror = (await import(join(ROOT, 'tools/adl/compile.mjs'))) as unknown as Mirror;
});

/** A throwaway copy of the repo's ADL inputs, mutated by the caller. */
function sandbox(mutate: (defs: Record<string, Record<string, unknown>>) => void): string {
  const dir = mkdtempSync(join(tmpdir(), 'adl-'));
  cpSync(join(ROOT, DATA), join(dir, DATA), { recursive: true });
  cpSync(join(ROOT, LOCK), join(dir, LOCK), { recursive: true });
  const defs: Record<string, Record<string, unknown>> = {};
  // `pa-documentation-agent` is here because it is the only definition carrying a `pa`
  // template, which is what the PA-vocabulary cases below mutate.
  for (const f of ['outreach-agent', 'revenue-cycle-agent', 'pa-documentation-agent']) {
    defs[f] = JSON.parse(readFileSync(join(dir, DATA, `${f}.agent.json`), 'utf8')) as Record<
      string,
      unknown
    >;
  }
  mutate(defs);
  for (const [f, d] of Object.entries(defs)) {
    writeFileSync(join(dir, DATA, `${f}.agent.json`), `${JSON.stringify(d, null, 2)}\n`);
  }
  return dir;
}

function run(mutate: (defs: Record<string, Record<string, unknown>>) => void): {
  manifestJson: string | null;
  failures: string[];
} {
  const dir = sandbox(mutate);
  try {
    return mirror.compileFromDisk(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('the mirror fails closed on values it does not recognise', () => {
  it('refuses a tier that differs only in case', () => {
    const { failures } = run((d) => {
      d['outreach-agent']!.autonomyTier = 'Autonomous';
    });
    expect(failures.join('\n')).toMatch(/is not a known tier/);
  });

  it('refuses a posture that differs only in case — which would also skip the PHI override', () => {
    const { failures } = run((d) => {
      d['outreach-agent']!.phiPosture = 'FULL';
    });
    expect(failures.join('\n')).toMatch(/is not a known posture/);
  });

  it('refuses a lock ceiling that is not a known tier', () => {
    const dir = sandbox(() => {});
    try {
      const lock = JSON.parse(readFileSync(join(dir, LOCK), 'utf8')) as {
        entries: { maxAutonomyTier: string }[];
      };
      lock.entries[0]!.maxAutonomyTier = 'godmode';
      writeFileSync(join(dir, LOCK), JSON.stringify(lock, null, 2));
      expect(mirror.compileFromDisk(dir).failures.join('\n')).toMatch(/is not a known tier/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the mirror produces no artifact when a gate fails', () => {
  it('returns null artifacts on a widened allowlist, so nothing can be emitted', () => {
    const { manifestJson, failures } = run((d) => {
      (d['outreach-agent']!.toolAllowlist as string[]).push('claim.submit-appeal');
    });
    expect(failures.join('\n')).toMatch(/not granted by the lock/);
    expect(manifestJson).toBeNull();
  });

  it('and on a genuine promotion', () => {
    const { manifestJson, failures } = run((d) => {
      d['outreach-agent']!.autonomyTier = 'autonomous';
    });
    expect(failures.join('\n')).toMatch(/exceeds locked/);
    expect(manifestJson).toBeNull();
  });
});

describe('the mirror mirrors the schema, not a looser version of it', () => {
  it('refuses a definition with no routes array rather than defaulting to empty', () => {
    const { failures } = run((d) => {
      delete d['outreach-agent']!.routes;
    });
    expect(failures.join('\n')).toMatch(/routes must be an array/);
  });

  it('refuses an unknown match key, which the TS parser would have stripped', () => {
    const { failures } = run((d) => {
      const routes = d['outreach-agent']!.routes as { match: Record<string, string> }[];
      routes[0]!.match.tenantId = 'x';
    });
    expect(failures.join('\n')).toMatch(/match carries unknown key "tenantId"/);
  });

  it('refuses a duplicate agent id', () => {
    const { failures } = run((d) => {
      d['revenue-cycle-agent']!.id = 'outreach-agent';
    });
    expect(failures.join('\n')).toMatch(/declared more than once/);
  });

  /**
   * These three assert the property the gate's safety actually rests on: NOTHING IS
   * EMITTED. A first cut of these cases lived in `mirrorParity.test.ts`, called the
   * mirror's internals directly (widening its public surface to do so) and asserted only
   * `failures.length > 0` — which proves `fail` was called, not that the artifact was
   * withheld. This harness already had the seam; CLAUDE.md pre-flight #2 says bind to it.
   */
  it('refuses a taskKind outside the dispatcher vocabulary, and emits nothing', () => {
    const { manifestJson, failures } = run((d) => {
      (d['outreach-agent']!.routes as { taskKind: string }[])[0]!.taskKind = 'bh-triage';
    });
    expect(failures.join('\n')).toMatch(/taskKind must be one of/);
    expect(manifestJson).toBeNull();
  });

  it('refuses a PA state that differs only in case, and emits nothing', () => {
    // `transition()` fails SOFT on an unknown state — it returns an `error` rather than
    // throwing — so a lower-case 'denied' that reaches runtime leaves the thread
    // un-advanced while the audited row reads `executed`. It has to die here.
    const { manifestJson, failures } = run((d) => {
      const routes = d['pa-documentation-agent']!.routes as { pa: { currentState: string } }[];
      routes[0]!.pa.currentState = 'denied';
    });
    expect(failures.join('\n')).toMatch(/pa\.currentState must be one of/);
    expect(manifestJson).toBeNull();
  });

  it('refuses an unknown PA advance event, and emits nothing', () => {
    const { manifestJson, failures } = run((d) => {
      const routes = d['pa-documentation-agent']!.routes as {
        pa: { advanceEvent: { type: string } };
      }[];
      routes[0]!.pa.advanceEvent.type = 'auto-approve';
    });
    expect(failures.join('\n')).toMatch(/pa\.advanceEvent\.type must be one of/);
    expect(manifestJson).toBeNull();
  });

  it('refuses a pa route with NO template, and emits nothing', () => {
    // The presence check the authoring layer lacked. The shipped loader requires the
    // template; this validator only checked it when present, so a `pa` route with no `pa`
    // key compiled, emitted and passed `adl:check` byte-identically — then
    // `parseAgentRouting` threw at MODULE LOAD, taking every dispatch with it.
    const { manifestJson, failures } = run((d) => {
      const routes = d['pa-documentation-agent']!.routes as Record<string, unknown>[];
      delete routes[0]!.pa;
    });
    expect(failures.join('\n')).toMatch(/a pa route must carry a/);
    expect(manifestJson).toBeNull();
  });

  it('refuses an UNKNOWN top-level key, and emits nothing', () => {
    // Silently discarded before, at depth 1, while `match` and `pa` keys were whitelisted
    // at depths 2 and 3. A one-letter typo on an OPTIONAL key (`dataCapabilty`) produced an
    // agent declaring no data classes with no diagnostic — the right refusal at the
    // disclosure gate for entirely the wrong reason.
    const { manifestJson, failures } = run((d) => {
      d['outreach-agent']!.escalationPolicyNote = 'a design note does not belong here';
    });
    expect(failures.join('\n')).toMatch(/unknown top-level key "escalationPolicyNote"/);
    expect(manifestJson).toBeNull();
  });

  it('refuses a one-letter typo on an OPTIONAL key, rather than dropping the capability', () => {
    const { manifestJson, failures } = run((d) => {
      const def = d['outreach-agent']!;
      def.dataCapabilty = def.dataCapability;
      delete def.dataCapability;
    });
    expect(failures.join('\n')).toMatch(/unknown top-level key "dataCapabilty"/);
    expect(manifestJson).toBeNull();
  });

  it('accepts the shipped inputs unchanged (the harness is not refusing everything)', () => {
    const { manifestJson, failures } = run(() => {});
    expect(failures).toEqual([]);
    expect(manifestJson).not.toBeNull();
  });
});
