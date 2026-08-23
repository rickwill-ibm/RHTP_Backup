/**
 * Data-lifecycle — shared types (Wave C, ADR-005 retention posture).
 *
 * This module owns the data-lifecycle contract across the platform's stores:
 *   1. RETENTION / PURGE over the MUTABLE stores (select-by-policy: age,
 *      category, consent-withdrawal), and
 *   2. RIGHT-TO-DELETE over the APPEND-ONLY evidence ledger done correctly —
 *      never a silent row delete, but a governed, audited tombstone that
 *      preserves ledger immutability and auditability, and
 *   3. LEGAL-HOLD, which blocks both a purge and a right-to-delete.
 *
 * Every value here is PHI-safe by construction: ids, references, category
 * codes, policy ids, and actors only — never a name, DOB, SSN, or raw payload.
 * Selection is pure and deterministic (the caller supplies `nowMs`), so a
 * purge plan is reproducible and testable.
 */

/**
 * A normalized, PHI-safe view of one record living in a MUTABLE store, framed
 * so the policy engine can select it without knowing the store's shape. Store
 * adapters project their native records to this.
 */
export interface PurgeableItem {
  /** Store-local id (the handle the adapter's `remove` accepts). */
  id: string;
  /** Which mutable store this came from, e.g. 'fhir' | 'care-plan' | 'dead-letter'. */
  store: string;
  /** Member / patient id used for legal-hold and consent-withdrawal matching. */
  subjectRef: string;
  /** PHI-safe category / resource-type code the policy can select on. */
  category?: string;
  /** ISO-8601 creation timestamp; the age criterion is measured from this. */
  createdAt: string;
  /** True when the subject has withdrawn consent for this data. */
  consentWithdrawn?: boolean;
}

/**
 * A retention policy: a named set of selection criteria. Every criterion that
 * is present must match (logical AND). A policy with NO criteria selects
 * nothing — validated by `validateRetentionPolicy` — so a mis-authored policy
 * can never sweep the whole store.
 */
export interface RetentionPolicy {
  id: string;
  description: string;
  /** Restrict the policy to one store; omit to consider items from any store. */
  target?: string;
  /** Age criterion: select items whose age (now - createdAt) is >= this. */
  maxAgeMs?: number;
  /** Category criterion: select items whose `category` is in this set. */
  categories?: string[];
  /** Consent criterion: when true, select only items with consentWithdrawn === true. */
  consentWithdrawn?: boolean;
  /** Legal / regulatory basis recorded on the audit event (e.g. 'ADR-005 7yr'). */
  legalBasis?: string;
}

/** One selected item paired with the policy that selected it. */
export interface PurgeSelection {
  item: PurgeableItem;
  policyId: string;
}

/**
 * The outcome of planning a purge: what would be removed, and what was selected
 * but held back by a legal hold. `heldBack` is the E9 safety evidence — those
 * items are NEVER passed to a store's `remove`.
 */
export interface PurgePlan {
  purge: PurgeSelection[];
  heldBack: PurgeSelection[];
}

/** A store that can enumerate PHI-safe purge candidates and remove one by id. */
export interface PurgeSource {
  /** Store label; must equal the `store` field on the items it scans. */
  readonly store: string;
  /** Enumerate current purge candidates as normalized items. */
  scan(): Promise<PurgeableItem[]> | PurgeableItem[];
  /** Hard-remove one record by its store-local id. */
  remove(id: string): Promise<void> | void;
}

/** The result of executing a purge plan against its sources. */
export interface PurgeResult {
  purged: PurgeSelection[];
  heldBack: PurgeSelection[];
  audit: LifecycleAuditEvent[];
}

/** A legal hold placed on a subject; blocks purge and right-to-delete. */
export interface LegalHold {
  id: string;
  /** Member / patient / record id the hold protects. */
  subjectRef: string;
  reason: string;
  placedBy: string;
  placedAt: string;
  releasedAt: string | null;
  releasedBy: string | null;
}

/** A right-to-delete (erasure) request against the append-only evidence ledger. */
export interface RightToDeleteRequest {
  /** Evidence record id to erase. */
  recordId: string;
  policyId: string;
  /** Legal basis, e.g. 'GDPR Art.17' | 'state privacy request'. */
  legalBasis: string;
  actor: string;
}

export type RightToDeleteStatus =
  | 'tombstoned'
  | 'blocked-legal-hold'
  | 'not-found'
  | 'already-tombstoned';

/**
 * The result of a right-to-delete. On success the ledger has a NEW appended
 * tombstone version; prior versions remain readable (immutability preserved).
 */
export interface RightToDeleteResult {
  recordId: string;
  status: RightToDeleteStatus;
  /** Versions that existed before the tombstone was appended. */
  priorVersionCount?: number;
  audit: LifecycleAuditEvent;
}

/** PHI-safe audit event emitted by every lifecycle action. */
export interface LifecycleAuditEvent {
  ts: string;
  actor: string;
  action:
    | 'lifecycle.purge'
    | 'lifecycle.purge.held-back'
    | 'lifecycle.right-to-delete'
    | 'lifecycle.right-to-delete.blocked'
    | 'lifecycle.right-to-delete.noop'
    | 'lifecycle.legal-hold.place'
    | 'lifecycle.legal-hold.release';
  /** Subject the action concerned (member / patient / record id). */
  subjectRef: string;
  /** PHI-safe reference to the affected resource, e.g. 'fhir/Observation/x'. */
  resourceRef: string;
  policyId?: string;
  outcome: 'success' | 'blocked' | 'noop';
  detail?: string;
}
