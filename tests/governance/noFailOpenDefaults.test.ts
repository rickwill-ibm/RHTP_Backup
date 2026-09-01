/**
 * noFailOpenDefaults.test.ts — the U1 class cannot recur.
 *
 * U1 (verification/STUB_LEGITIMACY_FINDINGS.md) was a dev-mock auth flag that
 * defaulted ON and was gated on the flag ALONE, so a production deploy with real
 * auth wired but the flag left unset served a canned "Prior authorization
 * approved" ClaimResponse. The fix: the flag defaults OFF and is IMPOSSIBLE once
 * real auth (WSO2 tokenUrl) is configured.
 *
 * This suite enforces both properties MECHANICALLY:
 *   A. Behavioral — devMockEnabled() and the two config defaults are OFF by
 *      default and cannot be active when real auth is configured.
 *   B. Static — no dev-mock / dev-fallback / fail-open env flag anywhere in src/
 *      may default to 'true'. A future flag that defaults ON turns the gate red.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

import { serverEnv } from '@/lib/server/env';
import { devMockEnabled } from '@/lib/server/devStubs';
import { getDefaultConfig } from '@/lib/runtimeConfig';

const FLAG = 'ALLOW_DEV_MOCK_AUTH';
const AUTH = 'WSO2_TOKEN_URL';
const KEYS = [FLAG, AUTH] as const;
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

describe('U1 — dev-mock auth flag defaults OFF', () => {
  it('serverEnv().allowDevMockAuth is false when the flag is unset', () => {
    delete process.env[FLAG];
    expect(serverEnv().allowDevMockAuth).toBe(false);
  });

  it('runtimeConfig default allowDevMockAuth is false when the flag is unset', () => {
    delete process.env[FLAG];
    expect(getDefaultConfig().allowDevMockAuth).toBe(false);
  });

  it('devMockEnabled() is false by default (no fail-open default)', () => {
    delete process.env[FLAG];
    delete process.env[AUTH];
    expect(devMockEnabled()).toBe(false);
  });
});

describe('U1 — dev-mock auth is excluded once real auth is configured', () => {
  it('devMockEnabled() is false when the flag is ON but real auth (tokenUrl) is set', () => {
    process.env[FLAG] = 'true';
    process.env[AUTH] = 'https://wso2.example/oauth2/token';
    expect(devMockEnabled()).toBe(false);
  });

  it('devMockEnabled() is true ONLY in explicit mock mode: flag ON and no real tokenUrl', () => {
    process.env[FLAG] = 'true';
    delete process.env[AUTH];
    expect(devMockEnabled()).toBe(true);
  });

  it('setting the flag ON can never override a configured tokenUrl', () => {
    process.env[AUTH] = 'https://wso2.example/oauth2/token';
    for (const v of ['true', 'TRUE', 'True', '1', 'yes']) {
      process.env[FLAG] = v;
      // Only a literal true enables the flag, and even that is vetoed by tokenUrl.
      expect(devMockEnabled()).toBe(false);
    }
  });
});

// ── Static guard: no dev-mock / dev-fallback / fail-open env flag defaults ON ────
function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkTsFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Names an env flag whose fail-open default would recreate the U1 class. */
function isFailOpenFlag(name: string): boolean {
  return /(DEV_MOCK|MOCK_AUTH|ALLOW_DEV|FAIL_OPEN|DEV_FALLBACK|ALLOW_MOCK|BYPASS)/.test(name);
}

/**
 * Find `process.env.FLAG ?? 'x'`, `process.env.FLAG || 'x'`,
 * `process.env['FLAG'] ?? 'x'`, and `opt('FLAG', 'x')` and return [flag, default].
 */
function envDefaults(code: string): Array<{ flag: string; def: string }> {
  const out: Array<{ flag: string; def: string }> = [];
  const patterns = [
    /process\.env\.([A-Z0-9_]+)\s*(?:\?\?|\|\|)\s*['"]([^'"]*)['"]/g,
    /process\.env\[\s*['"]([A-Z0-9_]+)['"]\s*\]\s*(?:\?\?|\|\|)\s*['"]([^'"]*)['"]/g,
    /\bopt\(\s*['"]([A-Z0-9_]+)['"]\s*,\s*['"]([^'"]*)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    for (const m of code.matchAll(re)) out.push({ flag: m[1], def: m[2] });
  }
  return out;
}

describe('U1 — static guard: no fail-open flag defaults to true in src/', () => {
  it('every dev-mock / dev-fallback / fail-open env flag defaults to a non-true value', () => {
    const srcRoot = path.resolve(__dirname, '../../src');
    const offenders: string[] = [];
    let sawTheFlag = false;
    for (const file of walkTsFiles(srcRoot)) {
      const code = fs.readFileSync(file, 'utf8');
      for (const { flag, def } of envDefaults(code)) {
        if (!isFailOpenFlag(flag)) continue;
        if (flag === FLAG) sawTheFlag = true;
        if (def.toLowerCase() === 'true') {
          offenders.push(`${path.relative(srcRoot, file)}: ${flag} defaults to '${def}'`);
        }
      }
    }
    // The known flag must be present (guards against the scan silently matching nothing).
    expect(sawTheFlag, `${FLAG} default not found in src/ — scan may be broken`).toBe(true);
    expect(offenders, `fail-open flag defaults found:\n${offenders.join('\n')}`).toEqual([]);
    // Walks the entire src/ tree reading every file; give it a generous timeout so a
    // slow/cold filesystem (e.g. Windows + AV) doesn't produce a false 5s timeout.
  }, 30_000);
});
