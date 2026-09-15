'use client';
/**
 * GlidePathBoard (Phase B — Gain-Share dashboards). The interactive glide-path screen
 * from the `m2_glide_*` mock, built for real: a lens toggle (payer / provider / state)
 * and a risk-transfer scrub slider drive the phase, the contract lever + gate, both
 * parties' value at that point, and the KPI chips. Client component (local UI state only)
 * over the pure `glidePathModel` — no data fetch, no PHI, figures illustrative.
 */
import { useState } from 'react';
import {
  PHASES,
  MATRIX,
  LENS_LABEL,
  meanwhileFor,
  phaseForScrub,
  type Lens,
  type PhaseId,
} from '@/lib/gainShare/glidePathModel';

const LENSES: Lens[] = ['payer', 'provider', 'state'];

/**
 * Per-lens Carbon accent CLASS strings (payer=blue, provider=green, state=purple). These
 * live here, in a Tailwind-scanned component, on purpose — a class literal in the lib model
 * would not be generated (content globs cover src/components / src/app, not src/lib).
 */
const LENS_ACCENT: Record<Lens, { text: string; bg: string; border: string; solid: string }> = {
  payer: {
    text: 'text-carbon-blue',
    bg: 'bg-carbon-blue-lighter',
    border: 'border-carbon-blue',
    solid: 'bg-carbon-blue',
  },
  provider: {
    text: 'text-carbon-green',
    bg: 'bg-carbon-green-light',
    border: 'border-carbon-green',
    solid: 'bg-carbon-green',
  },
  state: {
    text: 'text-[#6929c4]',
    bg: 'bg-[#f6f2ff]',
    border: 'border-[#8a3ffc]',
    solid: 'bg-[#8a3ffc]',
  },
};

function LensToggle({
  lens,
  setLens,
}: {
  lens: Lens;
  setLens: (l: Lens) => void;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-carbon-gray-50">
        Lens
      </span>
      <div className="inline-flex rounded-md border border-carbon-gray-20 bg-white p-0.5">
        {LENSES.map((l) => {
          const active = l === lens;
          const accent = LENS_ACCENT[l];
          return (
            <button
              key={l}
              type="button"
              onClick={() => setLens(l)}
              aria-pressed={active}
              className={`rounded px-3 py-1.5 text-sm font-semibold transition-colors ${
                active
                  ? `${accent.solid} text-white`
                  : 'text-carbon-gray-70 hover:bg-carbon-gray-10'
              }`}
            >
              {LENS_LABEL[l]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PhasePills({ phase }: { phase: PhaseId }): React.ReactElement {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {PHASES.map((p) => {
        const active = p.id === phase;
        return (
          <div
            key={p.id}
            className={`rounded px-3 py-2 text-center text-xs font-semibold ${
              active ? 'bg-carbon-gray-100 text-white' : 'bg-carbon-gray-10 text-carbon-gray-60'
            }`}
          >
            {p.name}
          </div>
        );
      })}
    </div>
  );
}

function Card({
  children,
  accentBorder,
}: {
  children: React.ReactNode;
  accentBorder?: string;
}): React.ReactElement {
  return (
    <div
      className={`rounded-lg border bg-white p-4 ${accentBorder ? `border-l-4 ${accentBorder}` : 'border-carbon-gray-20'}`}
    >
      {children}
    </div>
  );
}

export function GlidePathBoard(): React.ReactElement {
  const [lens, setLens] = useState<Lens>('payer');
  const [scrub, setScrub] = useState<number>(8);
  const phase = phaseForScrub(scrub);
  const spec = PHASES[phase];
  const cell = MATRIX[lens][phase];
  const accent = LENS_ACCENT[lens];
  const meanwhile = meanwhileFor(lens, phase);

  return (
    <section className="space-y-4 rounded-lg border border-carbon-gray-20 bg-carbon-gray-10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Interactive glide path</h2>
        <LensToggle lens={lens} setLens={setLens} />
      </div>
      <p className="text-sm text-carbon-gray-70">
        Choose whose eyes you’re looking through, then drag the slider from{' '}
        <strong>no risk transfer</strong> to <strong>full risk transfer</strong>. The phase, the
        contract lever, the gate, and both parties’ value update live. The shared evidence record is
        the spine beneath all of it — the payer never surrenders adjudication.
      </p>

      <div className="rounded-lg border border-carbon-gray-20 bg-white p-4">
        <div className="mb-2 flex items-center justify-between text-xs font-semibold text-carbon-gray-60">
          <span>◀ No risk transfer · pay-per-claim</span>
          <span>Full risk transfer · capitation ▶</span>
        </div>
        <PhasePills phase={phase} />
        <label className="sr-only" htmlFor="glide-scrub">
          Risk transfer scrub
        </label>
        <input
          id="glide-scrub"
          type="range"
          min={0}
          max={100}
          value={scrub}
          onChange={(e) => setScrub(Number(e.target.value))}
          className="mt-3 w-full accent-carbon-blue"
        />
        <div className="flex items-center justify-between text-xs font-semibold text-carbon-gray-70">
          <span>Risk transferred to provider: ~{spec.riskTransferredPct}%</span>
          <span>timeframe: {spec.timeframe}</span>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-carbon-gray-50">
            Where you are
          </p>
          <h3 className="mt-1 text-base font-semibold">{spec.name}</h3>
          <p className="mt-2 text-xs text-carbon-gray-80">
            <span className="font-semibold">Contract lever:</span> {spec.contractLever}
          </p>
          <p className="mt-2 text-xs text-carbon-gray-80">
            <span className="font-semibold">Gate to be here:</span> {spec.gate}
          </p>
          <p className="mt-2 text-xs font-semibold text-carbon-red">{spec.recoveryNote}</p>
        </Card>

        <Card accentBorder={accent.border}>
          <p className={`text-[11px] font-semibold uppercase tracking-wide text-carbon-gray-50`}>
            In focus
          </p>
          <p className={`mt-1 text-sm font-semibold ${accent.text}`}>{LENS_LABEL[lens]} value</p>
          <ul className="mt-2 space-y-1 text-xs text-carbon-gray-80">
            {cell.inFocus.map((b, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="text-carbon-gray-40">•</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-carbon-gray-50">
            Meanwhile
          </p>
          <div className="mt-1 space-y-2">
            {meanwhile.map((m) => (
              <div key={m.lens}>
                <p className={`text-sm font-semibold ${LENS_ACCENT[m.lens].text}`}>
                  {LENS_LABEL[m.lens]}
                </p>
                <p className="text-xs text-carbon-gray-80">{m.note}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="rounded-lg border border-carbon-gray-20 bg-white p-4">
        <h3 className="text-sm font-semibold">
          {LENS_LABEL[lens]} KPIs at this point on the ladder
        </h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {cell.kpis.map((k, i) => (
            <div key={i} className="rounded border border-carbon-gray-20 p-3">
              <p className={`text-lg font-semibold ${accent.text}`}>{k.arrow}</p>
              <p className="mt-1 text-xs text-carbon-gray-60">{k.label}</p>
              <p className={`text-xs font-semibold ${accent.text}`}>{k.value}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] italic text-carbon-gray-50">
          Arrows/labels are illustrative directions; live values would bind to the evidence record.
          The KPI set swaps with the lens and shifts with the slider.
        </p>
      </div>

      <div className="rounded border-l-4 border-carbon-blue bg-carbon-blue-lighter p-3 text-xs text-carbon-gray-80">
        <span className="font-semibold">Spine (unchanged across the whole slider):</span> the shared
        evidence record — append-only · provenance-stamped · per-party signed · policy-version bound
        · dual-party PHI-safe projection ·{' '}
        <span className="font-semibold">adjudication written by the plan alone.</span> Phase 0
        secures the inputs (non-repudiation); Phases 1–2 add the jointly-replayable computation over
        derived numbers.
      </div>
    </section>
  );
}
