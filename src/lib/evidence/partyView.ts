/**
 * partyView.ts — party-scoped, PHI-safe projection of the SHARED Evidence Record
 * (Wave-6, dual-party evidence visibility).
 *
 * The Evidence Record is a SINGLE, append-only ledger co-audited by BOTH the payer and
 * the provider — that shared, tamper-evident trail is the whole point of the dual-party
 * design: each party independently verifies the SAME sequence of events. So
 * `projectForParty` gives both parties the SAME PHI-safe audit trail (via the existing
 * `toAuditEvents` projection); it does NOT fork or hide entries by party.
 *
 * MINIMUM NECESSARY (HIPAA §164.502(b)): the projection carries references, codes and
 * amounts ONLY. It NEVER exposes a memberId, a patient name, clinical free-text, or the
 * member-embedding record/entry ids — those are masked to opaque, positional handles
 * BEFORE projection (mirroring how the golden-thread UI masks the record id). The seal is
 * reduced to its algorithm + key id (its `recordId`/`memberId` identity fields are
 * member-embedding and are dropped); an integrity attestation, when supplied, is already
 * PHI-free (its reasons are structural).
 *
 * Anything that legitimately differs by viewer would be modeled as an explicit
 * party-scoped field; today nothing in the ledger itself does (both parties audit the
 * same trail), so the only party-dependent output is the `viewer` tag. Party-specific
 * NOTIFICATIONS (what each side should act on) are a separate derivation
 * (`deriveEscalationSignals`), not a difference in the ledger projection.
 *
 * Pure + deterministic; no wall-clock, no PHI.
 */
import type { AuditEvent } from '@/lib/server/audit';
import { toAuditEvents } from './auditProjection';
import { computeProcessTier } from './tier';
import type { EvidenceEntry, EvidenceRecord, EvidenceStatus } from './evidenceRecord';
import type { EvidenceTier } from './tierConfig';
import type { LedgerSeal } from './ledgerIntegrity';
import type { StoredIntegrity } from './verifyStored';

export type LedgerParty = 'payer' | 'provider';

/** The masked, member-free record id every projection reports (never the real id). */
export const MASKED_RECORD_REF = 'evidence-record';
const MASKED_MEMBER = 'member';

/** PHI-safe header for the shared ledger (references + integrity metadata only). */
export interface PartyLedgerHeader {
  /** Masked, member-free record reference (never the real member-embedding id). */
  recordRef: string;
  status: EvidenceStatus;
  /** Recomputed weakest-link process tier (never a stored/cached flag). */
  tier: EvidenceTier;
  /** Seal ALGORITHM + KEY ID only — the seal's recordId/memberId identity is dropped. */
  seal?: { alg: LedgerSeal['alg']; keyId: string };
  /** Present only when the caller verified the seal on read. PHI-free reasons. */
  integrity?: StoredIntegrity;
}

export interface PartyEvidenceView {
  viewer: LedgerParty;
  header: PartyLedgerHeader;
  /** The SHARED append-only audit trail — identical for both parties. */
  events: AuditEvent[];
}

export interface ProjectForPartyOpts {
  /** The read-path integrity attestation, if the caller verified the seal. */
  integrity?: StoredIntegrity | null;
  /** A PHI-safe correlation id to stamp on projected events (never member-embedding). */
  correlationId?: string;
}

/**
 * Mask the member-embedding identifiers BEFORE projection: the record id, the memberId,
 * and each entry id (entry ids are derived from the record id, `ev-<memberId>-…`). Entries
 * are re-keyed to opaque positional handles (`entry-<n>`) so `toAuditEvents` cannot emit a
 * member reference in any `resourceRef`. Order is preserved (append-only), so each handle
 * is a stable index into the shared trail.
 */
function maskRecord(record: EvidenceRecord): EvidenceRecord {
  return {
    ...record,
    id: MASKED_RECORD_REF,
    memberId: MASKED_MEMBER,
    entries: record.entries.map((e, i): EvidenceEntry => ({ ...e, id: `entry-${i + 1}` })),
  };
}

/**
 * Project the shared Evidence Record to a PHI-safe view for one party. Both parties get
 * the SAME `events` (the shared append-only trail); the `viewer` tag is the only
 * party-dependent field. Reuses `toAuditEvents` (the existing PHI-safe projection) over a
 * masked record and `computeProcessTier` for the header tier.
 */
export function projectForParty(
  record: EvidenceRecord,
  party: LedgerParty,
  opts: ProjectForPartyOpts = {}
): PartyEvidenceView {
  const masked = maskRecord(record);
  const events = toAuditEvents(masked, opts.correlationId ?? 'party-view');
  const header: PartyLedgerHeader = {
    recordRef: MASKED_RECORD_REF,
    status: record.status,
    tier: computeProcessTier(record),
    ...(record.seal ? { seal: { alg: record.seal.alg, keyId: record.seal.keyId } } : {}),
    ...(opts.integrity ? { integrity: opts.integrity } : {}),
  };
  return { viewer: party, header, events };
}
