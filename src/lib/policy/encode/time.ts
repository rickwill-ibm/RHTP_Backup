/**
 * E5 — time-window / duration encoder (RHTP Policy Engine, encoding layer).
 *
 * Emits the multi-axis `TimeWindow`: cumulative AND longest-consecutive when both appear, a session
 * COUNT independent of calendar duration, and an explicit lookback with `relativeTo` + endpoint
 * inclusivity. Dropping the cumulative or the consecutive axis is a defect (spec §4 E5, F7/F11).
 *
 * Design authority: docs/policy-encoder-spec.md §4 (E5).
 */
import type { TimeWindow } from './ir';
import { normalizeNumerals } from './dimensions';

function unitOf(raw: string): string {
  return raw.toLowerCase().replace(/s$/, '') + 's';
}

/** Parse a duration/window clause into a TimeWindow. Returns null if no temporal structure found. */
export function parseTimeWindow(raw: string): TimeWindow | null {
  const text = normalizeNumerals(raw);
  const tw: TimeWindow = {};

  // Cumulative total: "cumulative total of 6 months (180 days)" or "over 6 months".
  const cum = /(?:cumulative(?:\s+total)?\s+of|over)\s+(\d+)\s*(months?|weeks?|days?|years?)/i.exec(
    text
  );
  if (cum) tw.cumulative = { min: parseInt(cum[1], 10), unit: unitOf(cum[2]) };

  // Consecutive run: "3 consecutive months", "3-6 / 3–6 / 3 to 6 consecutive months". The FIRST
  // number is the minimum; tolerate hyphen, en/em-dash, or "to" for the upper bound.
  const cons = /(\d+)(?:\s*(?:-|–|—|to)\s*\d+)?\s*consecutive\s*(months?|weeks?|days?)/i.exec(text);
  if (cons) tw.longestConsecutive = { min: parseInt(cons[1], 10), unit: unitOf(cons[2]) };

  // Count independent of calendar duration: "≥12 sessions / visits / treatments".
  const sess = /(?:≥|>=|at least\s*)?(\d+)\s*(sessions?|visits?|treatments?)/i.exec(text);
  if (sess) {
    const kind = sess[2].toLowerCase().replace(/s$/, '');
    const unit = kind === 'visit' ? 'visits' : kind === 'treatment' ? 'treatments' : 'sessions';
    tw.count = { min: parseInt(sess[1], 10), unit };
  }

  // Lookback: "within 12 months prior to surgery", "within 1 year prior", "within 2 years prior".
  const look =
    /within\s+(?:the\s+)?(\d+)\s*(year|month|week|day)s?\s*(?:prior|before|preceding)?\s*(?:to\s*(surgery|the order|first visit))?/i.exec(
      text
    );
  if (look) {
    const n = parseInt(look[1], 10);
    const unit = look[2].toLowerCase() + 's';
    const rel: TimeWindow['lookback'] = {
      within: n,
      unit,
      relativeTo: /order/i.test(look[3] ?? '')
        ? 'order'
        : /first visit/i.test(look[3] ?? '')
          ? 'firstVisit'
          : 'surgery',
      inclusive: true, // "within N ... prior" is inclusive of the window
    };
    tw.lookback = rel;
  }

  const empty = !tw.cumulative && !tw.longestConsecutive && !tw.count && !tw.lookback;
  return empty ? null : tw;
}
