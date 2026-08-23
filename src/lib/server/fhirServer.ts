import * as clock from '@/lib/clock'; // deterministic time/rng seam (test setters: setClock/setRng)
/**
 * Server-side FHIR gateway client (plan F-4).
 *
 * The browser NEVER calls FHIR/APIM directly — it calls /api/fhir/* which calls
 * this module. Here we (1) target the APIM gateway, (2) inject the SMART bearer
 * token from the server-held session, (3) mint/propagate a correlation id,
 * (4) retain the RAW FHIR alongside a view model, and (5) validate writes.
 *
 * This wraps — does not replace — the existing src/lib/services/fhirClient.ts
 * (which stays as the browser-facing, mock-capable client that now points at
 * /api/fhir instead of the FHIR server).
 */
import { serverEnv } from './env';
import { getAccessToken } from './smartSession';
import { CORRELATION_HEADER, newCorrelationId } from './correlation';
import { audit } from './audit';
import { validate } from '../fhir/validate';
import { toOperationOutcome, type OperationOutcome } from '../fhir/operationOutcome';

export interface FhirResult<T = unknown> {
  ok: boolean;
  status: number;
  /** The unmodified FHIR resource/bundle (retained for audit + traceability). */
  raw: T | null;
  /** A stable projection for the UI. TODO: delegate to fhirResourceMappers. */
  vm: T | null;
  error?: OperationOutcome;
  correlationId: string;
}

export interface FhirCallContext {
  actor?: string; // "practitioner:123" | "member:456" | "system"
  correlationId?: string;
}

const FHIR_TIMEOUT = Number(process.env.FHIR_TIMEOUT ?? 30_000);

async function call<T>(
  method: 'GET' | 'POST' | 'PUT',
  fhirPath: string,
  ctx: FhirCallContext,
  body?: unknown
): Promise<FhirResult<T>> {
  const env = serverEnv();
  const correlationId = ctx.correlationId ?? newCorrelationId();
  const url = `${env.fhirGatewayBase.replace(/\/$/, '')}/${fhirPath.replace(/^\//, '')}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FHIR_TIMEOUT);

  try {
    const token = await getAccessToken();
    const res = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/fhir+json',
        'Content-Type': 'application/fhir+json',
        Authorization: `Bearer ${token}`,
        [CORRELATION_HEADER]: correlationId,
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });

    const text = await res.text();
    const parsed = text ? (JSON.parse(text) as T) : null;

    await audit({
      ts: clock.nowIso(),
      actor: ctx.actor ?? 'unknown',
      action: `fhir.${method.toLowerCase()}`,
      resourceRef: fhirPath,
      correlationId,
      outcome: res.ok ? 'success' : 'failure',
      detail: `status ${res.status}`,
    });

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        raw: parsed,
        vm: null,
        error: toOperationOutcome(parsed ?? `FHIR ${res.status}`),
        correlationId,
      };
    }
    // vm currently mirrors raw; provision slices swap in fhirResourceMappers.
    return { ok: true, status: res.status, raw: parsed, vm: parsed, correlationId };
  } catch (err) {
    await audit({
      ts: clock.nowIso(),
      actor: ctx.actor ?? 'unknown',
      action: `fhir.${method.toLowerCase()}`,
      resourceRef: fhirPath,
      correlationId,
      outcome: 'failure',
      detail: 'exception',
    });
    return {
      ok: false,
      status: 0,
      raw: null,
      vm: null,
      error: toOperationOutcome(err),
      correlationId,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function fhirRead<T = unknown>(
  fhirPath: string,
  ctx: FhirCallContext = {}
): Promise<FhirResult<T>> {
  return call<T>('GET', fhirPath, ctx);
}

export function fhirSearch<T = unknown>(
  type: string,
  query: string,
  ctx: FhirCallContext = {}
): Promise<FhirResult<T>> {
  const q = query.startsWith('?') ? query : `?${query}`;
  return call<T>('GET', `${type}${q}`, ctx);
}

export async function fhirCreate<T = unknown>(
  type: string,
  resource: unknown,
  ctx: FhirCallContext = {}
): Promise<FhirResult<T>> {
  const oo = validate(resource, type);
  if (oo && oo.issue.some((i) => i.severity === 'error' || i.severity === 'fatal')) {
    return {
      ok: false,
      status: 422,
      raw: null,
      vm: null,
      error: oo,
      correlationId: ctx.correlationId ?? newCorrelationId(),
    };
  }
  return call<T>('POST', type, ctx, resource);
}
