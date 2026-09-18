/**
 * ledgerAnalyticsTemplates.ts — the CURATED, deterministic analysis compute bodies for
 * Wave-8 Ledger Intelligence (split from `ledgerAnalytics.ts` for the file-size cap;
 * that module owns the registry, the two gates, and the governed runner).
 *
 * REUSE-FIRST — each body COMPOSES existing logic, reimplementing nothing:
 *   • `reconcile` (reconciliation.ts)          — the recovery-verification re-check
 *   • `verifyLedgerIntegrity` (ledgerIntegrity)— the integrity attestation
 *   • `deriveMemberLiability` (carcGroup.ts)   — the denial-RCA liability disposition
 *
 * PHI-safety: bodies read ONLY PHI-safe structured facts (references / codes / amounts);
 * a deficiency's free-text `detail` is never read (only its `kind` code). Determinism:
 * `now` AND an opaque `nonce` are injected as reproducibility PROBE AXES — a correct body
 * reads NEITHER. The only bodies that read one do so ON PURPOSE (`denial-forecast` reads
 * `now`; `nonce-probe-demo` reads `nonce`), to demonstrate results the RESULT-EVALUATE gate
 * rejects as non-reproducible on each axis.
 */
import {
  latestOfType,
  verifyLedgerIntegrity,
  type EvidenceRecord,
  type StoredIntegrity,
} from '@/lib/evidence';
import { deriveMemberLiability } from '@/lib/graph/mapping/carcGroup';
import type { Normalized835 } from '@/lib/dataSources/remittanceGateway';
import type { EscalationPriority } from '@/lib/agentRuntime';
import { reconcile, type ReconcilePasDecision } from './reconciliation';
import type { AnalysisContext, AnalysisTemplate } from './ledgerAnalytics';

/** The raw, PHI-safe output of a curated analysis before it becomes a finding. */
export interface RawAnalysis {
  summary: string;
  anomaly: boolean;
  data: Record<string, unknown>;
  action: { actionType: string; priority: EscalationPriority; isSubmission: boolean };
}

/** A fixed, distinct probe clock — the reproducibility re-run reads this instead of `now`. */
export const PROBE_NOW = '2000-01-01T00:00:00.000Z';

/**
 * A2: the reproducibility gate perturbs a SECOND injected axis besides the clock — an
 * opaque `nonce`. A correct, reproducible analysis reads NEITHER `now` NOR `nonce`, so the
 * primary run (`PRIMARY_NONCE`) and the probe run (`PROBE_NONCE`) are byte-identical. A body
 * that folds either axis into its output differs between the two runs and the RESULT-EVALUATE
 * gate rejects it — so the gate no longer only catches the one planted clock-reading template.
 */
export const PRIMARY_NONCE = 'nonce-primary';
export const PROBE_NONCE = 'nonce-probe';

const MONITOR = { actionType: 'monitor', priority: 'routine' as const, isSubmission: false };

/** The materiality-driven recovery priority persisted on the record (routine fallback). */
function recoveryPriority(record: EvidenceRecord): EscalationPriority {
  return latestOfType(record, 'recovery')?.priority ?? 'routine';
}

/** Reconstruct a `Normalized835` from the record's PHI-safe remittance fields. */
function toNormalized835(
  rem: Extract<EvidenceRecord['entries'][number], { type: 'remittance' }>,
  code: string
): Normalized835 {
  return {
    remittanceId: rem.remittanceId,
    claimRef: '',
    payer: '',
    code,
    billedAmount: 0,
    paidAmount: rem.paidAmount,
    adjustments: rem.adjustments,
    carcCodes: rem.carcCodes,
    rarcCodes: rem.rarcCodes,
    carcGroups: rem.carcGroups,
    paidDate: '',
  };
}

/**
 * `denial-rca` — the honest EXECUTION step (Wave-9): the analysis genuinely COMPUTES its
 * aggregates from the ACTUAL projected remittance + determination facts (a real
 * deterministic reduction over the projection behind the RESULT-EVALUATE gate), NOT a
 * fixed literal. Reads only PHI-safe structured facts (adjustment group amounts, CARC/RARC
 * codes, deficiency KIND enums) — never a memberId, name, or free-text `detail`. Wall-clock
 * free, so it is reproducible under the perturbed-clock re-run (the result-evaluate gate).
 * True LLM-codegen sandbox execution over the projection is the named production item
 * (FAKE_FIDELITY.md row 7) — this is the deterministic stand-in for that execution step.
 */
function denialRca(record: EvidenceRecord): RawAnalysis {
  const rem = latestOfType(record, 'remittance');
  if (!rem) {
    return {
      summary: 'no remittance on record — no denial to analyze',
      anomaly: false,
      data: { hasRemittance: false },
      action: MONITOR,
    };
  }
  // Real reduction over the actual adjustment lines: per-group totals + aggregates.
  const byGroup: Record<string, number> = {};
  let totalAdjusted = 0;
  for (const a of rem.adjustments) {
    byGroup[a.group] = (byGroup[a.group] ?? 0) + a.amount;
    totalAdjusted += a.amount;
  }
  // Contractual (CO) is the payer-side/appealable write-off; PR is member responsibility.
  const contractualAdjusted = byGroup['CO'] ?? 0;
  const patientResponsibility = byGroup['PR'] ?? 0;
  // The dominant adjustment group, computed over the ACTUAL amounts (deterministic
  // tie-break: the first group reaching the max, iterating the observed groups in order).
  const groups = Object.keys(byGroup);
  const topGroup = groups.reduce<string | null>(
    (best, g) => (best === null || byGroup[g] > byGroup[best] ? g : best),
    null
  );
  const liability = deriveMemberLiability(rem.carcGroups);
  const det = latestOfType(record, 'coverage-determination')?.determination;
  // PHI-safe: only the deficiency KIND (enum code); the free-text `detail` is never read.
  const deficiencyKinds = det ? (det.deficiencies ?? []).map((d) => d.kind) : [];
  const gate = det
    ? {
        stage: 'medical-necessity',
        outcome: det.outcome,
        requiresPA: det.requiresPA,
        deficiencyKinds,
      }
    : null;
  return {
    // A3: CO is the CONTRACTUAL (payer/provider write-off) group — NOT an appealable
    // figure. CO-45 et al. are non-appealable contractual obligations, so the summary
    // reports `contractual=CO/total`, never `appealable=`. A genuine appealable figure
    // would come from the reconciliation delta (`reconcile`), not the CO sum.
    summary: `carc=[${rem.carcCodes.join(',')}] groups=[${rem.carcGroups.join(
      ','
    )}] liability=${liability} contractual=${contractualAdjusted}/${totalAdjusted}${
      gate ? ` frontEndGate=${gate.outcome}` : ''
    }`,
    anomaly: false,
    data: {
      byGroup,
      carcCodes: rem.carcCodes,
      carcGroups: rem.carcGroups,
      memberLiability: liability,
      frontEndGate: gate,
      // Wave-9 computed aggregates (real execution over the projected remittance facts).
      // A3: `contractualAdjusted` (the CO write-off sum) replaces the misnamed
      // `appealableAmount` — CO is non-appealable, so no field claims otherwise.
      totalAdjusted,
      contractualAdjusted,
      patientResponsibility,
      topAdjustmentGroup: topGroup,
      carcCount: rem.carcCodes.length,
      deficiencyCount: deficiencyKinds.length,
    },
    action: { actionType: 'draft-appeal', priority: recoveryPriority(record), isSubmission: false },
  };
}

/** `recovery-verification` — re-run `reconcile` and report agreement vs disagreement. */
function recoveryVerification(record: EvidenceRecord): RawAnalysis {
  const rem = latestOfType(record, 'remittance');
  const recon = latestOfType(record, 'reconciliation');
  // A4: the PAS decision is a REQUIRED input to the recomputed verdict — an approving
  // disposition is what makes a shortfall 'underpaid' (recoverable) rather than
  // 'not-recoverable'. A missing pas-decision must NOT default to 'approved' — that
  // would manufacture a recoverable verdict on a possibly-denied claim (fail-OPEN). Absent
  // ANY required input → present-but-not-verifiable (the same posture as a missing rem/recon).
  const pas = latestOfType(record, 'pas-decision');
  if (!rem || !recon || !pas) {
    return {
      summary:
        'no recorded reconciliation to verify (missing remittance / reconciliation / PAS decision)',
      anomaly: false,
      data: { verifiable: false },
      action: MONITOR,
    };
  }
  const pasDecision = pas.decision as ReconcilePasDecision;
  const recomputed = reconcile({
    pasDecision,
    contractedAllowed: recon.contractedAllowed,
    remittance: toNormalized835(rem, record.order.code),
  });
  const agree =
    recomputed.verdict === recon.verdict && Math.abs(recomputed.delta - recon.delta) < 0.01;
  return {
    summary: `recorded=${recon.verdict}/${recon.delta} recomputed=${recomputed.verdict}/${recomputed.delta} → ${
      agree ? 'agreement' : 'DISAGREEMENT'
    }`,
    anomaly: !agree,
    data: {
      recorded: { verdict: recon.verdict, delta: recon.delta },
      recomputed: { verdict: recomputed.verdict, delta: recomputed.delta },
      agree,
    },
    action: {
      actionType: agree ? 'confirm-reconciliation' : 'escalate-reconciliation-review',
      priority: agree ? 'routine' : 'high',
      isSubmission: false,
    },
  };
}

/** `integrity-check` — reuse `verifyLedgerIntegrity` (or the read-path attestation). */
function integrityCheck(record: EvidenceRecord, ctx: AnalysisContext): RawAnalysis {
  if (!record.seal) {
    return {
      summary: 'ledger unsealed — no integrity attestation available',
      anomaly: false,
      data: { sealed: false },
      action: MONITOR,
    };
  }
  let att: StoredIntegrity | null = null;
  if (ctx.verifier) {
    const v = verifyLedgerIntegrity(record, record.seal, ctx.verifier);
    att = { intact: v.intact, signed: v.signed, reasons: v.reasons };
  } else if (ctx.integrity) {
    att = ctx.integrity;
  }
  if (!att) {
    return {
      summary: 'ledger sealed but no verifier / read-path attestation available',
      anomaly: false,
      data: { sealed: true, verified: false },
      action: MONITOR,
    };
  }
  const tamper = !att.intact || !att.signed;
  return {
    summary: tamper ? `INTEGRITY FAILED: ${att.reasons.join('; ')}` : 'ledger intact + signed',
    anomaly: tamper,
    data: { sealed: true, intact: att.intact, signed: att.signed, reasons: att.reasons },
    action: {
      actionType: tamper ? 'freeze-and-escalate-integrity' : 'monitor',
      priority: tamper ? 'urgent' : 'routine',
      isSubmission: false,
    },
  };
}

/**
 * `denial-forecast` — a DELIBERATELY non-reproducible demo: it folds the injected clock
 * moment into its result (standing in for live-model / generated-code inference), so the
 * result-evaluate re-run under `PROBE_NOW` differs and the gate rejects it.
 */
function denialForecast(record: EvidenceRecord, now: string): RawAnalysis {
  const base = latestOfType(record, 'propensity')?.score ?? 0;
  return {
    summary: `denial-likelihood forecast asOf=${now} base=${base}`,
    anomaly: false,
    data: { forecastAsOf: now, base },
    action: MONITOR,
  };
}

/**
 * A2: `nonce-probe-demo` — a DELIBERATELY non-reproducible demo on the SECOND (nonce) axis.
 * It folds the injected `nonce` into its output, so it is identical between two clock values
 * but DIFFERS between the primary and probe nonce → the strengthened RESULT-EVALUATE gate
 * rejects it. Proves the gate catches non-determinism the clock axis alone would miss.
 */
function nonceProbeDemo(nonce: string): RawAnalysis {
  return {
    summary: `nonce-dependent result nonce=${nonce}`,
    anomaly: false,
    data: { seenNonce: nonce },
    action: MONITOR,
  };
}

/** Dispatch the curated analysis body. Pure; `now` + `nonce` are injected probe axes. */
export function computeAnalysis(
  template: AnalysisTemplate,
  record: EvidenceRecord,
  ctx: AnalysisContext,
  now: string,
  nonce: string = PRIMARY_NONCE
): RawAnalysis {
  switch (template.id) {
    case 'denial-rca':
      return denialRca(record);
    case 'recovery-verification':
      return recoveryVerification(record);
    case 'integrity-check':
      return integrityCheck(record, ctx);
    case 'denial-forecast':
      return denialForecast(record, now);
    case 'nonce-probe-demo':
      return nonceProbeDemo(nonce);
    default:
      // Unreachable for in-scope templates (member-cohort-drilldown is plan-rejected).
      return {
        summary: `no curated analysis for ${template.id}`,
        anomaly: false,
        data: {},
        action: MONITOR,
      };
  }
}
