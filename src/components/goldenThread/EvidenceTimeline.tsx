/**
 * Evidence Record timeline (reviewer UI). Presentational + accessible: renders
 * the append-only entries of a Coverage Determination Record as an ordered list.
 *
 * Wave-2 (W2-5) extends this ADDITIVELY for the golden-thread financial stages
 * (claim · remittance · reconciliation · recovery): new STAGE_LABEL entries, new
 * PHI-safe `summarizeEntry` cases, an optional per-entry evidence-tier chip, and a
 * record-level tamper-evidence indicator. Existing entries render byte-identically
 * (their summary text is unchanged); the chips are additive visual metadata.
 *
 * SERVER COMPONENT (no 'use client'): this is purely presentational (no hooks/handlers).
 * It is deliberately NOT a client component — a client boundary would SERIALIZE the whole
 * `record` prop (memberId + every member-embedding entry id + the seal) into the HTML for
 * hydration, leaking PHI into the page source even when nothing member-identifying is
 * rendered. As a server component the record stays server-side and only the PHI-safe
 * output (summaries = refs/codes/amounts; a masked record id in the aria-label) reaches
 * the browser. (A client parent may still compile it into a client bundle — see the
 * evidence/[id] page — which is why the imports below stay deep, per the next comment.)
 *
 * PHI DISCIPLINE: summaries carry references, codes, and amounts ONLY — never a
 * memberId, patient name, or free-text clinical narrative.
 */
// Deep imports (NOT the '@/lib/evidence' barrel): the barrel re-exports ledgerIntegrity,
// which imports `node:crypto`; if a CLIENT parent pulls this component into its bundle,
// the barrel would fail the client build. These deep paths carry only pure/type modules.
import type { EvidenceRecord, EvidenceEntry } from '@/lib/evidence/evidenceRecord';
import { tierOfEntry } from '@/lib/evidence/tier';
import type { EvidenceTier } from '@/lib/evidence/tierConfig';
import StatusBadge from '@/components/ui/StatusBadge';

export const STAGE_LABEL: Record<string, string> = {
  eligibility: 'Eligibility',
  'medical-necessity': 'Medical Necessity',
  'prior-auth': 'Prior Authorization',
  'patient-estimation': 'Patient Estimation',
  claim: 'Claim',
  remittance: 'Remittance',
  reconciliation: 'Reconciliation',
  recovery: 'Recovery',
};

/** Sum an 835's adjustment lines per CARC group (CO/PR/OA/PI) — PHI-safe totals. */
function adjustmentTotalsByGroup(
  adjustments: ReadonlyArray<{ group: string; amount: number }>
): string {
  const totals = new Map<string, number>();
  for (const a of adjustments) {
    totals.set(a.group, (totals.get(a.group) ?? 0) + a.amount);
  }
  return [...totals.entries()].map(([g, amt]) => `${g}:${amt}`).join(', ');
}

/**
 * PHI-safe one-line summary of an entry. Every case emits references / codes /
 * amounts only — NEVER a memberId, name, or free-text narrative. Unmapped types
 * fall through to `''` (unchanged from Wave-1).
 */
export function summarizeEntry(e: EvidenceEntry): string {
  switch (e.type) {
    case 'eligibility':
      return `Coverage ${e.requiresPA ? 'requires PA' : 'no PA required'}${e.note ? ` — ${e.note}` : ''}`;
    case 'coverage-determination':
      return `Determination: ${e.determination.outcome} (requiresPA=${e.determination.requiresPA}, submission-readiness score ${e.determination.propensityToDeny})`;
    case 'gold-card':
      return `Gold card ${e.exemption.applied ? 'APPLIED — PA waived' : 'not applied'} — ${e.exemption.reason}`;
    case 'propensity':
      return `Submission-readiness (completeness) score ${e.score}/100 (${e.band})`;
    case 'dtr-response':
      return `DTR response (${e.itemCount} items)`;
    case 'pas-submission':
      return `PAS submitted by ${e.approver.display} (${e.approver.reference})`;
    case 'pas-decision':
      return `Payer decision: ${e.decision}${e.reasons?.length ? ` — ${e.reasons.join('; ')}` : ''}`;
    case 'note':
      return e.text;
    case 'claim-submission':
      return `Claim ${e.claimRef} · total ${e.total}`;
    case 'remittance': {
      const adj = adjustmentTotalsByGroup(e.adjustments);
      return (
        `Remittance ${e.remittanceId} · paid ${e.paidAmount}` +
        (adj ? ` · adj [${adj}]` : '') +
        (e.carcCodes.length ? ` · CARC [${e.carcCodes.join(', ')}]` : '') +
        (e.rarcCodes.length ? ` · RARC [${e.rarcCodes.join(', ')}]` : '')
      );
    }
    case 'reconciliation':
      return `Reconciliation ${e.verdict} · delta ${e.delta} · tolerance ${e.toleranceApplied}`;
    case 'underpayment':
      return `Underpayment delta ${e.delta} · basis ${e.basis}`;
    case 'recovery':
      return `Recovery ${e.action} · ${e.status} · rung ${e.rung}`;
    default:
      return '';
  }
}

type StatusVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'purple';

/** Tier → chip variant (weakest D0 → strongest D3). Presentation only. */
const TIER_VARIANT: Record<EvidenceTier, StatusVariant> = {
  D0: 'neutral',
  D1: 'info',
  D2: 'purple',
  D3: 'success',
};

/**
 * Optional record-level integrity state, supplied by the caller from a
 * SERVER-SIDE `verifyLedgerIntegrity` result. The client NEVER verifies a seal
 * itself; this component only surfaces what it is handed. Absent → the component
 * shows a presence-only "Sealed" chip when `record.seal` exists.
 */
export interface EvidenceIntegrity {
  intact: boolean;
  signed: boolean;
}

/**
 * Record-level tamper-evidence indicator. Rendered only when the record carries a
 * seal. HONEST about three distinct states so a bare "Sealed" chip is never read
 * as a positive verdict:
 *
 *   1. integrity UNDEFINED (server did not / could not verify on read) → a NEUTRAL
 *      "Sealed (not verified)" chip. Seal PRESENCE is not a claim of validity, so
 *      this must NOT use a success/green variant.
 *   2. integrity.intact === true  → "Integrity intact" (success) + the symmetric
 *      seal-signature wording. A genuine positive verdict.
 *   3. integrity.intact === false → "Integrity broken" (danger) — an unmistakable
 *      TAMPER warning for a record whose recomputed chain no longer matches its seal.
 *
 * Verification is always server-side; this component only surfaces what it is handed.
 */
function SealIndicator({
  seal,
  integrity,
}: {
  seal: NonNullable<EvidenceRecord['seal']>;
  integrity?: EvidenceIntegrity;
}): React.ReactElement {
  return (
    <div
      className="mb-3 flex flex-wrap items-center gap-2 text-xs"
      aria-label="Ledger integrity"
      data-testid="seal-indicator"
    >
      {integrity ? (
        <>
          <StatusBadge label="Sealed" variant="info" size="sm" />
          <StatusBadge
            label={integrity.intact ? 'Integrity intact' : 'Integrity broken'}
            variant={integrity.intact ? 'success' : 'danger'}
            size="sm"
          />
          <StatusBadge
            // Honest wording: an HMAC seal is a SYMMETRIC tamper-evidence check,
            // NOT a non-repudiation signature. "Seal signature matches" avoids the
            // "verified" reading that implies asymmetric non-repudiation.
            label={
              integrity.signed ? 'Seal signature matches (symmetric)' : 'Seal signature mismatch'
            }
            variant={integrity.signed ? 'success' : 'warning'}
            size="sm"
          />
        </>
      ) : (
        // Seal present but no server verdict: NEUTRAL, never green. Presence alone
        // is not validity — saying only "Sealed" here would read as a pass.
        <StatusBadge label="Sealed (not verified)" variant="neutral" size="sm" />
      )}
      <span className="text-carbon-gray-50">
        {seal.alg} · {seal.keyId}
      </span>
    </div>
  );
}

export function EvidenceTimeline({
  record,
  integrity,
}: {
  record: EvidenceRecord;
  /**
   * OPTIONAL server-verified integrity state. Default undefined → current
   * behavior (presence-only "Sealed" chip when a seal exists; nothing when it
   * does not). This component NEVER verifies the seal client-side.
   */
  integrity?: EvidenceIntegrity;
}): React.ReactElement {
  return (
    <div>
      {record.seal ? <SealIndicator seal={record.seal} integrity={integrity} /> : null}
      <ol className="space-y-3" aria-label={`Evidence record ${record.id} timeline`}>
        {record.entries.map((e) => {
          const tier = tierOfEntry(e);
          return (
            <li key={e.id} className="flex gap-3 text-sm">
              <span
                className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-carbon-blue"
                aria-hidden
              />
              <div>
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  <span>{STAGE_LABEL[e.stage] ?? e.stage}</span>
                  <span className="rounded bg-carbon-gray-10 px-1.5 py-0.5 text-xs font-normal text-carbon-gray-70">
                    {e.type}
                  </span>
                  <span title={`Evidence tier ${tier}`}>
                    <StatusBadge label={tier} variant={TIER_VARIANT[tier]} size="sm" />
                  </span>
                </p>
                <p className="text-carbon-gray-70">{summarizeEntry(e)}</p>
                <p className="text-xs text-carbon-gray-50">
                  <time dateTime={e.ts}>{e.ts.replace('T', ' ').slice(0, 19)}</time> ·{' '}
                  {e.actor ?? 'system'}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
