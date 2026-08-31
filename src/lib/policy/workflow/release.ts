/**
 * Release summary — the operational conclusion of a policy promotion (Policy Engine authoring).
 *
 * Promotion is NOT an instant "it's live". A signed-off policy version is stamped, QUEUED for the next
 * scheduled release window, and given a future EFFECTIVE DATE (advance provider notice, per CMS /
 * state coverage-change rules). A change record is filed and stakeholders are notified. This module is
 * the pure, deterministic derivation of that summary from the workflow record + a clock — no I/O, no
 * `Date.now()` (the clock is injected), no framework — so the UI is a thin renderer and the values are
 * reproducible on the evidence ledger.
 *
 * DEMO HONESTY: `notifications` are the stakeholders a promotion WOULD notify — the operational step,
 * modeled, never a claim that real messages were sent. Callers render them as "queued".
 */

export interface ReleaseNotification {
  /** Stakeholder queue that receives the change. */
  team: string;
  /** Why this team is on the distribution — the operational reason, not boilerplate. */
  reason: string;
}

export interface ReleaseSummary {
  /** Calendar version stamped at promotion, e.g. "2026.08.1". Immutable once published. */
  version: string;
  /** Change-control record id, e.g. "CHG-2026-0142" — deterministic from the policy + window. */
  changeId: string;
  /** The next scheduled release window this version is queued into (ISO date). */
  releaseWindow: string;
  /** When the coverage criteria actually take effect (ISO date) = window + provider-notice period. */
  effectiveDate: string;
  /** Advance provider-notice period, in days, between the release window and the effective date. */
  noticeDays: number;
  /** The prior live version this one supersedes, or null for an initial release. */
  supersedes: string | null;
  /** Maker (submitter) and checker (approver) references carried from the sign-off. */
  submittedBy?: string;
  approvedBy?: string;
  /** Stakeholder queues the change is distributed to on release (modeled — see module note). */
  notifications: ReleaseNotification[];
}

export interface ReleaseOptions {
  /** Injected clock — the promotion instant. Required so the summary is reproducible. */
  now: Date;
  policyId: string;
  guidelineId?: string;
  /** The currently-live version, if any (null ⇒ initial release). */
  priorVersion?: string | null;
  /** Provider-notice period in days (default 60). */
  noticeDays?: number;
  submittedBy?: string;
  approvedBy?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const pad2 = (n: number): string => String(n).padStart(2, '0');
const isoDate = (d: Date): string =>
  `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;

/** The first day of the month AFTER `now` (UTC) — the next monthly change window. */
function nextReleaseWindow(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/** A stable 4-digit change sequence from the policy identity — deterministic, no randomness. */
function changeSeq(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return String(h % 10000).padStart(4, '0');
}

/** Fixed stakeholder distribution for a UM-policy coverage change (modeled, not sent). */
function releaseNotifications(): ReleaseNotification[] {
  return [
    { team: 'UM Operations', reason: 'new policy version active in the UM rules engine' },
    { team: 'Provider Network', reason: 'advance provider notice of the coverage-criteria change' },
    {
      team: 'Configuration / IT',
      reason: 'CRD coverage rules + DTR questionnaire deployed to prod',
    },
    { team: 'Compliance', reason: 'change record filed for the accounting-of-disclosures audit' },
  ];
}

/**
 * Derive the release summary for a promotion. Deterministic given `now`: same inputs ⇒ same version,
 * window, effective date, and change id.
 */
export function buildReleaseSummary(opts: ReleaseOptions): ReleaseSummary {
  const now = opts.now;
  const noticeDays = opts.noticeDays ?? 60;
  const window = nextReleaseWindow(now);
  const effective = new Date(window.getTime() + noticeDays * DAY_MS);
  const version = `${now.getUTCFullYear()}.${pad2(now.getUTCMonth() + 1)}.1`;
  const changeId = `CHG-${now.getUTCFullYear()}-${changeSeq(opts.guidelineId ?? opts.policyId)}`;
  return {
    version,
    changeId,
    releaseWindow: isoDate(window),
    effectiveDate: isoDate(effective),
    noticeDays,
    supersedes: opts.priorVersion ?? null,
    submittedBy: opts.submittedBy,
    approvedBy: opts.approvedBy,
    notifications: releaseNotifications(),
  };
}
