import * as clock from '@/lib/clock'; // deterministic time/rng seam (test setters: setClock/setRng)
/**
 * runtimeConfig.ts — server-side runtime configuration store
 *
 * Reads from / writes to .rhtp-config.json at the project root.
 * Env vars provide the safe defaults; the config file overrides them at runtime
 * without requiring a server restart or env var change.
 *
 * Used by:
 *   - GET  /api/config-status  (read current config)
 *   - POST /api/config-status  (write updated config)
 *   - GET  /api/postman-environment  (generate env file from current config)
 *   - POST /api/postman-run         (pass config to Newman runner)
 */

import fs from 'fs';
import path from 'path';
import { DEMO_MEMBER_ID } from '@/lib/config/demoDefaults';

// ─── Shape ────────────────────────────────────────────────────────────────────

export interface RuntimeConfig {
  /** 'mock' | 'production' — master data-source switch */
  mode: 'mock' | 'production';

  /** FHIR R4 server base URL (Tier A+: HAPI, Tier B: WSO2 APIM gateway) */
  fhirGatewayBase: string;

  /** CDS Hooks gateway base URL */
  cdsGatewayBase: string;

  /** Bulk export gateway base URL */
  bulkGatewayBase: string;

  /** WSO2 IS authorize endpoint (empty in mock mode) */
  wso2AuthorizeUrl: string;

  /** WSO2 IS token endpoint (empty in mock mode) */
  wso2TokenUrl: string;

  /** WSO2 APIM client ID (empty in mock mode) */
  wso2ClientId: string;

  /** Whether dev-mock auth is active (bypasses WSO2 PKCE) */
  allowDevMockAuth: boolean;

  /** Active patient for Postman suite runs */
  postmanPatientId: string;

  /** Reviewer email injected into PAS human-gate approval requests */
  postmanReviewerEmail: string;

  /** Ordering provider NPI for financial clearance / evidence record */
  postmanProviderNpi: string;

  /** Which mandate sections to include in generated collection / runs */
  postmanScopes: {
    patientAccess: boolean;
    providerAccess: boolean;
    payerToPayer: boolean;
    priorAuth: boolean;
    infrastructure: boolean;
  };

  /** ISO timestamp of last save */
  lastSaved: string | null;
}

// ─── Defaults (env-var seeded) ────────────────────────────────────────────────

export function getDefaultConfig(): RuntimeConfig {
  const useMock = (process.env.NEXT_PUBLIC_USE_MOCK_DATA ?? 'true').toLowerCase() === 'true';
  return {
    mode: useMock ? 'mock' : 'production',
    fhirGatewayBase: process.env.FHIR_GATEWAY_BASE ?? 'http://localhost:8090/fhir',
    cdsGatewayBase: process.env.CDS_GATEWAY_BASE ?? 'http://localhost:9096',
    bulkGatewayBase: process.env.BULK_GATEWAY_BASE ?? 'http://localhost:8091/bulk',
    wso2AuthorizeUrl: process.env.WSO2_AUTHORIZE_URL ?? '',
    wso2TokenUrl: process.env.WSO2_TOKEN_URL ?? '',
    wso2ClientId: process.env.WSO2_CLIENT_ID ?? '',
    // Fail-closed default: OFF unless explicitly opted in (mirrors server/env.ts). (U1 fix)
    allowDevMockAuth: (process.env.ALLOW_DEV_MOCK_AUTH ?? 'false').toLowerCase() === 'true',
    postmanPatientId: DEMO_MEMBER_ID,
    postmanReviewerEmail: 'reviewer@rhtp-health.org',
    postmanProviderNpi: '1730154783',
    postmanScopes: {
      patientAccess: true,
      providerAccess: true,
      payerToPayer: true,
      priorAuth: true,
      infrastructure: true,
    },
    lastSaved: null,
  };
}

// ─── File path ────────────────────────────────────────────────────────────────

const CONFIG_PATH = path.resolve(process.cwd(), '.rhtp-config.json');

// ─── Read ──────────────────────────────────────────────────────────────────────

export function readRuntimeConfig(): RuntimeConfig {
  const defaults = getDefaultConfig();
  if (!fs.existsSync(CONFIG_PATH)) return defaults;
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const saved = JSON.parse(raw) as Partial<RuntimeConfig>;
    // Merge: saved values win over defaults, but unknown keys from defaults fill gaps
    return { ...defaults, ...saved };
  } catch {
    return defaults;
  }
}

// ─── Write ────────────────────────────────────────────────────────────────────

export function writeRuntimeConfig(patch: Partial<RuntimeConfig>): RuntimeConfig {
  const current = readRuntimeConfig();
  const next: RuntimeConfig = {
    ...current,
    ...patch,
    // Deep-merge postmanScopes so partial updates work
    postmanScopes: {
      ...current.postmanScopes,
      ...(patch.postmanScopes ?? {}),
    },
    lastSaved: clock.nowIso(),
  };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** True when the effective mode is production (live FHIR server). */
export function isProductionMode(): boolean {
  return readRuntimeConfig().mode === 'production';
}
