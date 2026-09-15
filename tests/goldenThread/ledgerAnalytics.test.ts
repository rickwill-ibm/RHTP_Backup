/**
 * ledgerAnalytics.ts — Wave-8 Ledger Intelligence: curated, deterministic analyses run
 * over the party-scoped projection behind two REAL gates (plan-validate + result-evaluate).
 *
 * Proves the module COMPOSES (never re-derives): the recovery-verification re-check via
 * `reconcile`, the integrity attestation via `verifyLedgerIntegrity`, the action rung via
 * `evaluateInterlock` (NOT hardcoded), and the ticket via the Wave-7 `routeEscalation`.
 * Covers BOTH gate-failure paths (plan-rejected out-of-scope + PHI-unsafe; eval-rejected
 * non-reproducible), the interlock-derived rung, the disagreement→ticket path, the
 * tamper→ticket path, PHI-safety, and determinism.
 */
import { describe, it, expect } from 'vitest';
import {
  createEvidenceRecord,
  recordDetermination,
  recordRemittance,
  recordReconciliation,
  recordRecovery,
  recordPasDecision,
  sealRecord,
  type EvidenceRecord,
  type EvidenceTier,
  type SigningKey,
} from '@/lib/evidence';
import { MASKED_RECORD_REF } from '@/lib/evidence/partyView';
import { createMemoryProposalInbox, loadEscalationPolicies } from '@/lib/agentRuntime';
import type { CoverageDetermination } from '@/lib/policy';
import { runAnalysis, ANALYSES, type AnalysisContext } from '@/lib/goldenThread/ledgerAnalytics';
import {
  computeAnalysis,
  PROBE_NOW,
  PRIMARY_NONCE,
  PROBE_NONCE,
} from '@/lib/goldenThread/ledgerAnalyticsTemplates';

const MEMBER = 'MARIA_SD_001';
const REC_ID = `ev-${MEMBER}-72148-1756512000000`;
const NOW = '2026-06-01T00:00:00.000Z';
const KEY: SigningKey = { keyId: 'demo-hmac-v1', secret: 'top-secret' };

function base(): EvidenceRecord {
  return createEvidenceRecord({
    id: REC_ID,
    memberId: MEMBER,
    order: { code: '72148' },
    createdAt: NOW,
  });
}

function determination(over: Partial<CoverageDetermination> = {}): CoverageDetermination {
  return {
    order: { code: '72148' } as CoverageDetermination['order'],
    memberId: MEMBER,
    outcome: 'pa-required-criteria-review',
    requiresPA: true,
    criteriaMet: false,
    matchedPolicies: [],
    indicationsConsidered: [],
    deficiencies: [
      { kind: 'missing-documentation', detail: 'MEMBER CLINICAL NOTE — must never leak' },
    ],
    propensityToDeny: 71,
    rationale: 'demo',
    ...over,
  };
}

/** A record with a denial (remittance + a front-end review gate). */
function denialRecord(): EvidenceRecord {
  let r = recordDetermination(base(), {
    id: `${REC_ID}-det`,
    ts: NOW,
    determination: determination(),
  });
  r = recordRemittance(r, {
    id: `${REC_ID}-rem`,
    ts: NOW,
    remittanceId: 'rem-1',
    paidAmount: 50,
    adjustments: [
      { group: 'CO', amount: 30 },
      { group: 'PR', amount: 20 },
    ],
    carcCodes: ['197'],
    rarcCodes: [],
    carcGroups: ['CO', 'PR'],
  });
  return r;
}

/**
 * A record whose recorded reconciliation matches what `reconcile` recomputes. A4: it carries
 * an explicit PAS decision (the REQUIRED input to the recomputed verdict) so recovery-
 * verification is verifiable — a missing pas-decision now yields present-but-not-verifiable.
 */
function reconciledRecord(
  verdict: 'matched' | 'underpaid',
  delta: number,
  opts?: { omitPasDecision?: boolean }
): EvidenceRecord {
  let r = recordRemittance(base(), {
    id: `${REC_ID}-rem`,
    ts: NOW,
    remittanceId: 'rem-1',
    paidAmount: 50,
    adjustments: [{ group: 'CO', amount: 0 }],
    carcCodes: ['45'],
    rarcCodes: [],
    carcGroups: ['CO'],
  });
  r = recordReconciliation(r, {
    id: `${REC_ID}-recon`,
    ts: NOW,
    verdict,
    contractedAllowed: 100,
    paidAmount: 50,
    delta,
    toleranceApplied: 5,
  });
  // A4: the PAS decision drives the recomputed verdict — present (approved) so the
  // verification is verifiable (unless a test explicitly omits it).
  if (!opts?.omitPasDecision) {
    r = recordPasDecision(r, {
      id: `${REC_ID}-pas`,
      ts: NOW,
      authId: 'auth-1',
      decision: 'approved',
    });
  }
  // A recovery draft so the routed ticket carries a real queue item.
  r = recordRecovery(r, {
    id: `${REC_ID}-recovery`,
    ts: NOW,
    action: 'draft-appeal',
    rung: 'A1',
    remittanceId: 'rem-1',
    priority: 'high',
    taskEvidenceTier: 'D3',
  });
  return r;
}

function ctx(over: Partial<AnalysisContext> = {}): AnalysisContext {
  return {
    now: NOW,
    manifestTier: 'HITL',
    inbox: createMemoryProposalInbox(),
    policies: loadEscalationPolicies(),
    escalationPolicyRef: 'default',
    ...over,
  };
}

describe('ANALYSES registry', () => {
  it('is a small typed set with the required kinds + a gate-failure demo of each', () => {
    const ids = ANALYSES.map((a) => a.id);
    expect(ids).toContain('denial-rca');
    expect(ids).toContain('recovery-verification');
    expect(ids).toContain('integrity-check');
    // A PHI-unsafe (plan-reject) demo and a non-reproducible (eval-reject) demo.
    expect(ANALYSES.find((a) => a.id === 'member-cohort-drilldown')?.reads).toContain('memberId');
    expect(ids).toContain('denial-forecast');
  });
});

describe('runAnalysis — denial-rca (RCA over the projection)', () => {
  it('aggregates CARC groups + the front-end gate; reuses deriveMemberLiability', async () => {
    const run = await runAnalysis(denialRecord(), 'payer', 'denial-rca', ctx());
    expect(run.outcome).toBe('ok');
    expect(run.finding?.recordRef).toBe(MASKED_RECORD_REF);
    const data = run.finding?.data as Record<string, unknown>;
    expect(data.byGroup).toEqual({ CO: 30, PR: 20 });
    // A PR group present → member-responsibility (from deriveMemberLiability, not re-derived).
    expect(data.memberLiability).toBe('member-responsibility');
    expect((data.frontEndGate as { outcome: string }).outcome).toBe('pa-required-criteria-review');
    // No anomaly → no ticket for a plain RCA.
    expect(run.ticket).toBeUndefined();
  });

  it('is PHI-safe — no memberId or clinical free-text anywhere in the run', async () => {
    const run = await runAnalysis(denialRecord(), 'provider', 'denial-rca', ctx());
    const blob = JSON.stringify(run);
    expect(blob).not.toContain(MEMBER);
    expect(blob).not.toContain('CLINICAL NOTE');
  });

  it('EXECUTES real aggregates over the actual remittance/determination data (Wave-9)', async () => {
    // Not a fixed literal: the aggregates are a genuine reduction over the adjustment
    // lines (CO 30 + PR 20 = 50 total; CO is the appealable contractual write-off) and the
    // deficiency-kind count off the front-end determination.
    const run = await runAnalysis(denialRecord(), 'payer', 'denial-rca', ctx());
    const data = run.finding?.data as Record<string, unknown>;
    expect(data.totalAdjusted).toBe(50);
    expect(data.contractualAdjusted).toBe(30);
    expect(data.patientResponsibility).toBe(20);
    expect(data.topAdjustmentGroup).toBe('CO'); // 30 > 20 (computed, not hardcoded)
    expect(data.carcCount).toBe(1);
    expect(data.deficiencyCount).toBe(1);
    // A3: CO is a NON-appealable contractual write-off — there is NO `appealableAmount`
    // field and the summary reports the contractual (not "appealable") split.
    expect(data.appealableAmount).toBeUndefined();
    expect(run.finding?.summary).toContain('contractual=30/50');
    expect(run.finding?.summary).not.toContain('appealable');
  });
});

describe('runAnalysis — PLAN-VALIDATE gate (rejection path #1)', () => {
  it('rejects an out-of-scope request (payer-only analysis asked by provider) + opens a ticket', async () => {
    const run = await runAnalysis(
      reconciledRecord('matched', 0),
      'provider',
      'recovery-verification',
      ctx()
    );
    expect(run.outcome).toBe('plan-rejected');
    expect(run.finding).toBeUndefined();
    expect(run.ticket?.kind).toBe('plan-rejected');
    expect(run.ticket?.reason).toContain('out of scope');
  });

  it('rejects a PHI-unsafe request (declares a non-projected/PHI read) + opens a ticket', async () => {
    const run = await runAnalysis(denialRecord(), 'payer', 'member-cohort-drilldown', ctx());
    expect(run.outcome).toBe('plan-rejected');
    expect(run.ticket?.reason).toContain('memberId');
  });

  it('rejects an unknown analysis id', async () => {
    const run = await runAnalysis(denialRecord(), 'payer', 'no-such-analysis', ctx());
    expect(run.outcome).toBe('plan-rejected');
    expect(run.ticket?.reason).toContain('unknown analysis');
  });

  it('A-negPHI: a plan-rejected / eval-rejected ticket reason carries NO member id or free-text', async () => {
    // The reason concatenates the analysis id + the DECLARED field NAMES (schema tokens like
    // "memberId") — never an actual member id VALUE or a clinical free-text `detail`. Assert
    // the reason is ids-only across both gate-failure paths.
    const planRej = await runAnalysis(denialRecord(), 'payer', 'member-cohort-drilldown', ctx());
    expect(planRej.outcome).toBe('plan-rejected');
    expect(planRej.ticket?.reason).toContain('memberId'); // the field NAME is named (safe)
    expect(planRej.ticket?.reason).not.toContain(MEMBER); // but NOT the member id VALUE
    expect(planRej.ticket?.reason).not.toContain('CLINICAL NOTE'); // nor any free-text detail

    const evalRej = await runAnalysis(denialRecord(), 'payer', 'nonce-probe-demo', ctx());
    expect(evalRej.outcome).toBe('eval-rejected');
    expect(evalRej.ticket?.reason).not.toContain(MEMBER);
    expect(evalRej.ticket?.reason).not.toContain('CLINICAL NOTE');
  });
});

describe('runAnalysis — RESULT-EVALUATE gate (rejection path #2)', () => {
  it('rejects a non-reproducible result (differs under a perturbed clock) + opens a ticket', async () => {
    const run = await runAnalysis(denialRecord(), 'payer', 'denial-forecast', ctx());
    expect(run.outcome).toBe('eval-rejected');
    expect(run.finding).toBeUndefined();
    expect(run.ticket?.kind).toBe('eval-rejected');
    expect(run.ticket?.reason).toContain('not reproducible');
  });

  it('the reproducibility gate is real — the forecast body genuinely varies with the clock', () => {
    const t = ANALYSES.find((a) => a.id === 'denial-forecast')!;
    const a = computeAnalysis(t, denialRecord(), ctx(), NOW);
    const b = computeAnalysis(t, denialRecord(), ctx(), PROBE_NOW);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    // …while a curated deterministic body does NOT vary with the clock.
    const rca = ANALYSES.find((a2) => a2.id === 'denial-rca')!;
    expect(JSON.stringify(computeAnalysis(rca, denialRecord(), ctx(), NOW))).toBe(
      JSON.stringify(computeAnalysis(rca, denialRecord(), ctx(), PROBE_NOW))
    );
  });
});

describe('runAnalysis — recovery-verification (reuses reconcile)', () => {
  it('AGREEMENT → ok, no anomaly, no ticket, confirm action', async () => {
    // contractedAllowed 100, paid 50, no PR → reconcile computes underpaid delta 50.
    const run = await runAnalysis(
      reconciledRecord('underpaid', 50),
      'payer',
      'recovery-verification',
      ctx()
    );
    expect(run.outcome).toBe('ok');
    expect(run.finding?.anomaly).toBe(false);
    expect(run.action?.actionType).toBe('confirm-reconciliation');
    expect(run.ticket).toBeUndefined();
  });

  it('DISAGREEMENT → anomaly finding + a routed ticket (with a queue item)', async () => {
    // Recorded 'matched'/0 but reconcile recomputes 'underpaid'/50 → disagreement.
    const run = await runAnalysis(
      reconciledRecord('matched', 0),
      'payer',
      'recovery-verification',
      ctx()
    );
    expect(run.outcome).toBe('ok');
    expect(run.finding?.anomaly).toBe(true);
    expect(run.action?.actionType).toBe('escalate-reconciliation-review');
    expect(run.ticket?.kind).toBe('anomaly');
    // Routed via Wave-7 — the recovery draft yields a masked, PHI-safe queue item.
    expect(run.ticket?.routed.queueItem?.recordRef).toBe(MASKED_RECORD_REF);
  });

  it('A4: an ABSENT pas-decision → present-but-not-verifiable (never a default-approved verdict)', async () => {
    // The recorded verdict is only derivable under an approving PA disposition. With NO
    // pas-decision on the record the analysis must NOT assume 'approved' (fail-open) — it
    // reports not-verifiable, exactly like a missing remittance/reconciliation.
    const run = await runAnalysis(
      reconciledRecord('underpaid', 50, { omitPasDecision: true }),
      'payer',
      'recovery-verification',
      ctx()
    );
    expect(run.outcome).toBe('ok');
    expect(run.finding?.anomaly).toBe(false);
    expect((run.finding?.data as { verifiable: boolean }).verifiable).toBe(false);
    // Never manufactures a recoverable/underpaid verdict from the missing input.
    expect(run.finding?.summary).not.toContain('underpaid');
    expect(run.action?.actionType).toBe('monitor');
  });
});

describe('runAnalysis — RESULT-EVALUATE strengthened to a SECOND (nonce) axis (A2)', () => {
  it('rejects a body that is nonce-dependent (reproducible on the clock, NOT on the nonce)', async () => {
    // `nonce-probe-demo` reads only the injected nonce (never the clock) — clock-only probing
    // would MISS it, but the strengthened gate perturbs the nonce axis and rejects it.
    const run = await runAnalysis(denialRecord(), 'payer', 'nonce-probe-demo', ctx());
    expect(run.outcome).toBe('eval-rejected');
    expect(run.finding).toBeUndefined();
    expect(run.ticket?.kind).toBe('eval-rejected');
  });

  it('the nonce probe is real — the demo body genuinely varies with the injected nonce', () => {
    const t = ANALYSES.find((a) => a.id === 'nonce-probe-demo')!;
    // Same clock, DIFFERENT nonce → different output (proves the nonce axis is perturbed).
    const a = computeAnalysis(t, denialRecord(), ctx(), NOW, PRIMARY_NONCE);
    const b = computeAnalysis(t, denialRecord(), ctx(), NOW, PROBE_NONCE);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    // …while a curated deterministic body ignores BOTH axes.
    const rca = ANALYSES.find((a2) => a2.id === 'denial-rca')!;
    expect(JSON.stringify(computeAnalysis(rca, denialRecord(), ctx(), NOW, PRIMARY_NONCE))).toBe(
      JSON.stringify(computeAnalysis(rca, denialRecord(), ctx(), PROBE_NOW, PROBE_NONCE))
    );
  });
});

describe('runAnalysis — integrity-check (reuses verifyLedgerIntegrity)', () => {
  it('unsealed record → no attestation, no anomaly', async () => {
    const run = await runAnalysis(denialRecord(), 'payer', 'integrity-check', ctx());
    expect(run.outcome).toBe('ok');
    expect(run.finding?.anomaly).toBe(false);
    expect((run.finding?.data as { sealed: boolean }).sealed).toBe(false);
  });

  it('TAMPERED sealed record → tamper finding + a critical routed ticket to both parties', async () => {
    const clean = denialRecord();
    const sealed: EvidenceRecord = { ...clean, seal: sealRecord(clean, KEY, NOW) };
    // Tamper: append an entry AFTER sealing → chain head + count no longer match the seal.
    const tampered = recordReconciliation(sealed, {
      id: `${REC_ID}-recon`,
      ts: NOW,
      verdict: 'matched',
      contractedAllowed: 100,
      paidAmount: 100,
      delta: 0,
      toleranceApplied: 5,
    });
    const run = await runAnalysis(
      tampered,
      'payer',
      'integrity-check',
      ctx({
        verifier: KEY,
        integrity: { intact: false, signed: false, reasons: ['chainHead mismatch'] },
      })
    );
    expect(run.finding?.anomaly).toBe(true);
    expect(run.ticket?.kind).toBe('tamper');
    // The Wave-6 signal derivation emits the critical integrity-failed notification to both.
    expect(run.ticket?.routed.notifications.payer.some((s) => s.kind === 'integrity-failed')).toBe(
      true
    );
    expect(
      run.ticket?.routed.notifications.provider.some((s) => s.kind === 'integrity-failed')
    ).toBe(true);
  });
});

describe('runAnalysis — action rung comes from the interlock (never hardcoded)', () => {
  function draftAt(tier: EvidenceTier): EvidenceRecord {
    let r = denialRecord();
    r = recordRecovery(r, {
      id: `${REC_ID}-recovery`,
      ts: NOW,
      action: 'draft-appeal',
      rung: 'A1',
      remittanceId: 'rem-1',
      taskEvidenceTier: tier,
    });
    return r;
  }

  it('a weak-evidence (D0) record caps the rung below the HOTL grant', async () => {
    const run = await runAnalysis(
      draftAt('D0'),
      'payer',
      'denial-rca',
      ctx({ manifestTier: 'HOTL' })
    );
    // HOTL grants A2, but D0 evidence caps at A0 — the weakest link (interlock-derived).
    expect(run.action?.rung).toBe('A0');
  });

  it('settlement-grade (D3) evidence lets the HOTL grant stand at A2', async () => {
    const run = await runAnalysis(
      draftAt('D3'),
      'payer',
      'denial-rca',
      ctx({ manifestTier: 'HOTL' })
    );
    expect(run.action?.rung).toBe('A2');
  });
});

describe('runAnalysis — determinism', () => {
  it('two runs with identical inputs are deep-equal (now + inbox injected)', async () => {
    const rec = reconciledRecord('matched', 0);
    const a = await runAnalysis(rec, 'payer', 'recovery-verification', ctx());
    const b = await runAnalysis(rec, 'payer', 'recovery-verification', ctx());
    expect(a).toEqual(b);
  });
});
