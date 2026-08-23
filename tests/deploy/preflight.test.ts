/**
 * preflight.test.ts — the startup readiness PREFLIGHT fails closed.
 *
 * Proves the iteration-9 DoD:
 *   - passes (ready) when all required keys + production seam backends configured;
 *   - fails closed, NAMING the specific unmet requirement, when a required prod
 *     env key is missing (E9) or a required-in-production seam is NotConfigured;
 *   - never default-ready (ready === unmet.length === 0);
 *   - the report is PHI-safe and carries no secret VALUES.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  runPreflight,
  assertReadyOrThrow,
  PreflightNotReadyError,
} from '@/lib/deploy';
import { clearSessionDataModes, DATA_MODE_SEAMS, seamEnvVar } from '@/lib/config/dataMode';

// Snapshot + restore the whole process.env so each test is deterministic.
let snapshot: NodeJS.ProcessEnv;

function clearDataModeEnv(): void {
  delete process.env.DATA_MODE;
  for (const seam of DATA_MODE_SEAMS) delete process.env[seamEnvVar(seam)];
}

/** Set every required production env key so only seam checks remain in play. */
function setProdEnvKeys(): void {
  process.env.SESSION_SECRET = 'x-configured-secret';
  process.env.WSO2_AUTHORIZE_URL = 'https://wso2/authorize';
  process.env.WSO2_TOKEN_URL = 'https://wso2/token';
  process.env.WSO2_CLIENT_ID = 'client-abc';
  process.env.WSO2_CLIENT_SECRET = 'secret-abc';
}

beforeEach(() => {
  snapshot = { ...process.env };
  clearSessionDataModes();
  clearDataModeEnv();
});

afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in snapshot)) delete process.env[k];
  Object.assign(process.env, snapshot);
  clearSessionDataModes();
});

describe('runPreflight — ready path', () => {
  it('development posture with default mock seams is READY', () => {
    const report = runPreflight('development');
    expect(report.ready).toBe(true);
    expect(report.unmet).toEqual([]);
    expect(report.environment).toBe('development');
    expect(report.checks.seamsChecked).toBe(DATA_MODE_SEAMS.length);
    expect(report.checks.productionSeamsChecked).toBe(0);
  });

  it('production posture with all keys set and no production seams is READY', () => {
    setProdEnvKeys();
    const report = runPreflight('production');
    expect(report.ready).toBe(true);
    expect(report.unmet).toEqual([]);
  });

  it('production posture with a production seam whose backend key is set is READY', () => {
    setProdEnvKeys();
    process.env[seamEnvVar('evidence')] = 'production';
    // evidence is substrate-backed: its single entry is DATABASE_URL (the Wave-A
    // bootstrap connection), which the preflight consults via the substrate resolver.
    process.env.DATABASE_URL = 'postgres://ledger/substrate';
    const report = runPreflight('production');
    expect(report.ready).toBe(true);
    expect(report.checks.productionSeamsChecked).toBeGreaterThanOrEqual(1);
  });
});

describe('runPreflight — fail closed, names the unmet requirement', () => {
  it('E9: a missing production env key fails the preflight and NAMES the key', () => {
    // No SESSION_SECRET / WSO2 keys set.
    const report = runPreflight('production');
    expect(report.ready).toBe(false);
    const names = report.unmet.map((u) => u.name);
    expect(names).toContain('SESSION_SECRET');
    expect(names).toContain('WSO2_TOKEN_URL');
    const secret = report.unmet.find((u) => u.name === 'SESSION_SECRET')!;
    expect(secret.kind).toBe('env-key');
    expect(secret.reason).toMatch(/missing or empty/i);
  });

  it('a required-in-production substrate seam that is NotConfigured fails closed, naming seam + key + error', () => {
    setProdEnvKeys();
    delete process.env.DATABASE_URL; // the substrate single entry is unset
    process.env[seamEnvVar('evidence')] = 'production';
    const report = runPreflight('production');
    expect(report.ready).toBe(false);
    const miss = report.unmet.find((u) => u.seam === 'evidence');
    expect(miss, 'evidence seam must be reported unmet').toBeDefined();
    expect(miss!.kind).toBe('seam-backend');
    // CONVERGENCE: evidence resolves through the substrate's single DATABASE_URL entry.
    expect(miss!.name).toBe('DATABASE_URL');
    expect(miss!.mode).toBe('production');
    expect(miss!.disposition).toBe('fail-closed-stub');
    // The preflight consults the substrate disposition, so the boot-time error named
    // is the substrate's, not the per-seam one.
    expect(miss!.wouldThrow).toBe('SubstrateNotConfiguredError');
    expect(miss!.reason).toMatch(/NotConfigured/);
  });

  it('a present-but-blank DATABASE_URL counts as NotConfigured for a substrate seam (E9)', () => {
    setProdEnvKeys();
    process.env[seamEnvVar('idempotencyStore')] = 'production';
    process.env.DATABASE_URL = '   '; // whitespace only — must fail closed, not open
    const report = runPreflight('production');
    expect(report.ready).toBe(false);
    expect(report.unmet.some((u) => u.seam === 'idempotencyStore')).toBe(true);
  });

  it('never default-ready: ready strictly tracks an empty unmet list', () => {
    setProdEnvKeys();
    process.env[seamEnvVar('terminology')] = 'production'; // no TERMINOLOGY_SERVICE_URL
    const report = runPreflight('production');
    expect(report.ready).toBe(report.unmet.length === 0);
    expect(report.ready).toBe(false);
  });
});

describe('assertReadyOrThrow — boot-time fail-closed guard', () => {
  it('throws PreflightNotReadyError naming unmet requirements when not ready', () => {
    let thrown: unknown;
    try {
      assertReadyOrThrow('production');
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(PreflightNotReadyError);
    const err = thrown as PreflightNotReadyError;
    expect(err.message).toMatch(/SESSION_SECRET/);
    expect(err.report.ready).toBe(false);
  });

  it('returns the report (no throw) when ready', () => {
    const report = assertReadyOrThrow('development');
    expect(report.ready).toBe(true);
  });
});

describe('report is PHI-safe and secret-value-free', () => {
  it('carries key NAMES and reasons, never the secret VALUE', () => {
    setProdEnvKeys();
    process.env.SESSION_SECRET = 'super-secret-value-xyz';
    process.env[seamEnvVar('evidence')] = 'production';
    process.env.DATABASE_URL = 'postgres://user:hunter2@ledger/substrate';
    const report = runPreflight('production');
    const raw = JSON.stringify(report);
    // The secret and connection-string VALUES must never appear in the report.
    expect(raw).not.toContain('super-secret-value-xyz');
    expect(raw).not.toContain('hunter2');
    // Obvious PHI shapes must be absent.
    expect(raw).not.toMatch(/\b\d{3}-\d{2}-\d{4}\b/);
  });
});
