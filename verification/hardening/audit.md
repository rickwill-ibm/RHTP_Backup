# Audit & Disclosure Hardening — Adversary Findings (R1 Domain-Fidelity)

Scope: is the audit subsystem production-grade for a US healthcare payer deployment
(RADV / OCR / 42 CFR Part 2)? Branched on four audit surfaces — ACCESS (PHI read),
MUTATION, DISCLOSURE (Part 2 / consent / break-glass), and ADMIN / GOVERNANCE — plus
the cross-cutting store guarantees (immutability, retention, exportability).

READ-ONLY review. No source modified. Findings only.

## Headline

There are TWO independent stores that are being conflated. The `evidence_ledger`
(`src/lib/evidence/store/pgEvidenceLedger.ts`) is a durable, append-only, DB-trigger-guarded
store — but it holds **EvidenceRecords only**. The actual audit spine (`audit()` in
`src/lib/server/audit.ts`, plan F-6) is a **separate best-effort JSONL flat file** that
silently degrades to `console.warn` on any write error. Every access / mutation /
disclosure / admin audit event in the app is written to the flat file, **not** to the
tamper-evident ledger. So the system that is durable does not carry the audit trail, and
the system that carries the audit trail is neither durable, tamper-evident, exportable, nor
fail-closed. Most findings below are facets of that split plus attribution ("who") gaps.

## Ranked findings

| id | surface | gap | why a deployment needs it | severity | owning iteration |
|---|---|---|---|---|---|
| AUD-01 | mutation / store | The audit-of-record spine (`audit()`) writes an unchained JSONL file (`AUDIT_LOG_DIR/audit.log.jsonl`) or falls back to `console.warn`. It is a different store from the durable `evidence_ledger`; audit events never reach the append-only, trigger-guarded ledger. No durability, no ordering guarantee, no immutability trigger, no per-row integrity. | An OCR / RADV audit demands a durable, tamper-evident record of every access and disclosure. A flat file on a pod's ephemeral disk is lost on restart and editable by anyone with node access. This is the root defect the other findings hang off. | CRITICAL | I8A / I9 (route audit → durable ledger) |
| AUD-02 | access / disclosure | Actor attribution is the hardcoded literal `'session-user'` on the SUCCESS paths of `fhir/[...path]`, `match`, `evidence/[id]`, `financial-clearance`, `work-queue`, `pas` — even where `principal.userId` is already resolved in the same handler (evidence + financial-clearance use `principal.userId` for the DENY audit but `'session-user'` for the disclosure audit). | HIPAA accounting-of-disclosures must answer "WHO accessed / disclosed this member's data." Every disclosure attributed to a constant string cannot answer it. The real principal is in-hand and thrown away. | HIGH | I8A (attribution) |
| AUD-03 | access | Successful PHI reads are not consistently audited. In `devMockEnabled()` mode the FHIR passthrough and `$member-match` return the member's data BEFORE any audit call (only consent-deny / break-glass / IDOR-deny paths audit). Live-mode `fhirRead` does emit `fhir.get`, but to the flat file (AUD-01) and with the AUD-02 actor. | "Who accessed this member's data, when, why" is unanswerable when a normal successful read leaves no record. Read-audit is the core of accounting-of-disclosures and it is partial. | HIGH | I8A (read-audit) |
| AUD-04 | mutation / disclosure | `audit()` never throws — on failure it swallows to `console.warn` "so an unwritable disk never blocks a request." Privileged and break-glass actions therefore proceed even when their audit write is lost. | For break-glass and Part 2 disclosure the design promises "never a silent override." An override whose audit can silently vanish IS a silent override. High-impact actions need a fail-closed (or durably-queued) audit, not best-effort. | HIGH | I8A / I9 |
| AUD-05 | disclosure | Part 2 access audit (`Part2AuditEntry`: `part2-consent-disclosure` / `part2-break-glass` / `part2-held-restricted`) is a RETURN VALUE of `evaluatePart2Access` (`src/lib/consent/part2Consent.ts`), never persisted. (= register R1-I7-3.) | 42 CFR Part 2 disclosures and emergency access must leave a persisted, tamper-evident record for accounting. A return value the caller may or may not store is not an audit trail. | HIGH | I8A (F2-b) |
| AUD-06 | disclosure | Break-glass is not time-boxed. `evaluatePart2Access` grants a covering `ConsentScope` with NO expiry/TTL; the emergency grant is mechanically as durable as a consented one. The 2.51 "time-boxed emergency access" exists in prose only. (= register R1-I7-2.) | 42 CFR 2.51 emergency access must be bounded. An unbounded break-glass scope is a standing consent-bypass that never lapses; auditors treat that as an unmitigated over-disclosure. | HIGH | I8A (F2-b) |
| AUD-07 | mutation | `pas/submit` (human-gated PA submission, a mutation) emits NO `audit()` at the route. `pasClient.submitPas` audits `pas.submit` only on the LIVE path; the `devMockEnabled()` branch returns a canned approval with no audit, and the human `approvedBy` (the whole point of the gate) never lands in any audit event. | A prior-auth decision is a coverage determination with member and financial impact. The approver, the decision, and the submission must be attributable and durable. The human-gate's approver identity going unaudited defeats the gate's purpose in an audit. | HIGH | I8 (PAS audit) |
| AUD-08 | mutation / admin | Lifecycle audit events (`auditPurged`, `auditRightToDelete`, `auditHoldPlaced/Released`) are built as RETURN VALUES by `src/lib/lifecycle/audit.ts` and handed back in the result object; nothing persists them, and no API route invokes the lifecycle module at all. Right-to-delete, purge, and legal-hold place/release leave no durable audit. | Erasure (right-to-be-forgotten), retention purge, and legal-hold are exactly the actions an OCR / litigation-hold audit scrutinizes. They must record actor + basis + before-state durably. Today the tombstone is written to the ledger but the *audit of the deletion action* is a discarded object. | HIGH | NS-03 / I8A (lifecycle audit persistence) |
| AUD-09 | admin / governance | EMPI merge / unmerge (identity survivorship) emits `member.merged` / `member.unmerged` DOMAIN events and rekeys by replay, but there is no `AuditEvent` attributing the steward actor with before/after golden-record state, and no route audits a merge. A steward collapsing two members' records is not in the audit trail. | An EMPI merge is the highest-blast-radius admin action (it fuses two humans' PHI). Accounting and reversal review need actor + before/after + reason. A merge with no audit is unreconstructable and unaccountable. | HIGH | I8A pillar 1 (EMPI audit) |
| AUD-10 | store / admin | No retention enforcement and no export/accounting surface. Migration `001` says "Retention ... 7-year default per ADR-005" but there is no retention code, and there is no endpoint or report that produces an accounting-of-disclosures or a RADV evidence export for a member/date range. | OCR accounting-of-disclosures is a *deliverable* (who/when/why over a period). RADV requires evidence export on demand. Retention has legal minimums (Part 2, CMS). A store you cannot query into a compliance report, and cannot prove you retain for N years, fails the audit even if every event were captured. | HIGH | I9 (retention + export/reporting) |
| AUD-11 | admin / governance | Governance audit (`auditGov` for approve / reject / retire / replay in `value-set-governance/_lib/routeKit.ts`) records action + valueSetId + outcome but NOT the before/after state (no version transition, no old→new state, no diff). It also writes to the flat-file sink (AUD-01). | A config / value-set governance change (a code that gates coverage) must be reconstructable: what state was it, what did it become, who changed it. Action-only audit cannot answer "what did this approval actually change." | HIGH | I8 (governance audit before/after) |
| AUD-12 | disclosure / consent | Consent opt-out / revoke (`consent/provider-access` route) is attributed (`recordedBy` required) and stored in the consent store, but emits NO `AuditEvent` and is not written to the durable/tamper-evident trail. The consent CHANGE itself is unaudited. | Consent state changes are disclosure-governing events; a revocation that is not durably audited cannot be defended ("we honored the opt-out as of date X"). Part 2 / CMS-0057-F expect a consent audit history. | MED | I8A (F2-b consent registry) |
| AUD-13 | access / disclosure | Bulk Payer-to-Payer export (`bulk/start`) is a mass PHI egress. The live path audits a single `p2p.export.start` event via `bulkClient`, but the `devMockEnabled()` branch returns a job with no audit, and there is no per-member / per-resource accounting of WHAT the export actually disclosed. | A bulk export can disclose thousands of members. Accounting-of-disclosures needs the scope of what left the building, not just that a job started. A single start-event is not an accounting of the disclosure. | MED | I9 (bulk disclosure accounting) |
| AUD-14 | access | `cds-hooks/patient-view`, `cds-hooks/order-sign`, `dtr/evaluate`, `dtr/package`, and `network-adequacy` handle member/clinical context but emit no (or, for network-adequacy, minimal) audit. CDS Hooks receives a full patient context prefetch; DTR evaluates against clinical data. None records an access event. | These surfaces read PHI to produce decisions. If a member later disputes "why was my data used for X," there is no access record. Accounting-of-disclosures must cover decision-support reads, not only direct FHIR GETs. | MED | I8 (decision-support read-audit) |
| AUD-15 | disclosure | Break-glass reason is optional: `req.breakGlassReason?.trim() || 'emergency access (reason not provided)'` still discloses and audits with a placeholder. Combined with segment-level (not field-level) minimum-necessary (register R1-I7-4), an emergency access with no stated reason releases whole segments. | 42 CFR 2.51 break-glass expects a bona-fide-emergency justification captured at the point of override. Accepting "reason not provided" and disclosing anyway is a fail-open on the justification requirement, and over-discloses within the segment. | MED | I8A (F2-b) |
| AUD-16 | store | The ledger's tamper-evidence is a DB trigger denying UPDATE/DELETE (`002_...immutability_trigger.pg.sql`) plus a code-level append-only surface. There is NO cryptographic chain (no per-row hash, no prev-hash linkage, no periodic digest). A superuser / DBA who drops the trigger can alter or delete history undetectably. | "Tamper-EVIDENT" means alteration is detectable after the fact, not merely blocked by a trigger the same privileged operator can remove. RADV / OCR integrity expectations (and Part 2) want verifiable immutability, e.g. a hash chain or WORM storage, so a mutation leaves a detectable break. | MED | I9 (ledger integrity chain / WORM) |

## Surface roll-up

- ACCESS (PHI read / accounting-of-disclosures): AUD-02, AUD-03, AUD-13, AUD-14. Read-audit
  is partial (mock paths and decision-support surfaces unaudited) and "who" is a constant.
  An OCR accounting-of-disclosures for a member cannot be produced today.
- MUTATION: AUD-01, AUD-04, AUD-07, AUD-08. Not every mutation is audited to a durable store;
  PA submission and all lifecycle (erase / purge / hold) actions leave no persisted audit.
- DISCLOSURE (42 CFR Part 2): AUD-05, AUD-06, AUD-12, AUD-15. The Part 2 primitives are
  correct in-module but the audit does not persist, break-glass is not time-boxed, consent
  changes are unaudited, and the break-glass justification is fail-open. (Consistent with the
  register's F2-b CRITICAL residual: R1-I7-2, R1-I7-3, R1-I7-4.)
- ADMIN / GOVERNANCE: AUD-09, AUD-11. Merge and value-set governance changes are audited
  action-only (or via domain events), without actor + before/after. Positive: the ops
  dead-letter routes DO audit with `principal.userId` and a before/after-bearing descriptor —
  the pattern the governance and identity surfaces should adopt.
- STORE (immutability / retention / export): AUD-01, AUD-10, AUD-16. Durable+immutable applies
  to EvidenceRecords only; audit events are not on it; no retention enforcement; no export /
  accounting report; no cryptographic tamper-evidence.

## Cross-reference to existing register

- AUD-05 = R1-I7-3 (Part2-audit-non-persisted); AUD-06 = R1-I7-2 (break-glass-not-time-boxed);
  both are the open F2-b (CRITICAL, I8A) consent-lifecycle residual.
- AUD-15 relates to R1-I7-4 (minimum-necessary segment-level).
- AUD-08 sits under NS-03 (data lifecycle) — the lifecycle module exists but its audit is
  unpersisted and unwired to any route.
- AUD-01 / AUD-10 / AUD-16 are the negative-space the register's NS-02 (observability) and the
  audit-export missing-item (Iteration 5 R2 list) point at, scoped here specifically to the
  audit-of-record store.
