/**
 * Governance backend RESOLUTION seam (Iteration 8a-iii, Wave C).
 *
 * resolveGovernanceBackend() returns the bound Wave A backend when it has been
 * registered, otherwise a clearly-labeled in-memory INTEGRATION DOUBLE so this
 * BFF slice compiles, tests, and role-gates before Wave A lands. This is NOT a
 * re-implementation of Wave A's lifecycle for production use — it is the minimal
 * stand-in the ports-and-adapters seam needs; the route always calls the port,
 * never inlines lifecycle logic.
 *
 * INTEGRATION POINT: Wave A wires its real facade with one call at startup —
 *   registerGovernanceBackend(valueSetGovernanceBackend)  // from src/lib/terminology/governance
 * after which resolveGovernanceBackend() returns it and the double is unused.
 */
import type {
  GovernanceBackend,
  GovernanceDecisionInput,
  GovernanceHistoryEntry,
  GovernanceMutationInput,
  GovernanceRecord,
  GovernanceState,
  ReplayBinding,
} from './backendPort';
import { GovernanceStateError } from './backendPort';
import { getDataMode } from '@/lib/config/dataMode';
import { evaluateMakerChecker } from '@/lib/terminology/governance';

let bound: GovernanceBackend | null = null;

/** Wave A calls this once to bind its real lifecycle/approval/replay/history facade. */
export function registerGovernanceBackend(backend: GovernanceBackend): void {
  bound = backend;
}

/**
 * Thrown when the governance backend seam is in production mode but no real
 * backend has been registered — mirrors ValueSetGovernanceStoreNotConfiguredError
 * (SEAM: valueSetGovernanceStore). Wave D fix: production MUST NOT silently serve
 * the in-memory integration double as durable governance (the U4 dead-wiring
 * masquerade). Fail closed instead.
 */
export class GovernanceBackendNotConfiguredError extends Error {
  constructor() {
    super(
      'DATA_MODE valueSetGovernanceStore=production: no real value-set governance ' +
        'backend is registered. Call registerGovernanceBackend(<Wave-A facade>) at ' +
        'the composition root (SEAM: valueSetGovernanceStore) or set ' +
        'DATA_MODE_VALUE_SET_GOVERNANCE_STORE=mock.',
    );
    this.name = 'GovernanceBackendNotConfiguredError';
  }
}

/**
 * The backend the routes call. A registered real backend always wins. Otherwise
 * the in-memory integration double serves mock/seeded modes ONLY; production with
 * no registered backend FAILS CLOSED (never the double presented as production).
 * SEAM: valueSetGovernanceStore.
 */
export function resolveGovernanceBackend(): GovernanceBackend {
  if (bound) return bound;
  if (getDataMode('valueSetGovernanceStore') === 'production') {
    throw new GovernanceBackendNotConfiguredError();
  }
  return integrationDouble;
}

// ── In-memory integration double (temporary; replaced by Wave A registration) ──

interface DoubleEntry {
  record: GovernanceRecord;
  history: GovernanceHistoryEntry[];
}

const store = new Map<string, DoubleEntry>();

function now(): string {
  return new Date().toISOString();
}

function transition(
  valueSetId: string,
  version: string | undefined,
  actor: string,
  action: GovernanceHistoryEntry['action'],
  toState: GovernanceState,
): GovernanceRecord {
  const existing = store.get(valueSetId);
  const fromState = existing?.record.state ?? null;
  const record: GovernanceRecord = {
    valueSetId,
    version: version ?? existing?.record.version ?? '0',
    state: toState,
    submittedBy:
      action === 'submit' ? actor : existing?.record.submittedBy,
    approvedBy: action === 'approve' ? actor : existing?.record.approvedBy,
    updatedAt: now(),
  };
  const history = existing?.history ?? [];
  history.push({ at: record.updatedAt, actor, action, fromState, toState });
  store.set(valueSetId, { record, history });
  return record;
}

const integrationDouble: GovernanceBackend = {
  submit(input: GovernanceMutationInput): GovernanceRecord {
    return transition(input.valueSetId, input.version, input.actor, 'submit', 'pending-approval');
  },
  approve(input: GovernanceDecisionInput): GovernanceRecord {
    const current = store.get(input.valueSetId)?.record;
    if (!current) throw new GovernanceStateError('no submitted version to approve', 'not-found');
    if (current.state !== 'pending-approval') {
      throw new GovernanceStateError('version is not pending approval', 'conflict');
    }
    // Backend-side maker-checker via the SINGLE shared predicate (defense in depth
    // alongside the route boundary). approve is reviewer-gated at the route, so the
    // acting role is a reviewer; the predicate blocks the submitter approving own.
    const decision = evaluateMakerChecker({
      approvalMode: this.makerCheckerEnabled() ? 'maker-checker' : 'single-approver',
      submittedBy: current.submittedBy,
      approverId: input.actor,
      approverRole: 'value-set-reviewer',
    });
    if (!decision.ok) {
      throw new GovernanceStateError('maker-checker: submitter may not approve', 'forbidden');
    }
    return transition(input.valueSetId, current.version, input.actor, 'approve', 'approved');
  },
  reject(input: GovernanceDecisionInput): GovernanceRecord {
    const current = store.get(input.valueSetId)?.record;
    if (!current) throw new GovernanceStateError('no submitted version to reject', 'not-found');
    return transition(input.valueSetId, current.version, input.actor, 'reject', 'rejected');
  },
  retire(input: GovernanceMutationInput): GovernanceRecord {
    return transition(input.valueSetId, input.version, input.actor, 'retire', 'retired');
  },
  replay(valueSetId: string, version: string): ReplayBinding {
    const current = store.get(valueSetId)?.record;
    return {
      valueSetId,
      version,
      boundVersion: version,
      state: current?.state ?? 'approved',
      resolvedAt: now(),
    };
  },
  history(valueSetId: string): GovernanceHistoryEntry[] {
    return [...(store.get(valueSetId)?.history ?? [])];
  },
  getRecord(valueSetId: string): GovernanceRecord | undefined {
    return store.get(valueSetId)?.record;
  },
  makerCheckerEnabled(): boolean {
    return true;
  },
};

/** TEST-ONLY: clear the integration double and any registered backend binding. */
export function __resetGovernanceBackendForTest(): void {
  store.clear();
  bound = null;
}
