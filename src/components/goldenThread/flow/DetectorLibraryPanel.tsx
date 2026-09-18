'use client';
/**
 * DetectorLibraryPanel — the program-integrity detector library, extracted whole from the
 * SurveillanceConsole to stand as its own full-width sub-tab, PLUS the one new feature: a PARTY LENS.
 *
 * The library already carries each detector's accountable authority in `Algorithm.tiers` (payer P /
 * provider-counter Pr / neutral arbiter N), but the tier was invisible — so the board read as
 * payer-only. The lens makes the three authorities first-class: a segmented control filters by party
 * (overlaps expected — one detector can serve two authorities), and every chip now carries its
 * party label(s), color-keyed AND text-labelled (WCAG — never color alone). Category stays the
 * secondary grouping structure.
 *
 * CLIENT-SAFE: shared library data + presentational helpers only. No `@/lib/evidence` barrel.
 */
import { useRef, useState } from 'react';
import {
  ALGORITHMS,
  CATEGORIES,
  LANE_LABEL,
  TECHNIQUE_LABEL,
  TIER_LABEL,
  PLAN_HEADLINE_COUNT,
  type Algorithm,
  type Tier,
} from '@/lib/surveillance/library';
import { libraryIdForAlgorithm, isWiredLibraryId } from '@/lib/goldenThread/surveillanceMap';
import type { Detection } from '@/components/goldenThread/flow/LiveDetectionFeed';

// Per-party color key (paired with a text label on every chip — WCAG, not color alone).
const TIER_COLOR: Record<Tier, string> = {
  P: '#24427e', // payer program-integrity
  Pr: '#5b3fa3', // provider counter-surveillance
  N: '#0f766e', // neutral / independent arbiter
};
// The segmented-control label for the neutral bucket names the third-party role explicitly. This is
// the ONE canonical user-facing phrasing of the neutral authority (headline prose matches it); the
// compact chip badge uses TIER_LABEL for space.
const TIER_PILL_LABEL: Record<Tier, string> = {
  P: 'Payer',
  Pr: 'Provider-counter',
  N: 'Neutral / 3rd-party',
};
const TIER_ORDER: readonly Tier[] = ['P', 'Pr', 'N'];

export interface DetectorLibraryPanelProps {
  detections: Detection[];
}

export function DetectorLibraryPanel({
  detections,
}: DetectorLibraryPanelProps): React.ReactElement {
  const [tierFilter, setTierFilter] = useState<Tier | 'all'>('all');

  // Live-hit count per library id — projected from the OPEN governed detections the run has minted.
  const hitCount: Record<string, number> = {};
  for (const d of detections) {
    const id = libraryIdForAlgorithm(d.seed.algorithm);
    hitCount[id] = (hitCount[id] ?? 0) + 1;
  }

  // Party lens applied BEFORE category grouping (category kept as the secondary structure).
  const filtered =
    tierFilter === 'all' ? ALGORITHMS : ALGORITHMS.filter((a) => a.tiers.includes(tierFilter));
  const byCat = Object.keys(CATEGORIES)
    .map(Number)
    .map((cat) => ({ cat, algos: filtered.filter((a) => a.cat === cat) }))
    .filter((g) => g.algos.length > 0);

  const tierCount = (t: Tier): number => ALGORITHMS.filter((a) => a.tiers.includes(t)).length;
  // Scripted (live-narrative) subset — the honest counterweight to the CATALOGUED tier counts, so the
  // 22/15/14 badges can never be misread as "all live-wired."
  const scriptedTierCount = (t: Tier): number =>
    ALGORITHMS.filter((a) => a.tiers.includes(t) && isWiredLibraryId(a.id)).length;
  const scriptedTotal = ALGORITHMS.filter((a) => isWiredLibraryId(a.id)).length;
  const segments: ReadonlyArray<{ key: Tier | 'all'; label: string; count: number }> = [
    { key: 'all', label: 'All', count: ALGORITHMS.length },
    ...TIER_ORDER.map((t) => ({ key: t, label: TIER_PILL_LABEL[t], count: tierCount(t) })),
  ];

  // Roving-tabindex + arrow-key navigation for the party lens (a single-select filter = radiogroup).
  const segRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeSegIdx = Math.max(
    0,
    segments.findIndex((seg) => seg.key === tierFilter)
  );
  const onSegKey = (e: React.KeyboardEvent): void => {
    const last = segments.length - 1;
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown')
      next = activeSegIdx >= last ? 0 : activeSegIdx + 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = activeSegIdx <= 0 ? last : activeSegIdx - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    if (next >= 0) {
      e.preventDefault();
      setTierFilter(segments[next].key);
      segRefs.current[next]?.focus();
    }
  };

  return (
    <div className="ed-card p-3">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <p className="max-w-[46rem] text-[11px] font-semibold text-carbon-gray-90">
          Detector library · {ALGORITHMS.length} catalogued detectors ({scriptedTotal} scripted for
          this walkthrough) across three accountable authorities — payer program-integrity, provider
          counter-surveillance, and neutral / 3rd-party arbiter, all on the same evidence record.
        </p>
        <span className="flex items-center gap-2 text-[9px]">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: '#0f766e' }} />
            scripted narrative
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm border border-carbon-gray-30 bg-carbon-gray-10" />
            catalog reference
          </span>
        </span>
      </div>

      {/* Party lens — a single-select filter, so it is a radiogroup (roving tabindex + arrow keys),
          not a row of toggles. Overlaps are expected: a detector can serve two authorities, so the
          per-party counts sum to more than the catalog total. */}
      <div
        role="radiogroup"
        aria-label="Filter detectors by accountable authority"
        onKeyDown={onSegKey}
        className="mb-1 flex flex-wrap items-center gap-1"
      >
        {segments.map((seg, i) => {
          const on = tierFilter === seg.key;
          const dot = seg.key === 'all' ? undefined : TIER_COLOR[seg.key];
          return (
            <button
              key={seg.key}
              ref={(el) => {
                segRefs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={() => setTierFilter(seg.key)}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-0.5 text-[11px] font-medium transition ${
                on
                  ? 'border-carbon-blue bg-carbon-blue text-white'
                  : 'border-carbon-gray-30 bg-white text-carbon-gray-70 hover:bg-carbon-gray-10'
              }`}
            >
              {dot && (
                <span
                  className="inline-block h-2 w-2 rounded-sm"
                  style={{ background: on ? '#ffffff' : dot }}
                />
              )}
              {seg.label}
              <span
                className={`mono rounded-full px-1 text-[9px] ${
                  on ? 'bg-white/25 text-white' : 'bg-carbon-gray-10 text-carbon-gray-60'
                }`}
              >
                {seg.count}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mb-2 text-[8px] italic text-carbon-gray-40">
        Counts above are CATALOGUED detectors per authority; a detector can be accountable to two,
        so they overlap and sum past {ALGORITHMS.length}. The live-scripted subset is Payer{' '}
        {scriptedTierCount('P')} · Provider-counter {scriptedTierCount('Pr')} · Neutral{' '}
        {scriptedTierCount('N')} (teal chips). Catalog names {ALGORITHMS.length}; plan prose
        headlines {PLAN_HEADLINE_COUNT} — gap surfaced, not reconciled.
      </p>

      <div className="space-y-2">
        {byCat.map(({ cat, algos }) => (
          <div key={cat}>
            <p className="text-[9px] font-semibold uppercase tracking-wide text-carbon-gray-50">
              {cat}. {CATEGORIES[cat]}
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {algos.map((a) => (
                <DetectorChip
                  key={a.id}
                  a={a}
                  wired={isWiredLibraryId(a.id)}
                  hits={hitCount[a.id] ?? 0}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[8px] italic text-carbon-gray-40">
        Techniques: R = rules/edits (prepay) · S = statistical outlier (batch) · G = graph analytics
        (batch) · ML = scored (scheduled). Max rung is the ceiling the interlock permits; adverse
        lanes stay human-gated.
      </p>
    </div>
  );
}

function DetectorChip({
  a,
  wired,
  hits,
}: {
  a: Algorithm;
  wired: boolean;
  hits: number;
}): React.ReactElement {
  return (
    <span
      className="inline-flex items-center gap-1 rounded border px-1 py-0.5 text-[9px]"
      style={{
        borderColor: wired ? '#0f766e' : '#e0e0e0',
        background: wired ? '#e6f4f1' : '#fafafa',
        opacity: wired ? 1 : 0.85,
      }}
      title={`${a.id} — ${a.desc}\nauthority: ${a.tiers.map((t) => TIER_LABEL[t]).join(' + ')}\nmax ${a.maxRung} · ${LANE_LABEL[a.lane]} · ${a.techniques.map((t) => TECHNIQUE_LABEL[t]).join(', ')}${wired ? ' · scripted narrative (illustrative)' : ' · catalog reference (no live analysis)'}`}
    >
      <span className="mono font-semibold" style={{ color: wired ? '#0f766e' : '#8d8d8d' }}>
        {a.id}
      </span>
      {/* Party lens: color-keyed AND text-labelled tier chip(s); dual-tier detectors show both. */}
      {a.tiers.map((t) => (
        <span
          key={t}
          className="rounded px-0.5 font-semibold text-white"
          style={{ background: TIER_COLOR[t], fontSize: 8 }}
        >
          {TIER_LABEL[t]}
        </span>
      ))}
      <span
        className="mono rounded px-0.5 text-white"
        style={{ background: wired ? '#24427e' : '#c4c4c4', fontSize: 8 }}
      >
        {a.maxRung}
      </span>
      {wired ? (
        hits > 0 && (
          <span className="mono rounded bg-[#0f766e] px-0.5 text-white" style={{ fontSize: 8 }}>
            {hits}
          </span>
        )
      ) : (
        <span className="mono text-carbon-gray-40" style={{ fontSize: 8 }}>
          —
        </span>
      )}
    </span>
  );
}
