/**
 * slaBook — the SLA-attainment projection for the Operations console. PURE + CLIENT-SAFE
 * (type-only engine import; no `@/lib/evidence` barrel, no node): it reads the live tickets and
 * projects the numbers an ops leader actually watches — per-seat queue health and a portfolio
 * attainment view — from fields the engine already stamps (`bornTick`, `assignedTick`, `closedTick`,
 * `slaHours`). It NEVER mutates state.
 *
 * HONESTY: SLA windows are the ticket's own `slaHours × TICKS_PER_HOUR` (the same window the badge
 * uses), on the demo's TIME-COMPRESSED clock. A ratio over an empty set is dishonest, so
 * attainment / turnaround / first-touch return `null` until a floor of worked tickets exists — the
 * scorecard renders "—" and populates as tickets are grabbed and closed, rather than opening on a
 * vacuous "100%". "Within SLA" is against the LOADED window, not a contractual one.
 */
import { TICKS_PER_HOUR } from '@/lib/goldenThread/workflow';
import { slaRemaining } from '@/lib/goldenThread/surveillanceMap';
import { ROLE_LABEL, OPERATORS, type OpsRole } from '@/lib/goldenThread/e2eFlow';
import type { SimState, LiveTicket } from '@/lib/goldenThread/flowSim';

/** Below this many worked (closed / assigned) tickets a rate would be statistically vacuous → null. */
export const ATTAINMENT_FLOOR = 5;
/** "Approaching breach" = an OPEN ticket with less than this fraction of its window left (not yet past due). */
const APPROACHING = 0.2;

const hoursSince = (nowTick: number, tick: number): number => (nowTick - tick) / TICKS_PER_HOUR;
const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const percentile = (xs: number[], p: number): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1));
  return s[i];
};

export interface SeatSla {
  role: OpsRole;
  label: string;
  operator: string;
  depth: number; // open tickets queued to this seat
  aging: { lt24h: number; h24_48: number; h48_72: number; gt72h: number };
  withinSlaPct: number | null; // % of open with time left (null if no open work)
  breaches: number; // open + past due
  approaching: number; // open, < 20% window left, not yet breached
  oldestOpenHrs: number; // 0 when the seat is idle
}

export interface PortfolioSla {
  openCount: number;
  breachCount: number; // open + past due, portfolio-wide
  approachingCount: number;
  closedCount: number;
  attainmentPct: number | null; // closed within window / closed  (null below the floor)
  resolutionMedianHrs: number | null; // (closedTick − bornTick), null below the floor
  resolutionP90Hrs: number | null;
  firstTouchMedianHrs: number | null; // (assignedTick − bornTick), null until claimed volume exists
}

export interface SlaBook {
  seats: SeatSla[];
  portfolio: PortfolioSla;
}

const isOpen = (t: LiveTicket): boolean => t.status !== 'Closed';
const windowTicks = (t: LiveTicket): number => Math.max(1, t.slaHours * TICKS_PER_HOUR);
const withinWindow = (t: LiveTicket, atTick: number): boolean =>
  atTick - t.bornTick <= windowTicks(t);

function seatSla(role: OpsRole, tickets: LiveTicket[], nowTick: number): SeatSla {
  const open = tickets.filter(isOpen);
  const aging = { lt24h: 0, h24_48: 0, h48_72: 0, gt72h: 0 };
  let withinCount = 0;
  let breaches = 0;
  let approaching = 0;
  let oldest = 0;
  for (const t of open) {
    const h = hoursSince(nowTick, t.bornTick);
    if (h > oldest) oldest = h;
    if (h < 24) aging.lt24h += 1;
    else if (h < 48) aging.h24_48 += 1;
    else if (h < 72) aging.h48_72 += 1;
    else aging.gt72h += 1;
    const pct = slaRemaining(nowTick, t.bornTick, t.slaHours).pct;
    if (pct > 0) withinCount += 1;
    else breaches += 1;
    if (pct > 0 && pct < APPROACHING) approaching += 1;
  }
  return {
    role,
    label: ROLE_LABEL[role] ?? role,
    operator: OPERATORS[role] ?? role,
    depth: open.length,
    aging,
    withinSlaPct: open.length ? Math.round((withinCount / open.length) * 100) : null,
    breaches,
    approaching,
    oldestOpenHrs: Math.round(oldest),
  };
}

/** Project the SLA book from the live tickets. Pure, read-only, determinism-neutral. */
export function slaBook(s: SimState): SlaBook {
  const now = s.tick;
  const roles = Object.keys(ROLE_LABEL) as OpsRole[];
  const seats = roles
    .map((role) =>
      seatSla(
        role,
        s.tickets.filter((t) => t.role === role),
        now
      )
    )
    .filter((seat) => seat.depth > 0); // only seats with open work read on the scorecard

  const open = s.tickets.filter(isOpen);
  const closed = s.tickets.filter((t) => t.status === 'Closed' && t.closedTick !== undefined);
  const resolutionHrs = closed.map((t) => hoursSince(t.closedTick!, t.bornTick));
  const firstTouchHrs = s.tickets
    .filter((t) => t.assignedTick !== undefined)
    .map((t) => hoursSince(t.assignedTick!, t.bornTick));
  const attained = closed.filter((t) => withinWindow(t, t.closedTick!)).length;
  const enoughClosed = closed.length >= ATTAINMENT_FLOOR;
  const enoughTouched = firstTouchHrs.length >= ATTAINMENT_FLOOR;

  return {
    seats,
    portfolio: {
      openCount: open.length,
      breachCount: open.filter((t) => slaRemaining(now, t.bornTick, t.slaHours).pct <= 0).length,
      approachingCount: open.filter((t) => {
        const p = slaRemaining(now, t.bornTick, t.slaHours).pct;
        return p > 0 && p < APPROACHING;
      }).length,
      closedCount: closed.length,
      attainmentPct: enoughClosed ? Math.round((attained / closed.length) * 100) : null,
      resolutionMedianHrs: enoughClosed ? Math.round(median(resolutionHrs) ?? 0) : null,
      resolutionP90Hrs: enoughClosed ? Math.round(percentile(resolutionHrs, 0.9) ?? 0) : null,
      firstTouchMedianHrs: enoughTouched ? Math.round(median(firstTouchHrs) ?? 0) : null,
    },
  };
}
