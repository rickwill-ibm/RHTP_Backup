/**
 * Value-set governance service (I8A-iii Wave A).
 *
 * Orchestrates the guarded lifecycle over a governance store: draft -> in-review
 * -> approved(active) / rejected -> retired/superseded. Every transition is
 * guarded by the state machine and appended to the immutable audit ledger with
 * the acting principal, an injected-clock timestamp, from -> to, and a reason.
 *
 * Maker-checker is ENFORCED (not advisory): under the default `maker-checker`
 * mode the principal who submitted a version cannot approve it, and only a
 * `value-set-reviewer` may approve. Under `single-approver` the submitter may
 * approve. Approving a version SUPERSEDES the prior active one, so at most one
 * version per value set is ever active (the one-active invariant).
 *
 * Deterministic: the clock is injected; no wall-clock or randomness is read here.
 */
import * as clock from '@/lib/clock';
import {
  DEFAULT_GOVERNANCE_CONFIG,
  MakerCheckerViolationError,
  VersionNotFoundError,
  type GovernanceConfig,
  type GovernancePrincipal,
  type GovernanceTransitionRecord,
  type GovernedVersionRecord,
} from './types';
import { nextState } from './stateMachine';
import { evaluateMakerChecker } from './makerChecker';
import {
  createInMemoryValueSetGovernanceStore,
  type HistoryFilter,
  type ValueSetGovernanceStore,
} from './store';
import { replayAgainstVersion, type ReplayInput, type ReplayResult } from './replay';

export interface CreateDraftInput {
  valueSetId: string;
  version: string;
  system?: string;
  /** The steward authoring the draft. */
  createdBy: string;
}

export interface ValueSetGovernanceService {
  /** Register a new version in `draft`. */
  createDraft(input: CreateDraftInput): GovernedVersionRecord;
  /** draft -> in-review. Records the submitter as the MAKER. */
  submitForReview(
    valueSetId: string,
    version: string,
    principal: GovernancePrincipal,
    reason?: string,
  ): GovernedVersionRecord;
  /** in-review -> approved(active). Maker-checker enforced; supersedes the prior active. */
  approve(
    valueSetId: string,
    version: string,
    principal: GovernancePrincipal,
    reason?: string,
  ): GovernedVersionRecord;
  /** in-review -> rejected. */
  reject(
    valueSetId: string,
    version: string,
    principal: GovernancePrincipal,
    reason?: string,
  ): GovernedVersionRecord;
  /** draft|approved -> retired. */
  retire(
    valueSetId: string,
    version: string,
    principal: GovernancePrincipal,
    reason?: string,
  ): GovernedVersionRecord;
  /** The single ACTIVE version of a value set, or undefined. */
  activeVersion(valueSetId: string): GovernedVersionRecord | undefined;
  /** Every version of a value set. */
  listVersions(valueSetId: string): GovernedVersionRecord[];
  /** The immutable transition audit, optionally filtered. */
  history(filter?: HistoryFilter): GovernanceTransitionRecord[];
  /** Reproduce a past adjudication: bind/evaluate a code against a chosen version. */
  replay(input: ReplayInput): ReplayResult;
  /** The effective approval mode. */
  readonly approvalMode: GovernanceConfig['approvalMode'];
}

export interface GovernanceServiceOptions {
  store?: ValueSetGovernanceStore;
  config?: GovernanceConfig;
  /** Injected clock for transition timestamps (defaults to @/lib/clock). */
  now?: () => Date;
}

export function createValueSetGovernanceService(
  opts: GovernanceServiceOptions = {},
): ValueSetGovernanceService {
  const store = opts.store ?? createInMemoryValueSetGovernanceStore();
  const config = opts.config ?? DEFAULT_GOVERNANCE_CONFIG;
  const now = opts.now ?? (() => clock.nowDate());
  const nowIso = (): string => now().toISOString();

  function requireVersion(valueSetId: string, version: string): GovernedVersionRecord {
    const v = store.getVersion(valueSetId, version);
    if (!v) throw new VersionNotFoundError(valueSetId, version);
    return v;
  }

  function applyTransition(
    rec: GovernedVersionRecord,
    action: Parameters<typeof nextState>[1],
    principal: GovernancePrincipal | { userId: string; role: 'system' },
    reason: string | undefined,
    at: string,
  ): GovernedVersionRecord {
    // Guarded: nextState throws IllegalTransitionError on an illegal edge.
    const to = nextState(rec.state, action);
    const updated: GovernedVersionRecord = { ...rec, state: to, updatedAt: at };
    store.putVersion(updated);
    store.appendTransition({
      valueSetId: rec.valueSetId,
      version: rec.version,
      action,
      from: rec.state,
      to,
      principalId: principal.userId,
      principalRole: principal.role,
      reason,
      at,
    });
    return updated;
  }

  return {
    approvalMode: config.approvalMode,

    createDraft(input) {
      const at = nowIso();
      const draft: GovernedVersionRecord = {
        valueSetId: input.valueSetId,
        version: input.version,
        system: input.system,
        state: 'draft',
        createdBy: input.createdBy,
        createdAt: at,
        updatedAt: at,
      };
      store.putVersion(draft);
      return { ...draft };
    },

    submitForReview(valueSetId, version, principal, reason) {
      const current = requireVersion(valueSetId, version);
      const at = nowIso();
      const submitted = applyTransition(current, 'submit', principal, reason, at);
      const withMaker: GovernedVersionRecord = {
        ...submitted,
        submittedBy: principal.userId,
        submittedAt: at,
      };
      store.putVersion(withMaker);
      return { ...withMaker };
    },

    approve(valueSetId, version, principal, reason) {
      const current = requireVersion(valueSetId, version);
      // Maker-checker (ENFORCED) via the SINGLE shared predicate — the same rule
      // the console gate and the BFF boundary evaluate (Wave D convergence).
      const decision = evaluateMakerChecker({
        approvalMode: config.approvalMode,
        submittedBy: current.submittedBy,
        approverId: principal.userId,
        approverRole: principal.role,
      });
      if (!decision.ok) {
        throw new MakerCheckerViolationError(decision.reasonCode!, decision.detail!);
      }
      const at = nowIso();
      // One-active invariant: supersede the prior active version first.
      const priorActive = store.activeVersion(valueSetId);
      if (priorActive && priorActive.version !== version) {
        applyTransition(priorActive, 'supersede', { userId: 'system', role: 'system' },
          `superseded by ${version}`, at);
      }
      const approved = applyTransition(current, 'approve', principal, reason, at);
      const decided: GovernedVersionRecord = { ...approved, decidedBy: principal.userId, decidedAt: at };
      store.putVersion(decided);
      return { ...decided };
    },

    reject(valueSetId, version, principal, reason) {
      const current = requireVersion(valueSetId, version);
      const at = nowIso();
      const rejected = applyTransition(current, 'reject', principal, reason, at);
      const decided: GovernedVersionRecord = { ...rejected, decidedBy: principal.userId, decidedAt: at };
      store.putVersion(decided);
      return { ...decided };
    },

    retire(valueSetId, version, principal, reason) {
      const current = requireVersion(valueSetId, version);
      const at = nowIso();
      return applyTransition(current, 'retire', principal, reason, at);
    },

    activeVersion(valueSetId) {
      return store.activeVersion(valueSetId);
    },

    listVersions(valueSetId) {
      return store.listVersions(valueSetId);
    },

    history(filter) {
      return store.history(filter);
    },

    replay(input) {
      return replayAgainstVersion(input);
    },
  };
}
