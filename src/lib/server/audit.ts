/**
 * Append-only, PHI-safe audit trail (plan F-6).
 *
 * Every privileged BFF action emits an AuditEvent. The event stores *references*
 * (resourceType/id, actor, action, correlation id) — NEVER PHI payloads.
 * `redactPhi` + `assertPhiSafe` back the unit-test gate that no PHI leaks.
 *
 * The sink here is a JSONL file (or console fallback). In production replace the
 * sink with an append-only store / FHIR AuditEvent per the blueprint — the
 * public API (`audit`) stays the same.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { getAuditLedger } from './auditLedger';

export interface AuditEvent {
  ts: string; // ISO timestamp (caller supplies to stay deterministic/testable)
  actor: string; // e.g. "practitioner:123" | "system" | "member:456"
  action: string; // e.g. "fhir.read" | "auth.login" | "pas.submit"
  resourceRef?: string; // e.g. "Patient/101" — a reference, not the resource
  correlationId: string;
  outcome: 'success' | 'failure';
  detail?: string; // short, PHI-free note
}

/** Fields that commonly carry PHI in FHIR/JSON — dropped before logging. */
const PHI_KEYS = new Set([
  'name',
  'given',
  'family',
  'telecom',
  'address',
  'birthDate',
  'gender',
  'photo',
  'contact',
  'communication',
  'text',
  'note',
  'valueString',
  'ssn',
  'identifierValue',
]);

/**
 * Recursively strip likely-PHI keys from an arbitrary object, keeping only
 * structural references (resourceType, id, reference, code, system, status).
 */
export function redactPhi<T>(input: T): unknown {
  if (Array.isArray(input)) return input.map((v) => redactPhi(v));
  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (PHI_KEYS.has(k)) {
        out[k] = '[redacted]';
        continue;
      }
      out[k] = redactPhi(v);
    }
    return out;
  }
  return input;
}

/** Test gate: throws if a serialized audit event still contains PHI-marked keys. */
export function assertPhiSafe(event: AuditEvent): void {
  const serialized = JSON.stringify(event);
  // The event shape has no PHI fields by construction; this guards regressions.
  for (const key of PHI_KEYS) {
    if (new RegExp(`"${key}"\\s*:`).test(serialized)) {
      throw new Error(`Audit event contains PHI-bearing key "${key}"`);
    }
  }
}

function auditFilePath(): string {
  const dir = process.env.AUDIT_LOG_DIR || path.join(process.cwd(), '.audit');
  return path.join(dir, 'audit.log.jsonl');
}

/** Append an audit event. Never throws to the caller (audit must not break flows). */
export async function audit(event: AuditEvent): Promise<void> {
  try {
    assertPhiSafe(event);
    // Tamper-evident chain (AUD-01): append to the hash-linked ledger. In demo/mock
    // this is the in-memory process chain; production (AUDIT_LEDGER=durable) uses the
    // registered durable ledger, or raises the fallback below if none is configured
    // (never silently pretends an in-memory Map is durable).
    await getAuditLedger(process.env.AUDIT_LEDGER === 'durable').append(event);
    const line = JSON.stringify(event) + '\n';
    const file = auditFilePath();
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.appendFile(file, line, 'utf8');
  } catch (err) {
    // Fallback so an unwritable disk never blocks a request; still no PHI.
    // eslint-disable-next-line no-console
    console.warn(
      '[audit] fallback:',
      event.action,
      event.outcome,
      event.correlationId,
      String(err)
    );
  }
}
