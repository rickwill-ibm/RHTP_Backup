/**
 * Browser → BFF client (Slices 1-6). Client components call ONLY RHTP's own
 * /api routes here; never FHIR/APIM directly (plan §1.4).
 */
import type { OperationOutcome } from '@/lib/fhir/operationOutcome';

export interface BffResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: OperationOutcome;
}

const REQUEST_TIMEOUT_MS = 12000;

async function request<T>(path: string, init?: RequestInit): Promise<BffResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(path, {
      ...init,
      signal: controller.signal,
      headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
    });
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) {
      return { ok: false, status: res.status, data: null, error: body ?? undefined };
    }
    return { ok: true, status: res.status, data: body as T };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: {
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'exception', diagnostics: String(err) }],
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Read a FHIR resource/search through the BFF: fhirGet('Patient/101') or fhirGet('Coverage?patient=101'). */
export function fhirGet<T = unknown>(fhirPath: string): Promise<BffResult<T>> {
  return request<T>(`/api/fhir/${fhirPath.replace(/^\//, '')}`);
}

export function postJson<T = unknown>(
  path: string,
  body: unknown,
  headers?: Record<string, string>
): Promise<BffResult<T>> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(headers ?? {}) },
    body: JSON.stringify(body),
  });
}

export function getJson<T = unknown>(path: string): Promise<BffResult<T>> {
  return request<T>(path);
}
