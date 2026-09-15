'use client';

/**
 * RecoveryCountdown (Phase A — Golden Thread guided surface). A live ticking countdown
 * to the recovery's timely-filing deadline. Turns red inside the last 14 days and shows
 * "window closed" once the deadline has passed — so a reviewer sees the appeal clock.
 *
 * Client component: it reads the wall clock every second. It imports NOTHING from the
 * evidence barrel (no node:crypto) — just the deadline string.
 *
 * PHI DISCIPLINE: a date + a duration only.
 */
import { useEffect, useState } from 'react';

const MS_PER_DAY = 86_400_000;
const URGENT_MS = 14 * MS_PER_DAY;
const pad2 = (n: number): string => String(n).padStart(2, '0');

export function RecoveryCountdown({
  filingDeadline,
}: {
  filingDeadline: string;
}): React.ReactElement {
  // Null until mounted so SSR and the first client render agree (no hydration mismatch);
  // the wall clock is only read in the effect.
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    const tick = (): void => setRemainingMs(Date.parse(filingDeadline) - Date.now());
    tick();
    const handle = setInterval(tick, 1000);
    return () => clearInterval(handle);
  }, [filingDeadline]);

  if (remainingMs === null) {
    return (
      <div className="rounded border border-carbon-gray-20 bg-carbon-gray-10 p-2 text-xs text-carbon-gray-50">
        Appeal window closes <span className="font-medium">{filingDeadline.slice(0, 10)}</span> —
        computing time remaining…
      </div>
    );
  }

  if (remainingMs <= 0) {
    return (
      <div
        className="rounded border border-[#ffb3b8] bg-carbon-red-light p-2 text-xs font-semibold text-carbon-red"
        role="status"
      >
        Appeal window closed ({filingDeadline.slice(0, 10)}) — an approval now returns a
        timely-filing conflict.
      </div>
    );
  }

  const urgent = remainingMs <= URGENT_MS;
  const totalSec = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSec / 86_400);
  const hh = Math.floor((totalSec % 86_400) / 3_600);
  const mm = Math.floor((totalSec % 3_600) / 60);
  const ss = totalSec % 60;

  return (
    <div
      className={`rounded border p-2 text-xs ${
        urgent
          ? 'border-[#ffb3b8] bg-carbon-red-light text-carbon-red'
          : 'border-carbon-gray-20 bg-carbon-gray-10 text-carbon-gray-70'
      }`}
      role="status"
      aria-live="off"
    >
      Appeal window closes <span className="font-medium">{filingDeadline.slice(0, 10)}</span> ·{' '}
      <span className={`font-mono font-semibold ${urgent ? '' : 'text-carbon-gray-100'}`}>
        {days}d {pad2(hh)}:{pad2(mm)}:{pad2(ss)}
      </span>{' '}
      remaining{urgent ? ' — filing window closing' : ''}.
    </div>
  );
}
