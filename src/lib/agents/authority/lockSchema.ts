// CONTRACT: C-AUTHORITY
/**
 * Structural validation of the authority lock itself. THE ONLY ONE.
 *
 * WHY THE CEILING GETS MORE SCRUTINY THAN THE SUBJECT, NOT LESS. Everything
 * else in this system validates what it is GOVERNING — every manifest field,
 * every definition field — and then trusts the artifact doing the governing,
 * which arrived as a bare `as AuthorityLockFile` cast. That is backwards. An
 * unvalidated lock fails in the permissive direction: if `entry.tools` is a
 * string rather than an array, `new Set(entry.tools)` iterates its CHARACTERS
 * and the subset check becomes nonsense that happens not to throw.
 *
 * WHY THERE IS NOW ONE PARSER AND NOT TWO. There used to be a second hand
 * validator (`adl/lockSchema.ts`) reading the SAME `authority-lock.json` at
 * BUILD time, and the two had diverged: that one enforced CODE_PATTERN on the
 * tool and data-class codes and refused stale grants, while THIS one — the copy
 * `manifest/authorityGate.ts` runs at module init, governing every running
 * process — did neither. A lock carrying `"tools": ["Person-Context.READ"]`, or
 * a grant to a deleted agent, was refused at build time and ACCEPTED at load
 * time. The security ceiling that actually governs the process was parsed by the
 * weaker of the two. `adl/authorityLock.ts` states the rule that violated, in
 * its own header: two copies of a security rule is one copy too many. The
 * stricter rule won the merge; the build-time copy was deleted.
 *
 * WHERE EACH MERGED RULE IS ENFORCED — stated because the merge left the
 * stale-grant rule in this file with NO caller in `src/` for a whole wave, under a
 * header claiming it had won. A false claim in a security module's header is what
 * the next engineer relies on instead of grepping.
 *
 *   CODE_PATTERN, uniqueness, shape  — `parseAuthorityLockFile()` below. Every
 *     consumer of a lock passes through it, at build time and at load time alike.
 *   stale grants (`assertNoOrphanLockEntries`) — `adl/adlEngine.ts` `compile()`,
 *     and there ONLY. Proof: tests/agents/adl/compile.test.ts, which also pins the
 *     plain-node mirror (`tools/adl/compile.mjs`) to the same rule.
 *
 * WHY THE STALE-GRANT RULE IS NOT IN THE LOAD-TIME MANIFEST GATE. The orphan
 * question is only answerable against the FULL ADL definition roster, which
 * `compile()` has and the load-time gate does not: at load time the known-agent
 * set is whatever manifests a store-backed loader served, which is legitimately a
 * subset. Wiring the rule there would make every unserved agent look like a stale
 * grant and the gate would refuse a CORRECT lock — a fail-closed refusal of valid
 * authority, which takes the whole runtime down rather than one agent.
 *
 * The parsed lock is also DEEP-FROZEN. The lock is read from a module singleton
 * shared by the compiler, the registry gate and the preset clamp; handed out by
 * reference it is one assignment away from permanently raising the ceiling for
 * the whole process.
 *
 * INVARIANT: every tool and data-class code in a lock matches the code pattern —
 *            free text and a differently-cased code both fail the subset check
 *            OPEN, because that comparison is exact and case-sensitive.
 * INVARIANT: the parsed lock is unique by agentId, so no entry can shadow another.
 * INVARIANT: omitting the options argument yields the STRICTEST rules; injection
 *            can only change the error type raised, never relax what is checked.
 */
import { assertUniqueLockEntries } from './assertAuthority';
import {
  AUTONOMY_ORDER,
  PHI_ORDER,
  type AuthorityLockEntry,
  type AuthorityLockFile,
  type AuthorityViolation,
} from './types';

/** Raised when the lock itself is malformed. Never downgraded to a warning. */
export class AuthorityLockShapeError extends Error {
  constructor(
    public readonly at: string,
    detail: string
  ) {
    super(`authority lock invalid at "${at}": ${detail}`);
    this.name = 'AuthorityLockShapeError';
  }
}

/**
 * A code-level identifier: lowercase, dot- and dash-separated. Tool ids and data
 * classes in the lock must match it, so no free text and no alternate casing can
 * ever reach an authority ceiling.
 *
 * This is the SAME rule the ADL definition language applies to the codes on the
 * other side of the comparison (`adl/types.ts` CODE_PATTERN); the two are pinned
 * equal by tests/agents/authority/lockSchema.test.ts, because a lock and a
 * definition disagreeing about what a legal code is would reopen exactly the
 * divergence this module was merged to close.
 */
export const LOCK_CODE_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$/;

/**
 * How a caller adapts the shared rules to its own taxonomy.
 *
 * FAIL-CLOSED BY CONSTRUCTION: both fields default to the STRICTEST option, so
 * a caller that passes nothing gets the full rule set. `raise` only changes the
 * error CLASS — the ADL compiler keeps throwing `AdlError`, the registry keeps
 * throwing `AgentManifestError` — following the `AuthorityViolation` injection
 * `types.ts` already defines for the comparison itself. `codePattern` lets the
 * build-time caller pin the definition language's own pattern object; it must
 * not carry the `g` flag, which would make `.test` stateful via `lastIndex`.
 */
export interface ParseAuthorityLockOptions {
  raise?: AuthorityViolation;
  codePattern?: RegExp;
}

/** Internal validation context — one parameter instead of two threaded everywhere. */
interface LockCtx {
  raise: AuthorityViolation;
  codePattern: RegExp;
}

const shapeViolation: AuthorityViolation = (path, detail) =>
  new AuthorityLockShapeError(path, detail);

function obj(raw: unknown, at: string, raise: AuthorityViolation): Record<string, unknown> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw raise(at, 'expected an object');
  }
  return raw as Record<string, unknown>;
}

function str(
  src: Record<string, unknown>,
  key: string,
  at: string,
  raise: AuthorityViolation
): string {
  const v = src[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw raise(`${at}.${key}`, 'expected a non-empty string');
  }
  return v;
}

function oneOf(
  src: Record<string, unknown>,
  key: string,
  at: string,
  allowed: readonly string[],
  raise: AuthorityViolation
): string {
  const v = str(src, key, at, raise);
  if (!allowed.includes(v)) {
    throw raise(`${at}.${key}`, `expected one of ${allowed.join(' | ')}`);
  }
  return v;
}

/**
 * Parse an array of authority CODES — tool ids or data classes.
 *
 * `notArray` carries the caller's own explanation of why a non-array is
 * dangerous here, because for `tools` the failure mode is specific: a bare
 * string is iterated character by character and silently passes the subset check.
 */
function codeList(v: unknown, at: string, ctx: LockCtx, notArray: string): string[] {
  if (!Array.isArray(v)) throw ctx.raise(at, notArray);
  return v.map((c, i) => {
    const path = `${at}[${String(i)}]`;
    if (typeof c !== 'string' || c.length === 0) {
      throw ctx.raise(path, 'expected a non-empty string');
    }
    if (!ctx.codePattern.test(c)) {
      throw ctx.raise(
        path,
        `expected a lowercase dotted code matching ${String(ctx.codePattern)} — ` +
          'free text or alternate casing fails the subset check OPEN, because that ' +
          'comparison is exact'
      );
    }
    return c;
  });
}

const TOOLS_NOT_ARRAY =
  'expected an array — a bare string would be iterated character by character ' +
  'and silently pass the subset check';

function parseEntry(raw: unknown, at: string, ctx: LockCtx): AuthorityLockEntry {
  const e = obj(raw, at, ctx.raise);
  // A parser that silently DROPS a field the gate then checks turns a grant into
  // a refusal (or, with the sense reversed, a refusal into a grant). Carry it.
  const rawClasses = e.dataClasses;
  const classes =
    rawClasses === undefined
      ? undefined
      : codeList(rawClasses, `${at}.dataClasses`, ctx, 'expected an array');
  return {
    agentId: str(e, 'agentId', at, ctx.raise),
    tools: codeList(e.tools, `${at}.tools`, ctx, TOOLS_NOT_ARRAY),
    ...(classes !== undefined ? { dataClasses: classes } : {}),
    maxAutonomyTier: oneOf(e, 'maxAutonomyTier', at, AUTONOMY_ORDER, ctx.raise),
    maxPhiPosture: oneOf(e, 'maxPhiPosture', at, PHI_ORDER, ctx.raise),
    escalationPolicyRef: str(e, 'escalationPolicyRef', at, ctx.raise),
  };
}

/** Recursively freeze, so a handed-out lock cannot be edited through any path. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

/**
 * Parse, validate and deep-freeze a lock blob. The only way to make a lock —
 * at build time and at load time alike.
 */
export function parseAuthorityLockFile(
  raw: unknown,
  at = 'authority-lock',
  opts: ParseAuthorityLockOptions = {}
): AuthorityLockFile {
  const ctx: LockCtx = {
    // Both defaults are the STRICT option: omitting them cannot relax a check.
    raise: opts.raise ?? shapeViolation,
    codePattern: opts.codePattern ?? LOCK_CODE_PATTERN,
  };
  const o = obj(raw, at, ctx.raise);
  const rawEntries = o.entries;
  if (!Array.isArray(rawEntries)) {
    throw ctx.raise(`${at}.entries`, 'expected an array');
  }
  const entries = rawEntries.map((e, i) => parseEntry(e, `${at}.entries[${String(i)}]`, ctx));
  // Uniqueness is asserted HERE as well as in the comparison: a duplicate entry
  // shadows the first and widens its ceiling, and the parse is the one place
  // every consumer of a lock passes through.
  assertUniqueLockEntries(entries, ctx.raise);
  return deepFreeze({ version: str(o, 'version', at, ctx.raise), entries });
}

/**
 * Refuse a lock entry that grants authority to an agent that does not exist.
 *
 * Checked against the full agent roster (the ADL definition set), not against
 * whatever subset a loader happened to serve — a partial manifest set would make
 * every unserved agent look like a stale grant.
 */
export function assertNoOrphanLockEntries(
  lock: AuthorityLockFile,
  knownAgentIds: ReadonlySet<string>,
  raise: AuthorityViolation = shapeViolation
): void {
  for (const e of lock.entries) {
    if (!knownAgentIds.has(e.agentId)) {
      throw raise(
        e.agentId,
        'lock grants authority to an agent with no definition — stale grants must not accumulate'
      );
    }
  }
}
