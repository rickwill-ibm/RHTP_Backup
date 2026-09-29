/**
 * Prior-Authorization work queue + SLA (increment GT-7).
 *
 * Routes each cleared order into a reviewer queue by disposition, attaches the
 * Evidence Record reference, and starts the CMS-0057-F SLA clock (72h expedited
 * / 7d standard). Pure + deterministic: `submittedAt` is supplied, `dueBy` is
 * computed by epoch math so it is reproducible.
 */
import { slaHours } from '@/lib/workflow/paMachine';
import type { NetOutcome } from './medicalNecessity';
import type { PropensityBand } from '@/lib/policy';

export type QueueName =
  | 'auto-cleared' // gold-card exempt or no PA required
  | 'ready-to-submit' // criteria met / low risk
  | 'high-risk-review' // likely deny / high propensity — work with partial evidence
  | 'denied-appeal'
  | 'more-info'
  | 'agent-proposal' // G4: an agent-runtime proposal awaiting a human decision (HITL)
  | 'escalated' // G4: an agent proposal escalated past its SLA up the care-team hierarchy
  /**
   * W8/G-001: the escalation ladder is exhausted and the runtime ABANDONED the work item.
   *
   * Its own queue, because a parked proposal used to stay on `escalated` with `status: 'pending'` —
   * visible, but indistinguishable from one still actively escalating. A reviewer scanning
   * `escalated` for live work could not tell a dead row from a live one, and that mislabelling was
   * the actual defect rather than invisibility.
   *
   * THE ITEM IS NOT ACTIONABLE. This said it was, which was the claim `escalationLadder.ts` was
   * written to retract and this line did not get the retraction. The proposal record does outlive
   * the terminated workflow — but only so the refusal is LOUD: the body is still suspended on its
   * decision promise, so resolving the record would resume it and run its effect after the runtime
   * declared the work abandoned. `decide()` refuses with `WorkflowTerminatedError`. A parked row is
   * a dead row that must be RE-FILED by a human; the runtime provides no re-activation path.
   */
  | 'parked';

export interface WorkItem {
  queue: QueueName;
  disposition: string;
  priority: 'expedited' | 'standard';
  slaHours: number;
  submittedAt: string;
  dueBy: string;
  evidenceId: string;
  memberId: string;
  code: string;
  propensityScore?: number;
  note: string;
}

export interface RouteInput {
  netOutcome: NetOutcome;
  requiresPA: boolean;
  propensity?: { score: number; band: PropensityBand };
  priority: 'expedited' | 'standard';
  submittedAt: string;
  evidenceId: string;
  memberId: string;
  code: string;
  /** Optional payer decision already known (from a ClaimResponse). */
  decision?: 'approved' | 'denied' | 'more-info';
}

function addHoursIso(iso: string, hours: number): string {
  const ms = Date.parse(iso) + hours * 3600_000;
  return new Date(ms).toISOString();
}

function pick(input: RouteInput): { queue: QueueName; disposition: string; note: string } {
  if (input.decision === 'denied')
    return {
      queue: 'denied-appeal',
      disposition: 'denied',
      note: 'Payer denied — evidence + reasons attached for appeal.',
    };
  if (input.decision === 'more-info')
    return {
      queue: 'more-info',
      disposition: 'more-info',
      note: 'Payer requested more information.',
    };

  if (!input.requiresPA)
    return {
      queue: 'auto-cleared',
      disposition:
        input.netOutcome === 'pa-exempt-gold-card' ? 'gold-card-exempt' : 'no-pa-required',
      note:
        input.netOutcome === 'pa-exempt-gold-card'
          ? 'Gold-carded — PA waived; documented closure.'
          : 'No prior authorization required.',
    };

  if (input.netOutcome === 'likely-denial-experimental' || input.propensity?.band === 'high')
    return {
      queue: 'high-risk-review',
      disposition: 'likely-deny',
      note: 'High denial risk — queue with partial evidence and close gaps before submission.',
    };

  return {
    queue: 'ready-to-submit',
    disposition: 'ready',
    note: 'Criteria supportable — ready for human-gated submission.',
  };
}

/** Route an order to a queue with an SLA due date. */
export function routeToQueue(input: RouteInput): WorkItem {
  const { queue, disposition, note } = pick(input);
  const hours = slaHours(input.priority);
  return {
    queue,
    disposition,
    priority: input.priority,
    slaHours: hours,
    submittedAt: input.submittedAt,
    dueBy: addHoursIso(input.submittedAt, hours),
    evidenceId: input.evidenceId,
    memberId: input.memberId,
    code: input.code,
    propensityScore: input.propensity?.score,
    note,
  };
}

/** True when the SLA is breached as of `asOf`. */
export function isSlaBreached(item: WorkItem, asOf: string): boolean {
  return Date.parse(asOf) > Date.parse(item.dueBy);
}
