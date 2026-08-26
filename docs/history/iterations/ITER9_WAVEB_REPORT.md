# Iteration 9 — Wave B (Deployment / Config) Report

Framework v1.2. Role B2, disjoint tree. Owned surface only: `src/lib/deploy/`,
`src/app/api/health/`, `tests/deploy/*`, `tests/api/routes-health.test.ts`, plus
an append-only deployment-keys block in the shared `src/lib/server/env.ts`. No
`substrate/` (A) or `lifecycle/` (C) file touched.

## What was built

### 1. Deployment config schema — `src/lib/deploy/schema.ts`
Pure, side-effect-free policy-as-data:
- `REQUIRED_ENV_KEYS` — required server-only env keys per posture
  (development: none; staging: `SESSION_SECRET`; production: `SESSION_SECRET` +
  the four WSO2 OAuth keys — mirrors the existing `requireSessionSecret` /
  `requireWso2` fail-closed assertions).
- `SEAM_CONNECTION_KEYS` — one backend-connection env key per `fail-closed-stub`
  seam (14 seams, read from `seamDispositions.ts`). Presence of a non-empty value
  is what signals the seam's real production backend is wired.
- `connectionKeyCompletenessProblems()` / `assertConnectionKeyCompleteness()` —
  self-validation so a new fail-closed-stub seam with no key mapping (or a key
  pointing at a non-stub/unregistered seam) cannot ship silently.

### 2. Startup PREFLIGHT — `src/lib/deploy/preflight.ts`
`runPreflight(env?)` reads the deploy posture (`deploymentEnvName()`), each seam's
effective mode (`getDataMode()`), and the dispositions, then FAILS CLOSED when:
- a required env key for the posture is missing/empty (E9), or
- a `fail-closed-stub` seam whose effective mode is `production` has no configured
  backend key — it is NotConfigured and would throw its `*NotConfiguredError`.

Returns a structured, PHI-safe `ReadinessReport { ready, environment, checkedAt,
summary, unmet[], checks }`. Each `unmet` entry NAMES the requirement: env key
name, or seam id + connection key + the exact error it would throw. `ready` is
strictly `unmet.length === 0` — never default-ready. The report records key
NAMES and presence only, never secret VALUES (verified by test). No backend
resolver is imported, so inspecting a seam has no side effect.
`assertReadyOrThrow()` is the boot-time guard: throws `PreflightNotReadyError`
naming every unmet requirement so a misconfigured production deploy refuses to
start.

### 3. Health routes — `src/app/api/health/`
- `readiness/route.ts` — GET runs the preflight; 200 when ready, 503 when not,
  body names the unmet requirements. Unexpected preflight failure is itself
  treated as not-ready (503, fail closed), never 200. `force-dynamic`, unauth
  (config posture only, no PHI).
- `liveness/route.ts` — GET cheap process check, always 200
  (`{status:'alive', uptimeSeconds, pid, ts}`). Does not run the preflight or
  touch env/backends.

### 4. Shared `env.ts` append (deployment-keys block only)
`DEPLOYMENT_ENV_NAMES` / `DeploymentEnvName`, `deploymentEnvName()` (DEPLOY_ENV >
NODE_ENV=production > development), and `deploymentValue(name)` (raw, trimmed,
'' when unset — a blank value is never counted as configured).

## Tests (22 new)
- `tests/deploy/schema.test.ts` (9) — completeness, every stub seam mapped, no
  drift, per-posture required keys, frozen, `allDeploymentKeys()`.
- `tests/deploy/preflight.test.ts` (9) — ready paths (dev, prod-all-set,
  prod-seam-configured); fail-closed naming a missing prod key (E9), a
  NotConfigured seam (seam + key + `wouldThrow`), a blank key; never-default-ready
  invariant; `assertReadyOrThrow` throws/returns; report PHI-safe + no secret
  values.
- `tests/api/routes-health.test.ts` (4) — readiness 200 ready / 503 not-ready
  (missing key) / 503 NotConfigured seam, all PHI-safe; liveness 200 regardless
  of config.

## Verification (in /home/claude/baseline)
- `npx tsc --noEmit` — 0 errors.
- `npx vitest run tests/deploy tests/api` — 17 files, 197 passed / 9 skipped
  (my 22 all green); no regressions.
- `bash check-file-sizes.sh` — PASS (ratchet intact; all new files well under
  cap: largest is preflight.ts at 206/400; largest test 156/500).

## DoD
Composite v1.2 met: preflight fails closed naming the unmet requirement; readiness
route reflects it (503 with named unmet, 200 only when truly ready). E9 satisfied:
readiness never default-ready; a missing production key fails the preflight.
