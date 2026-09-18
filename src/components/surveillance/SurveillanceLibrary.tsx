'use client';
/**
 * SurveillanceLibrary (Phase D). The browsable program-integrity / FWA algorithm catalog:
 * filter by tier (payer / provider-counter / neutral), category, technique, and action lane,
 * or search; each card shows the Twin-Ladder governance (max rung · lane), the technique, the
 * Da Vinci / CMS feed-ins, the rollout phase, and the demo-shortlist rank. Client component,
 * pure over the `library` data model — no fetch, no PHI.
 */
import { useMemo, useState } from 'react';
import {
  ALGORITHMS,
  CATEGORIES,
  TIER_LABEL,
  LANE_LABEL,
  TECHNIQUE_LABEL,
  type Algorithm,
  type Tier,
  type Technique,
  type Lane,
} from '@/lib/surveillance/library';

const TIER_ACCENT: Record<Tier, string> = {
  P: 'bg-carbon-blue text-white',
  Pr: 'bg-carbon-green text-white',
  N: 'bg-[#8a3ffc] text-white',
};

const LANE_ACCENT: Record<Lane, string> = {
  adverse: 'bg-carbon-red-light text-carbon-red border-[#ffb3b8]',
  'mutual-consent': 'bg-carbon-green-light text-carbon-green border-carbon-green',
  'self-directed': 'bg-carbon-blue-lighter text-carbon-blue border-carbon-blue',
  'neutral-attestation': 'bg-[#f6f2ff] text-[#6929c4] border-[#8a3ffc]',
};

type TierFilter = Tier | 'all';
type LaneFilter = Lane | 'all';

function Chip({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${className}`}>
      {children}
    </span>
  );
}

function AlgoCard({ a }: { a: Algorithm }): React.ReactElement {
  return (
    <div className="rounded-lg border border-carbon-gray-20 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <h3 className="font-mono text-sm font-semibold">{a.id}</h3>
          {a.demoRank ? (
            <Chip className="bg-carbon-yellow-light text-[#b45309]">demo #{a.demoRank}</Chip>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {a.tiers.map((t) => (
            <Chip key={t} className={TIER_ACCENT[t]}>
              {t}
            </Chip>
          ))}
        </div>
      </div>
      <p className="mt-0.5 text-[11px] text-carbon-gray-50">
        Cat {a.cat} · {CATEGORIES[a.cat]}
      </p>
      <p className="mt-1.5 text-xs text-carbon-gray-80">{a.desc}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${LANE_ACCENT[a.lane]}`}
        >
          {LANE_LABEL[a.lane]}
        </span>
        <Chip className="border border-carbon-gray-20 text-carbon-gray-70">max {a.maxRung}</Chip>
        <Chip className="border border-carbon-gray-20 text-carbon-gray-70">{a.rungNote}</Chip>
        {a.techniques.map((t) => (
          <Chip key={t} className="bg-carbon-gray-10 text-carbon-gray-70">
            {TECHNIQUE_LABEL[t]}
          </Chip>
        ))}
        {a.phase > 0 ? (
          <Chip className="border border-carbon-gray-20 text-carbon-gray-50">phase {a.phase}</Chip>
        ) : null}
      </div>
      {a.feeds.length ? (
        <p className="mt-1.5 text-[10px] text-carbon-gray-50">
          Feeds: <span className="text-carbon-gray-70">{a.feeds.join(' · ')}</span>
        </p>
      ) : null}
    </div>
  );
}

export function SurveillanceLibrary(): React.ReactElement {
  const [tier, setTier] = useState<TierFilter>('all');
  const [cat, setCat] = useState<number | 'all'>('all');
  const [technique, setTechnique] = useState<Technique | 'all'>('all');
  const [lane, setLane] = useState<LaneFilter>('all');
  const [q, setQ] = useState('');
  const [demoOnly, setDemoOnly] = useState(false);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return ALGORITHMS.filter((a) => {
      if (tier !== 'all' && !a.tiers.includes(tier)) return false;
      if (cat !== 'all' && a.cat !== cat) return false;
      if (technique !== 'all' && !a.techniques.includes(technique)) return false;
      if (lane !== 'all' && a.lane !== lane) return false;
      if (demoOnly && a.demoRank === undefined) return false;
      if (query && !(a.id.toLowerCase().includes(query) || a.desc.toLowerCase().includes(query)))
        return false;
      return true;
    });
  }, [tier, cat, technique, lane, q, demoOnly]);

  const selectCls = 'rounded border border-carbon-gray-20 bg-white px-2 py-1 text-sm';

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-carbon-gray-20 bg-carbon-gray-10 p-3">
        <label className="flex flex-col text-xs font-semibold text-carbon-gray-60">
          Tier
          <select
            className={selectCls}
            value={tier}
            onChange={(e) => setTier(e.target.value as TierFilter)}
          >
            <option value="all">All tiers</option>
            {(['P', 'Pr', 'N'] as Tier[]).map((t) => (
              <option key={t} value={t}>
                {t} · {TIER_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs font-semibold text-carbon-gray-60">
          Category
          <select
            className={selectCls}
            value={cat}
            onChange={(e) => setCat(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          >
            <option value="all">All categories</option>
            {Object.entries(CATEGORIES).map(([n, name]) => (
              <option key={n} value={n}>
                {n}. {name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs font-semibold text-carbon-gray-60">
          Technique
          <select
            className={selectCls}
            value={technique}
            onChange={(e) => setTechnique(e.target.value as Technique | 'all')}
          >
            <option value="all">All techniques</option>
            {(['R', 'S', 'G', 'ML'] as Technique[]).map((t) => (
              <option key={t} value={t}>
                {TECHNIQUE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs font-semibold text-carbon-gray-60">
          Action lane
          <select
            className={selectCls}
            value={lane}
            onChange={(e) => setLane(e.target.value as LaneFilter)}
          >
            <option value="all">All lanes</option>
            {(['adverse', 'mutual-consent', 'self-directed', 'neutral-attestation'] as Lane[]).map(
              (l) => (
                <option key={l} value={l}>
                  {LANE_LABEL[l]}
                </option>
              )
            )}
          </select>
        </label>
        <label className="flex flex-1 flex-col text-xs font-semibold text-carbon-gray-60">
          Search
          <input
            className={selectCls}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="id or description…"
          />
        </label>
        <label className="flex items-center gap-1.5 pb-1 text-xs font-semibold text-carbon-gray-70">
          <input
            type="checkbox"
            checked={demoOnly}
            onChange={(e) => setDemoOnly(e.target.checked)}
          />
          Demo shortlist
        </label>
      </div>

      <p className="text-xs text-carbon-gray-60">
        Showing <span className="font-semibold">{filtered.length}</span> of {ALGORITHMS.length}{' '}
        algorithms.
      </p>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((a) => (
          <AlgoCard key={a.id} a={a} />
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="rounded border border-dashed border-carbon-gray-20 p-6 text-center text-sm text-carbon-gray-50">
          No algorithms match these filters.
        </p>
      ) : null}
    </div>
  );
}
