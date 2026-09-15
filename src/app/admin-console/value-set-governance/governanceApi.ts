/**
 * Value-Set Governance Console — read-model over the REAL Wave-A engine
 * (Iteration 8A-iii, Wave D convergence).
 *
 * BEFORE Wave D this module was a parallel adapter: it declared its OWN lifecycle
 * vocabulary (draft/proposed/approved/active/superseded/retired), its OWN role
 * model (AdminRole maker/checker sets), its OWN maker-checker gate, and its OWN
 * hand-authored version + history seed. That triple-duplicated the backend.
 *
 * NOW it is a THIN delegation. There is ONE lifecycle (the Wave-A state machine),
 * ONE maker-checker rule (`evaluateMakerChecker`), ONE audit ledger (produced by
 * driving the REAL service through REAL transitions), and ONE replay
 * (`service.replay` → `replayAgainstVersion`). The demo scenario is built on the
 * REAL versioned membership data layer (ICD-10-CM FY2025 → FY2026, R51 retired in
 * FY2026), so the version list, the member diff, the history timeline, and the
 * replay are all computed by the engine — not mirrored here.
 *
 * The console view-models (ValueSetVersion / GovernanceEvent / VersionDiff /
 * ReplayResult) are projections of the engine's records for rendering; they carry
 * no lifecycle logic of their own.
 */
import {
  createValueSetGovernanceService,
  evaluateMakerChecker,
  type VersionLifecycleState,
  type GovernedVersionRecord,
  type GovernanceTransitionRecord,
  type GovernanceAction,
  type GovernanceRole,
  type GovernancePrincipal as EnginePrincipal,
} from '@/lib/terminology/governance';
// The REAL versioned membership data layer the engine's replay binds against
// (single source of member content; the console does not mirror it).
import { membersForVersion } from '@/lib/terminology/validateCode';

// ─── Lifecycle vocabulary (re-exported from the engine — no second copy) ─────────

export type GovernanceState = VersionLifecycleState;

/** Human labels + badge variants for each ENGINE lifecycle state. */
export const STATE_META: Readonly<
  Record<
    GovernanceState,
    { label: string; variant: 'success' | 'warning' | 'info' | 'neutral' | 'purple' | 'danger' }
  >
> = Object.freeze({
  draft: { label: 'Draft', variant: 'neutral' },
  'in-review': { label: 'In Review', variant: 'warning' },
  approved: { label: 'Approved (Active)', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'danger' },
  retired: { label: 'Retired', variant: 'danger' },
  superseded: { label: 'Superseded', variant: 'purple' },
});

// ─── Console principal (ONE role model: the governance roles + a null viewer) ────

/**
 * A console principal. `govRole` is one of the two governance roles
 * (value-set-steward = maker, value-set-reviewer = checker) or null for a
 * read-only viewer — exactly the actor model the BFF routes use
 * (`GovActor.govRole: GovRole | null`). No AdminRole maker/checker sets remain.
 */
export interface GovernancePrincipal {
  id: string;
  name: string;
  govRole: GovernanceRole | null;
}

/** One PHI-free version record projected for the console. */
export interface ValueSetVersion {
  assetId: string;
  assetName: string;
  versionId: string;
  version: string;
  system: string;
  state: GovernanceState;
  /** true when this version is the currently-bound ACTIVE version (state === approved). */
  isActive: boolean;
  effectiveDate: string;
  submittedBy?: string;
  submittedByName?: string;
  submittedAt?: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  /** PHI-free member codes of this version, from the REAL membership data layer. */
  members: string[];
}

/** One entry in the immutable audit / version-history timeline (from the engine ledger). */
export interface GovernanceEvent {
  id: string;
  at: string;
  actor: string;
  action: GovernanceAction;
  versionId: string;
  version: string;
  fromState: GovernanceState;
  toState: GovernanceState;
  note: string;
}

/** Diff of members between two versions. */
export interface VersionDiff {
  fromVersionId: string;
  toVersionId: string;
  added: string[];
  removed: string[];
  changed: { code: string; from: string; to: string }[];
}

/** Result of replaying a code against a chosen historical version (from the engine). */
export interface ReplayResult {
  versionId: string;
  version: string;
  code: string;
  member: boolean;
  binding: 'in-value-set' | 'not-in-value-set';
  asOfState: GovernanceState | 'not-modeled';
  /** E9: true only when the CHOSEN version's membership was found and evaluated. */
  reproduced: boolean;
  status: string;
}

// ─── Demo scenario, built by driving the REAL service through REAL transitions ──

const ASSET_ID = 'icd10cm-governed';
const ASSET_NAME = 'ICD-10-CM Governed Value Set';
const SYSTEM = 'ICD-10-CM';

const STEWARD: EnginePrincipal = { userId: 'gp-steward-01', role: 'value-set-steward' };
const REVIEWER: EnginePrincipal = { userId: 'gp-reviewer-01', role: 'value-set-reviewer' };

const NAME_BY_ID: Readonly<Record<string, string>> = Object.freeze({
  'gp-steward-01': 'Alex Rivera',
  'gp-reviewer-01': 'Morgan Lee',
  'gp-auditor-01': 'Jordan Poe',
  system: 'system',
});

/** Demo principals the console selector drives (maker, checker, viewer). */
export const DEMO_PRINCIPALS: Readonly<Record<string, GovernancePrincipal>> = Object.freeze({
  steward: { id: 'gp-steward-01', name: 'Alex Rivera', govRole: 'value-set-steward' },
  reviewer: { id: 'gp-reviewer-01', name: 'Morgan Lee', govRole: 'value-set-reviewer' },
  auditor: { id: 'gp-auditor-01', name: 'Jordan Poe', govRole: null },
});

/** Per-version effective/effective-target dates (display only; the ledger holds the real transition clock). */
const EFFECTIVE: Readonly<Record<string, string>> = Object.freeze({
  FY2025: '2024-10-01',
  FY2026: '2025-10-01',
  FY2027: '2026-10-01',
  FY2028: '2026-10-01',
});

/**
 * Build the seeded governance service ONCE by replaying real lifecycle actions.
 * A deterministic monotonic clock gives each transition a distinct timestamp so
 * the ledger and the history timeline order correctly (no wall-clock read).
 */
function buildSeededService() {
  let tick = Date.UTC(2024, 8, 1, 9, 0, 0); // 2024-09-01T09:00:00Z
  const now = () => {
    const d = new Date(tick);
    tick += 60 * 60 * 1000; // +1h per transition
    return d;
  };
  const svc = createValueSetGovernanceService({ now });

  // FY2025: draft → in-review → approved, later superseded by FY2026 (one-active).
  svc.createDraft({
    valueSetId: ASSET_ID,
    version: 'FY2025',
    system: SYSTEM,
    createdBy: STEWARD.userId,
  });
  svc.submitForReview(ASSET_ID, 'FY2025', STEWARD, 'Initial ICD-10-CM governed set (FY2025).');
  svc.approve(ASSET_ID, 'FY2025', REVIEWER, 'FY2025 approved by reviewer.');

  // FY2026: draft → in-review → approved (active); approving supersedes FY2025.
  svc.createDraft({
    valueSetId: ASSET_ID,
    version: 'FY2026',
    system: SYSTEM,
    createdBy: STEWARD.userId,
  });
  svc.submitForReview(ASSET_ID, 'FY2026', STEWARD, 'FY2026 annual update; R51 removed.');
  svc.approve(ASSET_ID, 'FY2026', REVIEWER, 'FY2026 approved; supersedes FY2025.');

  // FY2027: in-review, submitted by the STEWARD — a reviewer other than the maker MAY approve.
  svc.createDraft({
    valueSetId: ASSET_ID,
    version: 'FY2027',
    system: SYSTEM,
    createdBy: STEWARD.userId,
  });
  svc.submitForReview(ASSET_ID, 'FY2027', STEWARD, 'FY2027 candidate awaiting review.');

  // FY2028: in-review, submitted by the REVIEWER — separation-of-duties means the
  // reviewer may NOT approve their own submission (self-approval), and the steward
  // may not approve at all (not-a-reviewer). The maker-checker demo case.
  svc.createDraft({
    valueSetId: ASSET_ID,
    version: 'FY2028',
    system: SYSTEM,
    createdBy: REVIEWER.userId,
  });
  svc.submitForReview(ASSET_ID, 'FY2028', REVIEWER, 'FY2028 candidate submitted by a reviewer.');

  return svc;
}

const service = buildSeededService();

// ─── Projections (engine record → console view-model) ───────────────────────────

function versionIdOf(valueSetId: string, version: string): string {
  return `${valueSetId}@${version}`;
}

function toViewModel(r: GovernedVersionRecord): ValueSetVersion {
  return {
    assetId: r.valueSetId,
    assetName: ASSET_NAME,
    versionId: versionIdOf(r.valueSetId, r.version),
    version: r.version,
    system: r.system ?? SYSTEM,
    state: r.state,
    isActive: r.state === 'approved',
    effectiveDate: EFFECTIVE[r.version] ?? r.createdAt.slice(0, 10),
    submittedBy: r.submittedBy,
    submittedByName: r.submittedBy ? NAME_BY_ID[r.submittedBy] : undefined,
    submittedAt: r.submittedAt,
    approvedBy: r.decidedBy,
    approvedByName: r.decidedBy ? NAME_BY_ID[r.decidedBy] : undefined,
    approvedAt: r.decidedAt,
    members: membersForVersion(r.system ?? SYSTEM, r.version) ?? [],
  };
}

// ─── Read API (delegates to the engine; the surface the console binds to) ───────

/** List every governed version of an asset, newest version first. */
export function listValueSetVersions(assetId: string = ASSET_ID): ValueSetVersion[] {
  return service
    .listVersions(assetId)
    .map(toViewModel)
    .sort((a, b) => (a.version < b.version ? 1 : -1));
}

/** The immutable audit / version-history timeline for an asset, newest first. */
export function getVersionHistory(assetId: string = ASSET_ID): GovernanceEvent[] {
  return service
    .history({ valueSetId: assetId })
    .map((e: GovernanceTransitionRecord) => ({
      id: `ev-${e.seq}`,
      at: e.at,
      actor: NAME_BY_ID[e.principalId] ?? e.principalId,
      action: e.action,
      versionId: versionIdOf(e.valueSetId, e.version),
      version: e.version,
      fromState: e.from,
      toState: e.to,
      note: e.reason ?? `${e.action} ${e.version}`,
    }))
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}

function versionFromId(versionId: string): string {
  const at = versionId.lastIndexOf('@');
  return at >= 0 ? versionId.slice(at + 1) : versionId;
}

/**
 * Member-level diff between two versions, computed from the REAL versioned
 * membership data layer (`membersForVersion`) — the same source the engine's
 * replay binds against. No mirrored member list.
 */
export function diffVersions(fromVersionId: string, toVersionId: string): VersionDiff {
  const fromMembers = new Set(membersForVersion(SYSTEM, versionFromId(fromVersionId)) ?? []);
  const toMembers = new Set(membersForVersion(SYSTEM, versionFromId(toVersionId)) ?? []);
  const added = [...toMembers].filter((c) => !fromMembers.has(c)).sort();
  const removed = [...fromMembers].filter((c) => !toMembers.has(c)).sort();
  return { fromVersionId, toVersionId, added, removed, changed: [] };
}

/**
 * Replay: re-run a code's binding as-of a CHOSEN historical version via the
 * engine's `replayAgainstVersion`. E9: when the chosen version is not modeled the
 * engine returns reproduced:false and NEVER falls back to the current version —
 * surfaced here as `not-modeled`, not a false "in value set".
 */
export function replayBinding(versionId: string, rawCode: string): ReplayResult {
  const version = versionFromId(versionId);
  const code = rawCode.trim();
  const r = service.replay({ system: SYSTEM, code, version });
  const state = service.listVersions(ASSET_ID).find((v) => v.version === version)?.state;
  return {
    versionId,
    version,
    code,
    member: r.valid,
    binding: r.valid ? 'in-value-set' : 'not-in-value-set',
    asOfState: r.reproduced ? (state ?? 'draft') : 'not-modeled',
    reproduced: r.reproduced,
    status: r.status,
  };
}

// ─── Role → mode + approval gate (the ONE maker-checker rule) ────────────────────

export type ConsoleMode = 'admin' | 'viewer';

/** Admin mode = the principal holds a governance role; otherwise viewer (read + replay only). */
export function governanceModeForRole(govRole: GovernanceRole | null): ConsoleMode {
  return govRole ? 'admin' : 'viewer';
}

/** Only a steward (the maker) may submit a draft version for review. */
export function canSubmit(principal: GovernancePrincipal): boolean {
  return principal.govRole === 'value-set-steward';
}

/**
 * The approval gate. Delegates separation-of-duties to the SINGLE engine
 * predicate `evaluateMakerChecker`, so the UI cannot drift from the backend rule.
 * E9: a maker may NEVER approve their own submitted version and a non-reviewer may
 * never approve — the control is returned DISABLED with the reason, and the
 * console must not itself perform an approval this forbids.
 */
export function evaluateApprovalGate(
  version: ValueSetVersion,
  principal: GovernancePrincipal
): { enabled: boolean; reason: string } {
  if (version.state !== 'in-review') {
    return {
      enabled: false,
      reason: `Only a version in review can be approved (this version is ${STATE_META[version.state].label.toLowerCase()}).`,
    };
  }
  const decision = evaluateMakerChecker({
    approvalMode: 'maker-checker',
    submittedBy: version.submittedBy,
    approverId: principal.id,
    approverRole: principal.govRole,
  });
  if (!decision.ok) {
    const reason =
      decision.reasonCode === 'self-approval'
        ? 'Maker-checker: you submitted this version, so a different reviewer must approve it.'
        : 'Your role cannot approve value-set versions (a value-set-reviewer is required).';
    return { enabled: false, reason };
  }
  return { enabled: true, reason: 'You may approve this version in review.' };
}
