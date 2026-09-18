/**
 * auditProjection.ts — PHI-safe projection of the Evidence Record to AuditEvents.
 *
 * Extracted from `evidenceRecord.ts` to keep that audit-spine module under the
 * file-size cap (AI-CODING-CONVENTIONS §2/§3). Same public surface: `toAuditEvents`
 * is re-exported from `@/lib/evidence`. Projects references + codes + amounts only,
 * never clinical narrative or member free-text.
 */
import type { AuditEvent } from '@/lib/server/audit';
import type { EvidenceRecord } from './evidenceRecord';

/**
 * Project the record's entries to PHI-safe AuditEvents (references + codes only,
 * no clinical narrative). Wires the Evidence Record into the existing audit
 * spine without leaking PHI.
 */
export function toAuditEvents(record: EvidenceRecord, correlationId: string): AuditEvent[] {
  return record.entries.map((e) => {
    const base: AuditEvent = {
      ts: e.ts,
      actor: e.actor ?? 'system',
      action: `evidence.${e.type}`,
      resourceRef: `Evidence/${record.id}#${e.id}`,
      correlationId,
      outcome: 'success',
    };
    switch (e.type) {
      case 'coverage-determination':
        return {
          ...base,
          detail: `${record.order.code} → ${e.determination.outcome} (requiresPA=${e.determination.requiresPA}, propensity=${e.determination.propensityToDeny})`,
        };
      case 'gold-card':
        return {
          ...base,
          detail: `${record.order.code} gold-card applied=${e.exemption.applied} basis=${e.exemption.basis ?? 'n/a'}`,
        };
      case 'pas-submission':
        // PHI-safe: the approver reference is a Practitioner id, not member data.
        return { ...base, detail: `${record.order.code} submitted by ${e.approver.reference}` };
      case 'pas-decision':
        return { ...base, detail: `${record.order.code} decision=${e.decision}` };
      case 'claim-submission':
        return {
          ...base,
          detail: `${record.order.code} claim=${e.claimRef} total=${e.total}`,
        };
      case 'remittance':
        // PHI-safe: remittance ref, paid amount, and adjustment group totals /
        // CARC/RARC codes only — no member data.
        return {
          ...base,
          detail: `${record.order.code} remittance=${e.remittanceId} paid=${e.paidAmount} adj=[${e.adjustments
            .map((a) => `${a.group}:${a.amount}`)
            .join(',')}] carc=[${e.carcCodes.join(',')}] rarc=[${e.rarcCodes.join(',')}]`,
        };
      case 'reconciliation':
        return {
          ...base,
          detail: `${record.order.code} verdict=${e.verdict} allowed=${e.contractedAllowed} paid=${e.paidAmount} delta=${e.delta} tolerance=${e.toleranceApplied}`,
        };
      case 'underpayment':
        return {
          ...base,
          detail: `${record.order.code} underpayment delta=${e.delta} basis=${e.basis}`,
        };
      case 'recovery':
        return {
          ...base,
          detail: `${record.order.code} recovery ${e.action} status=${e.status} rung=${e.rung}`,
        };
      case 'submission':
        // Wave-4 must-fix 1/6: PHI-safe + honest mock labeling — submission ref,
        // channel (mock, not-transmitted), rung, and the deciding-reviewer reference
        // only. No member free-text.
        return {
          ...base,
          detail: `${record.order.code} submission=${e.submissionRef} channel=${e.channel} rung=${e.rung} decidedBy=${e.decidedBy}`,
        };
      case 'recovery-decision':
        // Wave-4 must-fix 4: PHI-safe terminal lifecycle marker — status + reviewer.
        return {
          ...base,
          detail: `${record.order.code} recovery-decision=${e.status} decidedBy=${e.decidedBy}`,
        };
      case 'governed-action':
        // Wave-9: PHI-safe governed-action lifecycle line — the action code, lifecycle
        // status, submission class, rung, channel and the deciding-reviewer reference
        // only. The member-embedding `ref`/`claimId` fields are DELIBERATELY omitted so
        // the projection stays PHI-safe even through `projectForParty` (which masks the
        // record/entry ids but not entry payload fields).
        return {
          ...base,
          detail: `${record.order.code} governed-action=${e.actionType} status=${e.status} submission=${e.isSubmission} rung=${e.rung} channel=${e.channel} decidedBy=${e.decidedBy}`,
        };
      default:
        return { ...base, detail: `${record.order.code} ${e.type}` };
    }
  });
}
