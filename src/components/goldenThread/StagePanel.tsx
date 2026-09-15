/**
 * StagePanel (Phase A — Golden Thread guided surface). One Carbon card per order→cash
 * stage. It renders the stage's REAL evidence rows (read from the record entries the
 * stage model carries), embeds the specialized stage components where the plan calls
 * for them (Medical Necessity, the reconciliation money-shot, the recovery interlock +
 * countdown + HITL decision), and footers every card with the Twin-Ladder badge
 * (evidence tier · agent · authority-rung ceiling).
 *
 * SERVER COMPONENT: purely presentational over server-resident data. It composes the
 * client controls (RecoveryDecisionPanel, RecoveryCountdown) as children — a server
 * parent rendering client leaves, so no member-embedding record is serialized.
 *
 * PHI DISCIPLINE: codes / amounts / refs / verdicts only. The recovery work-item id is
 * forwarded to the decision panel to address the endpoint and is NEVER rendered.
 */
import type { EvidenceEntry, EvidenceEntryType, OrderRef } from '@/lib/evidence/evidenceRecord';
import type { EvidenceTier } from '@/lib/evidence/tierConfig';
import type { AutonomyTier } from '@/lib/agents/manifest/types';
import type { StageModel } from '@/lib/goldenThread/threadStageView';
import type { MedicalNecessityVM } from '@/lib/goldenThread';
import type { EligibilityVM } from '@/lib/goldenThread/eligibility';
import type { PatientEstimateVM } from '@/lib/goldenThread/patientEstimation';
import type { ReconcileResult } from '@/lib/goldenThread/reconciliation';
import type { RecoveryOutcome } from '@/lib/goldenThread/recoveryDispatch';
import { TwinLadderBadge } from './TwinLadderBadge';
import { MedicalNecessityPanel } from './MedicalNecessityPanel';
import { ReconciliationMoneyShot } from './ReconciliationMoneyShot';
import { TwinLadderInterlock } from './TwinLadderInterlock';
import { RecoveryCountdown } from './RecoveryCountdown';
import { RecoveryDecisionPanel } from './RecoveryDecisionPanel';

function entryOf<T extends EvidenceEntryType>(
  entries: EvidenceEntry[],
  type: T
): Extract<EvidenceEntry, { type: T }> | undefined {
  return entries.find((e) => e.type === type) as Extract<EvidenceEntry, { type: T }> | undefined;
}

function Row({ label, value }: { label: string; value: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-carbon-gray-20 py-1 last:border-0">
      <span className="text-xs text-carbon-gray-50">{label}</span>
      <span className="text-sm font-medium text-carbon-gray-100">{value}</span>
    </div>
  );
}

function adjustmentsByGroup(adjustments: ReadonlyArray<{ group: string; amount: number }>): string {
  const totals = new Map<string, number>();
  for (const a of adjustments) totals.set(a.group, (totals.get(a.group) ?? 0) + a.amount);
  return [...totals.entries()].map(([g, amt]) => `${g}:${amt}`).join(', ') || '—';
}

export interface StagePanelProps {
  model: StageModel;
  index: number;
  active: boolean;
  // Typed per-stage extras (optional — each stage reads only the ones it needs).
  order?: OrderRef;
  memberLabel?: string;
  necessityVm?: MedicalNecessityVM;
  eligibility?: EligibilityVM;
  estimate?: PatientEstimateVM;
  reconciliation?: ReconcileResult;
  recovery?: RecoveryOutcome;
  currentTier?: EvidenceTier;
  manifestTier?: AutonomyTier;
  recoveryWorkItemId?: string;
  goldCardApplied?: boolean;
}

function StageBody(props: StagePanelProps): React.ReactElement {
  const { model } = props;
  switch (model.key) {
    case 'order': {
      const o = props.order;
      return (
        <div>
          <Row label="Service" value={o?.display ?? o?.code ?? '—'} />
          <Row label="Code" value={o?.code ?? '—'} />
          {o?.providerNpi ? <Row label="Provider NPI" value={o.providerNpi} /> : null}
          {props.memberLabel ? <Row label="Member" value={props.memberLabel} /> : null}
        </div>
      );
    }
    case 'coverage': {
      const det = entryOf(model.entries, 'coverage-determination')?.determination;
      if (!det)
        return <p className="text-xs text-carbon-gray-50">No determination on the record.</p>;
      return (
        <div>
          <Row label="Outcome" value={det.outcome} />
          <Row label="Requires PA" value={det.requiresPA ? 'yes' : 'no'} />
          <Row
            label="Submission-readiness (propensity-to-deny)"
            value={`${det.propensityToDeny}`}
          />
        </div>
      );
    }
    case 'eligibility': {
      const el = props.eligibility;
      if (!el) return <p className="text-xs text-carbon-gray-50">No eligibility view model.</p>;
      return (
        <div>
          <Row label="Active" value={el.active ? 'yes' : 'no'} />
          <Row label="Payer" value={el.payer} />
          {el.plan ? <Row label="Plan" value={el.plan} /> : null}
          {el.type ? <Row label="Type" value={el.type} /> : null}
          <Row label="Requires PA" value={el.requiresPA ? 'yes' : 'no'} />
          <p className="mt-1 text-xs text-carbon-gray-70">{el.note}</p>
        </div>
      );
    }
    case 'necessity':
      return props.necessityVm ? (
        <MedicalNecessityPanel vm={props.necessityVm} />
      ) : (
        <p className="text-xs text-carbon-gray-50">No medical-necessity view model.</p>
      );
    case 'prior-auth': {
      const sub = entryOf(model.entries, 'pas-submission');
      const dec = entryOf(model.entries, 'pas-decision');
      return (
        <div>
          {sub ? (
            <Row
              label="Submitted by"
              value={`${sub.approver.display} (${sub.approver.reference})`}
            />
          ) : null}
          {dec ? <Row label="Payer decision" value={dec.decision} /> : null}
          {dec?.reasons?.length ? <Row label="Reasons" value={dec.reasons.join('; ')} /> : null}
          {!sub && !dec ? (
            <p className="text-xs text-carbon-gray-50">No PA record on this thread.</p>
          ) : null}
        </div>
      );
    }
    case 'patient-cost': {
      const est = props.estimate;
      if (!est) return <p className="text-xs text-carbon-gray-50">No estimate view model.</p>;
      return (
        <div>
          <Row label="Member responsibility" value={`$${est.memberResponsibility}`} />
          <Row label="Plan pays" value={`$${est.planPays}`} />
          <Row label="Allowed amount" value={`$${est.allowedAmount}`} />
          <Row label="Applied to deductible" value={`$${est.appliedToDeductible}`} />
          <Row label="Coinsurance" value={`$${est.coinsurance}`} />
          <Row label="Propensity to pay" value={est.propensityToPay.band} />
        </div>
      );
    }
    case 'claim': {
      const claim = entryOf(model.entries, 'claim-submission');
      return claim ? (
        <div>
          <Row label="Claim ref" value={claim.claimRef} />
          <Row label="Total" value={`$${claim.total}`} />
        </div>
      ) : (
        <p className="text-xs text-carbon-gray-50">No claim on the record.</p>
      );
    }
    case 'remittance': {
      const rem = entryOf(model.entries, 'remittance');
      if (!rem) return <p className="text-xs text-carbon-gray-50">No remittance on the record.</p>;
      return (
        <div>
          <Row label="Remittance" value={rem.remittanceId} />
          <Row label="Paid" value={`$${rem.paidAmount}`} />
          <Row label="Adjustments by group" value={adjustmentsByGroup(rem.adjustments)} />
          <Row label="CARC" value={rem.carcCodes.length ? rem.carcCodes.join(', ') : '—'} />
          <Row label="RARC" value={rem.rarcCodes.length ? rem.rarcCodes.join(', ') : '—'} />
        </div>
      );
    }
    case 'reconciliation': {
      const recon = props.reconciliation;
      if (!recon)
        return <p className="text-xs text-carbon-gray-50">No reconciliation on the record.</p>;
      return (
        <div className="space-y-2">
          <ReconciliationMoneyShot reconciliation={recon} currentTier={props.currentTier} />
          {recon.verdict === 'not-recoverable' ? (
            <p className="rounded border border-[#ffb3b8] bg-carbon-red-light p-2 text-xs font-medium text-carbon-red">
              Recoverable? No — PA not approving. The shortfall is reconciled (D2) but a
              non-approving PA disposition yields no recoverable finding.
            </p>
          ) : null}
        </div>
      );
    }
    case 'underpayment': {
      const under = entryOf(model.entries, 'underpayment');
      return under ? (
        <div>
          <Row label="Delta" value={`$${under.delta}`} />
          <Row label="Basis" value={under.basis} />
        </div>
      ) : (
        <p className="text-xs text-carbon-gray-50">No underpayment recorded.</p>
      );
    }
    case 'recovery': {
      const rec = props.recovery;
      if (!rec) return <p className="text-xs text-carbon-gray-50">No recovery proposed.</p>;
      return (
        <div className="space-y-3">
          <div>
            <Row label="Action" value={rec.action} />
            <Row label="Status" value={rec.status ?? 'proposed'} />
            <Row label="Authority rung" value={<span className="font-mono">{rec.rung}</span>} />
          </div>
          {props.currentTier && props.manifestTier ? (
            <TwinLadderInterlock
              evidenceTier={props.currentTier}
              manifestTier={props.manifestTier}
              grantedRung={rec.rung}
              requiresHumanForSubmission={rec.requiresHumanForSubmission}
            />
          ) : null}
          {rec.filingDeadline ? <RecoveryCountdown filingDeadline={rec.filingDeadline} /> : null}
          {props.recoveryWorkItemId ? (
            <RecoveryDecisionPanel
              recoveryId={props.recoveryWorkItemId}
              {...(rec.filingDeadline ? { filingDeadline: rec.filingDeadline } : {})}
            />
          ) : null}
        </div>
      );
    }
    case 'gold-card-fold': {
      const gc = entryOf(model.entries, 'gold-card')?.exemption;
      if (!gc) return <p className="text-xs text-carbon-gray-50">No gold-card evidence.</p>;
      return (
        <div>
          <Row label="Applied" value={gc.applied ? 'yes — PA waived' : 'no'} />
          {typeof gc.approvalRate === 'number' ? (
            <Row label="Approval rate" value={`${Math.round(gc.approvalRate * 100)}%`} />
          ) : null}
          {gc.basis ? <Row label="Basis" value={gc.basis} /> : null}
          {props.goldCardApplied !== undefined ? (
            <Row label="Net gold-card applied" value={props.goldCardApplied ? 'yes' : 'no'} />
          ) : null}
        </div>
      );
    }
    default:
      return <></>;
  }
}

export function StagePanel(props: StagePanelProps): React.ReactElement {
  const { model, index, active } = props;
  return (
    <section
      className={`rounded-lg border p-4 ${
        active ? 'border-carbon-blue bg-carbon-blue-lighter' : 'border-carbon-gray-20 bg-white'
      }`}
      aria-current={active ? 'step' : undefined}
    >
      <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold">
          {index}. {model.label}
        </h3>
        <span className="text-xs text-carbon-gray-50">{model.agent}</span>
      </header>
      <div className="mb-3">
        <StageBody {...props} />
      </div>
      <footer className="border-t border-carbon-gray-20 pt-2">
        <TwinLadderBadge tier={model.tier} agent={model.agent} rung={model.ceilingRung} />
      </footer>
    </section>
  );
}
