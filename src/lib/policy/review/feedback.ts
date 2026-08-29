/**
 * Feedback + audit loop — turns encoding-review decisions into (1) append-only audit records for the
 * evidence ledger (structural fields carry no PHI; free-text reviewer notes are classified as such),
 * and (2) a versioned coding-map OVERRIDE the engine consults next
 * time (the "learn from the specialist" loop). Pure and deterministic — the caller supplies ids +
 * timestamps + the reviewer reference, and persists the records into the immutable `evidence/`
 * ledger. Nothing here writes to a store or reads a clock.
 */
import type { ReviewSection } from '@/lib/policy/review/encodingReview';
import type { CodingMapContribution } from '@/lib/policy/review/fromPolicyReview';
import type { CoverageRole } from '@/lib/policy/dtr/questionnairePackage';

/**
 * An append-only audit record of one reviewer decision. Structural fields carry references + codes
 * (no PHI). NOTE: `reason` and `correctedTo` are FREE-TEXT reviewer input — a reviewer could type
 * PHI there — so treat those two fields with the same classification as reviewer notes, not as
 * guaranteed-safe. `label`/`source` (which carry policy prose) are deliberately NOT copied here.
 */
export interface EncodingAuditRecord {
  policyId: string;
  tenant: string | null;
  /** Reviewer reference, e.g. 'Practitioner/rev-1' — never a free-text name. */
  reviewer: string;
  timestamp: string;
  elementId: string;
  kind: string;
  code?: string;
  decision: 'accepted' | 'rejected' | 'edited' | 'confirmed';
  reason?: string;
  correctedTo?: string;
  improves: ('coding-map' | 'extractor')[];
}

export interface AuditContext {
  policyId: string;
  tenant: string | null;
  reviewer: string;
  timestamp: string;
}

/** Project every DECIDED element into an audit record (open elements are not yet decisions). */
export function correctionsToAuditRecords(
  sections: ReviewSection[],
  ctx: AuditContext
): EncodingAuditRecord[] {
  const out: EncodingAuditRecord[] = [];
  for (const section of sections) {
    for (const el of section.elements) {
      if (el.state === 'open') continue;
      out.push({
        policyId: ctx.policyId,
        tenant: ctx.tenant,
        reviewer: ctx.reviewer,
        timestamp: ctx.timestamp,
        elementId: el.id,
        kind: el.kind,
        code: el.code,
        decision: el.state,
        reason: el.correction?.reason,
        correctedTo: el.correction?.correctedTo,
        improves: el.correction?.improves ?? [],
      });
    }
  }
  return out;
}

/* ---- Coding-map override store (the learning) ---- */

/** A durable override a reviewer's correction produces, applied to future coding-map proposals. */
export interface CodingMapOverride {
  code: string;
  /** Set a corrected coverage role. */
  role?: CoverageRole;
  /** Suppress a code the extractor/coding-map should stop proposing (e.g. a defect like I10). */
  suppressed?: boolean;
  note: string;
  reviewer: string;
  timestamp: string;
  version: number;
}

/** Derive overrides from the corrections captured on a review (edits + rejects of coded elements). */
export function overridesFromReview(
  sections: ReviewSection[],
  ctx: AuditContext,
  startVersion = 1
): CodingMapOverride[] {
  const out: CodingMapOverride[] = [];
  let version = startVersion;
  for (const section of sections) {
    for (const el of section.elements) {
      if (!el.code) continue;
      if (el.state === 'rejected') {
        out.push({
          code: el.code,
          suppressed: true,
          note: el.correction?.reason ?? 'rejected in review',
          reviewer: ctx.reviewer,
          timestamp: ctx.timestamp,
          version: version++,
        });
      } else if (el.state === 'edited' && el.correction) {
        out.push({
          code: el.code,
          role: el.role,
          note: el.correction.reason,
          reviewer: ctx.reviewer,
          timestamp: ctx.timestamp,
          version: version++,
        });
      }
    }
  }
  return out;
}

/**
 * Apply the stored overrides to a fresh coding-map contribution before it reaches the reviewer, so
 * a previously-corrected code comes back already fixed (suppressed, or role-assigned) — the loop
 * closing. Latest override per code wins (highest version). Pure; returns a new contribution.
 */
export function applyOverrides(
  contribution: CodingMapContribution,
  overrides: CodingMapOverride[]
): CodingMapContribution {
  const latest = new Map<string, CodingMapOverride>();
  for (const o of overrides) {
    const cur = latest.get(o.code);
    // Highest version wins; on a version tie the later timestamp wins (deterministic, not
    // array-order dependent) — matters when merging overrides from separately-numbered reviews.
    if (
      !cur ||
      o.version > cur.version ||
      (o.version === cur.version && o.timestamp > cur.timestamp)
    ) {
      latest.set(o.code, o);
    }
  }

  const roles: Record<string, CoverageRole> = { ...(contribution.roles ?? {}) };
  const flags = { ...(contribution.flags ?? {}) };
  const suppressed = new Set<string>();
  for (const [code, o] of latest) {
    if (o.suppressed) {
      suppressed.add(code);
      delete roles[code];
      delete flags[code];
    } else if (o.role) {
      roles[code] = o.role;
      delete flags[code]; // a resolved role clears the "assign role" flag
    }
  }

  const diagnoses = (contribution.diagnoses ?? []).filter((d) => !suppressed.has(d.code));

  return {
    ...contribution,
    roles,
    flags,
    diagnoses,
  };
}
