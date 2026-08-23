/**
 * R5 — the session secret fails CLOSED.
 *
 * Before: `sessionSecret` defaulted to a shared public constant
 * ('dev-only-insecure-session-secret-change-me'), so a production deploy that
 * forgot to set SESSION_SECRET sealed session cookies under a value baked into
 * the source — anyone could forge a cookie. The fix mirrors the U1 dev-mock-auth
 * double-gate: no public default; require SESSION_SECRET or throw; a labelled dev
 * secret is available ONLY in explicit dev-mock mode (real auth NOT configured).
 *
 * This suite enforces both properties MECHANICALLY:
 *   A. Behavioral — requireSessionSecret throws in production without config,
 *      works with config, and only serves the dev secret in explicit dev mode.
 *   B. Governance/static — the SESSION_SECRET default in src/ is NOT a shared
 *      public constant; a future public default turns the gate red.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  serverEnv,
  requireSessionSecret,
  SessionSecretNotConfiguredError,
  DEV_SESSION_SECRET,
} from '@/lib/server/env';

const SECRET = 'SESSION_SECRET';
const AUTH = 'WSO2_TOKEN_URL';
const FLAG = 'ALLOW_DEV_MOCK_AUTH';
const KEYS = [SECRET, AUTH, FLAG] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('R5 — session secret behavioral fail-closed', () => {
  it('throws in production (real auth configured) when SESSION_SECRET is unset', () => {
    delete process.env[SECRET];
    process.env[AUTH] = 'https://wso2.example/oauth2/token'; // real auth = production
    delete process.env[FLAG];
    expect(() => requireSessionSecret()).toThrow(SessionSecretNotConfiguredError);
  });

  it('throws when SESSION_SECRET is unset and not in explicit dev-mock mode', () => {
    delete process.env[SECRET];
    delete process.env[AUTH];
    process.env[FLAG] = 'false';
    expect(() => requireSessionSecret()).toThrow(SessionSecretNotConfiguredError);
  });

  it('the dev secret is IMPOSSIBLE once real auth is configured (mirrors U1)', () => {
    delete process.env[SECRET];
    process.env[AUTH] = 'https://wso2.example/oauth2/token';
    process.env[FLAG] = 'true'; // even ON, real auth vetoes it
    expect(() => requireSessionSecret()).toThrow(SessionSecretNotConfiguredError);
  });

  it('serves the labelled dev secret ONLY in explicit dev mode (no real auth, flag ON)', () => {
    delete process.env[SECRET];
    delete process.env[AUTH];
    process.env[FLAG] = 'true';
    expect(requireSessionSecret()).toBe(DEV_SESSION_SECRET);
  });

  it('returns the configured secret verbatim when SESSION_SECRET is set (even in production)', () => {
    process.env[SECRET] = 'a-real-operator-provided-secret';
    process.env[AUTH] = 'https://wso2.example/oauth2/token';
    expect(requireSessionSecret()).toBe('a-real-operator-provided-secret');
  });
});

describe('R5 — governance: the default is not a shared public constant in production', () => {
  it('serverEnv().sessionSecret is empty (never a public constant) when unset', () => {
    delete process.env[SECRET];
    expect(serverEnv().sessionSecret).toBe('');
  });

  it('the dev secret is clearly labelled and never a plausible production value', () => {
    // Its own name marks it unusable in prod; the fail-closed path never yields it there.
    expect(DEV_SESSION_SECRET).toMatch(/dev|do-not-use/i);
  });

  it('no SESSION_SECRET default in src/ resolves to a non-empty public constant', () => {
    // Static scan: opt('SESSION_SECRET', 'x') or process.env.SESSION_SECRET ?? 'x'
    // with a non-empty literal default would recreate R5. Only '' is allowed.
    const srcRoot = path.resolve(__dirname, '../../src');
    const offenders: string[] = [];
    let sawTheKey = false;
    const patterns = [
      /opt\(\s*['"]SESSION_SECRET['"]\s*,\s*['"]([^'"]*)['"]\s*\)/g,
      /process\.env\.SESSION_SECRET\s*(?:\?\?|\|\|)\s*['"]([^'"]*)['"]/g,
      /process\.env\[\s*['"]SESSION_SECRET['"]\s*\]\s*(?:\?\?|\|\|)\s*['"]([^'"]*)['"]/g,
    ];
    for (const file of walkTsFiles(srcRoot)) {
      const code = fs.readFileSync(file, 'utf8');
      if (code.includes('SESSION_SECRET')) sawTheKey = true;
      for (const re of patterns) {
        for (const m of code.matchAll(re)) {
          // A defaulted read: only an empty-string default is allowed.
          if (m[1] !== '') offenders.push(`${path.relative(srcRoot, file)}: SESSION_SECRET defaults to '${m[1]}'`);
        }
      }
    }
    expect(sawTheKey, 'SESSION_SECRET read not found in src/ — scan may be broken').toBe(true);
    expect(offenders, `public SESSION_SECRET defaults found:\n${offenders.join('\n')}`).toEqual([]);
  });
});

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkTsFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}
