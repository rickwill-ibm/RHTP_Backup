// SEAM: jobs  // WPC-01 Phase 5
/**
 * Service-token auth for the ops jobs surface (machine callers like Airflow, not
 * session users). Fail-closed: if OPS_JOBS_TOKEN is unset the surface is 503 (not
 * open); a missing/mismatched bearer token is 401. Comparison is timing-safe.
 */
import { timingSafeEqual } from 'node:crypto';

export interface OpsAuthResult {
  ok: boolean;
  status: number;
  reason: string;
}

export function checkOpsJobsAuth(authorizationHeader: string | null): OpsAuthResult {
  const expected = process.env.OPS_JOBS_TOKEN;
  if (!expected) return { ok: false, status: 503, reason: 'ops jobs auth not configured' };
  const provided = parseBearer(authorizationHeader);
  if (!provided) return { ok: false, status: 401, reason: 'missing bearer token' };
  if (!safeEqual(provided, expected)) return { ok: false, status: 401, reason: 'invalid token' };
  return { ok: true, status: 200, reason: 'ok' };
}

function parseBearer(h: string | null): string | null {
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
