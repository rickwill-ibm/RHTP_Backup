/**
 * preflight.ts — the startup readiness PREFLIGHT (iteration 9 wave B).
 *
 * WHAT IT DOES. Reads the deployment posture (env.ts deploymentEnvName()), the
 * effective data mode of every seam (dataMode.ts getDataMode()), and the seam
 * dispositions (seamDispositions.ts), then FAILS CLOSED when either:
 *
 *   - a required env key for the posture is missing or empty, or
 *   - a `fail-closed-stub` seam whose EFFECTIVE mode is `production` has no
 *     backend-connection key configured (it would throw its *NotConfiguredError
 *     on first use — NotConfigured, so not-ready).
 *
 * It returns a STRUCTURED, PHI-SAFE ReadinessReport that names each unmet
 * requirement (env key or seam + key + the error it would throw). The readiness
 * route turns not-ready into HTTP 503; a boot script can call
 * assertReadyOrThrow() to refuse to start.
 *
 * E9. readiness is NEVER default-ready: `ready` is computed strictly as
 * `unmet.length === 0`, and a missing production key always lands in `unmet`.
 * The report carries only key names, seam ids, the posture, and reason strings —
 * no PHI, no secret VALUES (the value of a key is never read into the report,
 * only whether it is present).
 *
 * DETERMINISM. Pure read of process.env + the frozen schema/disposition data.
 * No backend resolver is imported, so inspecting a seam never has a side effect.
 */
import {
  DATA_MODE_SEAMS,
  getDataMode,
  type DataMode,
  type DataModeSeam,
} from '@/lib/config/dataMode';
import { SEAM_DISPOSITIONS, type SeamDisposition } from '@/lib/config/seamDispositions';
import { deploymentEnvName, deploymentValue, type DeploymentEnvName } from '@/lib/server/env';
import { substrateConnectionString, SubstrateNotConfiguredError } from '@/lib/substrate';
import {
  requiredEnvKeys,
  seamConnectionKey,
  isSubstrateBackedSeam,
  connectionKeyCompletenessProblems,
} from './schema';

/** The kind of requirement that went unmet. */
export type UnmetKind = 'env-key' | 'seam-backend' | 'schema';

/** One unmet requirement. PHI-free and secret-value-free by construction. */
export interface UnmetRequirement {
  kind: UnmetKind;
  /** The env/connection key at issue (schema problems carry the seam id here). */
  name: string;
  /** The seam this requirement belongs to, when it is a seam-backend check. */
  seam?: DataModeSeam;
  /** The seam's effective data mode, for a seam-backend check. */
  mode?: DataMode;
  /** The seam's declared disposition, for a seam-backend check. */
  disposition?: SeamDisposition;
  /** The *NotConfiguredError a seam-backend miss would throw at runtime. */
  wouldThrow?: string;
  /** Human-readable, PHI-safe explanation naming the unmet requirement. */
  reason: string;
}

/** The structured readiness report the preflight returns. */
export interface ReadinessReport {
  ready: boolean;
  /** The resolved deploy posture the checks ran against. */
  environment: DeploymentEnvName;
  /** ISO-8601 instant the preflight ran. */
  checkedAt: string;
  /** One-line PHI-safe summary. */
  summary: string;
  /** Every unmet requirement, most actionable first (env keys, then seams). */
  unmet: UnmetRequirement[];
  /** What was inspected, so a green report is not silently empty. */
  checks: {
    envKeysChecked: number;
    seamsChecked: number;
    productionSeamsChecked: number;
  };
}

function checkEnvKeys(env: DeploymentEnvName, unmet: UnmetRequirement[]): number {
  const keys = requiredEnvKeys(env);
  for (const name of keys) {
    if (deploymentValue(name) === '') {
      unmet.push({
        kind: 'env-key',
        name,
        reason: `required env key '${name}' is missing or empty for the '${env}' deployment posture`,
      });
    }
  }
  return keys.length;
}

/**
 * For each seam whose effective mode is production, a `fail-closed-stub` seam
 * with no configured backend connection key is NotConfigured -> not-ready.
 * Returns the count of production-mode seams inspected.
 */
function checkSeamBackends(unmet: UnmetRequirement[]): number {
  let productionSeams = 0;
  for (const seam of DATA_MODE_SEAMS as readonly DataModeSeam[]) {
    const mode = getDataMode(seam);
    if (mode !== 'production') continue;
    productionSeams += 1;
    const entry = SEAM_DISPOSITIONS[seam];
    if (entry.disposition !== 'fail-closed-stub') continue; // real-impl needs no stub key
    const key = seamConnectionKey(seam);
    if (!key) {
      // Guarded by schema completeness, surfaced here too so it can never pass silently.
      unmet.push({
        kind: 'seam-backend',
        name: seam,
        seam,
        mode,
        disposition: entry.disposition,
        reason: `fail-closed-stub seam '${seam}' is in production mode but has no backend connection key declared in the deploy schema`,
      });
      continue;
    }
    // CONVERGENCE (Iteration 9): a substrate-backed seam is wired by the ONE Wave-A
    // bootstrap from DATABASE_URL. Consult the substrate's OWN resolver rather than
    // re-deriving persistence config here, so this preflight can never report ready
    // while bootstrapSubstrate() would throw SubstrateNotConfiguredError at boot.
    if (isSubstrateBackedSeam(seam)) {
      if (substrateConnectionString() === null) {
        unmet.push({
          kind: 'seam-backend',
          name: key, // DATABASE_URL — the single substrate entry
          seam,
          mode,
          disposition: entry.disposition,
          wouldThrow: SubstrateNotConfiguredError.name,
          reason: `substrate-backed seam '${seam}' is NotConfigured: the shared persistence substrate has no connection (set '${key}') — the Wave-A bootstrap would fail closed with ${SubstrateNotConfiguredError.name} at startup (would then throw ${entry.notConfiguredError ?? 'a *NotConfiguredError'} at first use)`,
        });
      }
      continue;
    }
    if (deploymentValue(key) === '') {
      unmet.push({
        kind: 'seam-backend',
        name: key,
        seam,
        mode,
        disposition: entry.disposition,
        wouldThrow: entry.notConfiguredError,
        reason: `required-in-production seam '${seam}' is NotConfigured: backend endpoint key '${key}' is undeclared (missing or empty). The seam fails closed with ${entry.notConfiguredError ?? 'a *NotConfiguredError'} at first use; declare the endpoint before production`,
      });
    }
  }
  return productionSeams;
}

function checkSchema(unmet: UnmetRequirement[]): void {
  for (const problem of connectionKeyCompletenessProblems()) {
    unmet.push({ kind: 'schema', name: 'deploy-schema', reason: problem });
  }
}

/**
 * Run the readiness preflight and return a structured, PHI-safe report.
 * FAIL CLOSED: `ready` is true only when NOTHING is unmet.
 */
export function runPreflight(env: DeploymentEnvName = deploymentEnvName()): ReadinessReport {
  const unmet: UnmetRequirement[] = [];

  checkSchema(unmet);
  const envKeysChecked = checkEnvKeys(env, unmet);
  const productionSeamsChecked = checkSeamBackends(unmet);

  const ready = unmet.length === 0;
  const summary = ready
    ? `ready: '${env}' deployment — all required keys and production seam backends configured`
    : `not-ready: '${env}' deployment — ${unmet.length} unmet requirement(s): ${unmet
        .map((u) => u.name)
        .join(', ')}`;

  return {
    ready,
    environment: env,
    checkedAt: new Date().toISOString(),
    summary,
    unmet,
    checks: {
      envKeysChecked,
      seamsChecked: DATA_MODE_SEAMS.length,
      productionSeamsChecked,
    },
  };
}

/** Thrown by assertReadyOrThrow() at boot when the preflight is not ready. */
export class PreflightNotReadyError extends Error {
  readonly report: ReadinessReport;
  constructor(report: ReadinessReport) {
    super(
      `deployment preflight FAILED (fail-closed): ${report.summary}. ` +
        `Unmet: ${report.unmet.map((u) => `${u.kind}:${u.name}`).join('; ')}`
    );
    this.name = 'PreflightNotReadyError';
    this.report = report;
  }
}

/**
 * Boot-time fail-closed guard: run the preflight and THROW (naming every unmet
 * requirement) when not ready, so a misconfigured production deploy refuses to
 * start rather than booting default-ready.
 */
export function assertReadyOrThrow(env: DeploymentEnvName = deploymentEnvName()): ReadinessReport {
  const report = runPreflight(env);
  if (!report.ready) throw new PreflightNotReadyError(report);
  return report;
}
