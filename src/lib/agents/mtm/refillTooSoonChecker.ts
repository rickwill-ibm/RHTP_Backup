/**
 * Refill-Too-Soon Checker.
 *
 * CMS Part D MTM rule: a refill is "too soon" when the patient has consumed
 * less than 80% of their last fill's days supply.
 *
 * Example: 30-day supply filled on Jan 1 → earliest next fill = Jan 25
 *          (30 × 0.80 = 24 days → Jan 1 + 24 = Jan 25).
 *
 * When lastFillDate or lastFillDaysSupply is absent the check is silently
 * skipped (returns empty array) — no false positives.
 */
import type { CurrentMedication, DrugLookupResult, MtmFinding } from './types';

/** Parse an ISO date string to a UTC midnight Date. Returns null on invalid input. */
function parseDate(iso: string | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/** Calculate days elapsed between two dates. */
function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * Check whether any existing medication on the list is being refilled too soon
 * (same RxCUI as the new drug, and <80% of last fill days supply elapsed).
 *
 * @param newDrug          - Proposed new drug
 * @param currentMedications - Patient's active med list
 * @param nowIso           - Current date (ISO string) — injectable for tests
 * @returns Array of MtmFinding (may be empty)
 */
export function checkRefillTooSoon(
  newDrug: DrugLookupResult,
  currentMedications: CurrentMedication[],
  nowIso?: string
): MtmFinding[] {
  const now = parseDate(nowIso) ?? new Date();

  return currentMedications.flatMap((med) => {
    if (med.rxcui !== newDrug.rxcui) return [];

    const lastFill = parseDate(med.lastFillDate);
    const daysSupply = med.lastFillDaysSupply;

    if (!lastFill || !daysSupply || daysSupply <= 0) return [];

    const elapsed = daysBetween(lastFill, now);
    const threshold = Math.floor(daysSupply * 0.8);

    if (elapsed >= threshold) return [];

    const daysRemaining = threshold - elapsed;
    return [
      {
        type: 'refill-too-soon',
        severity: 'minor',
        headline: `Refill too soon: ${newDrug.name} (${daysRemaining} day(s) early)`,
        detail:
          `Last fill of ${med.name} was ${elapsed} day(s) ago ` +
          `(${daysSupply}-day supply). CMS Part D MTM requires ≥80% consumption ` +
          `(${threshold} days) before a refill is covered. ` +
          `Earliest covered refill: ${new Date(lastFill.getTime() + threshold * 86_400_000)
            .toISOString()
            .slice(0, 10)}.`,
        requiresAcknowledgement: true,
        hardBlock: false,
      } satisfies MtmFinding,
    ];
  });
}
