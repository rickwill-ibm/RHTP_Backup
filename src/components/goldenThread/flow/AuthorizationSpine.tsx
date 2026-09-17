'use client';
/**
 * AuthorizationSpine — the HERO of the v2 board. A horizontal numbered stepper of the 11 PATH
 * authorization stages, in seq order, with PERSISTENT static connectors (EDI/action labels) so the
 * whole thread reads even when the animation is PAUSED. Custody hand-off separators mark where the
 * provider releases the clock to the payer and where control returns; labeled detours (gold-card
 * waiver, pend/RFI loop, deny/deemed-adverse) hang off the spine without crossing arcs. A live
 * "you are here" marker follows the spotlight thread.
 *
 * Fully keyboard-navigable (WAI-ARIA tabs): roving tabindex, Arrow/Home/End move focus AND pin,
 * exactly one node is aria-current="step". Mirrors the BoardTabs keyboard idiom.
 *
 * PRESENTATION-ONLY. CLIENT-SAFE: spine + engine types + React only. No `@/lib/evidence`.
 */
import { useRef } from 'react';
import {
  PATH,
  PAYER_SUBSTEPS,
  spotlight,
  TXN_TYPE_META,
  type SimState,
  type TxnType,
} from '@/lib/goldenThread/flowSim';
import { LANE_LABEL } from '@/lib/goldenThread/e2eFlow';
import { LANE_ACCENT } from '@/components/goldenThread/flow/FlowCanvasTokens';

/** Shared ARIA ids so the StageFocusPanel can be the tabpanel this stepper's tabs control. */
export const SPINE_PANEL_ID = 'authorization-spine-panel';
export const spineTabId = (idx: number): string => `authorization-spine-tab-${idx}`;

/** Short, text (not color-alone) status for the spotlight node — the party reads this, not the hue. */
const spotStatusText = (spot: ReturnType<typeof spotlight>): string => {
  if (!spot) return '';
  if (spot.goldCarded) return 'WAIVED';
  if (spot.phase === 'denied') return 'DENY';
  if (spot.mustHuman || spot.adverse) return 'HUMAN';
  if (spot.gates[spot.idx] === 'pend') return 'PEND';
  return 'CLEAR';
};

/** EDI / action label on the connector AFTER node i (i = 0..9). */
const CONNECTORS = [
  '270/271→',
  'CRD→',
  'waiver?',
  '278→',
  'UM→',
  '837→',
  '835→',
  'Δ→',
  'dispute→',
  'monitor',
];
/** Custody hand-offs: after PAS (idx 4) the payer owns the clock; after Remit (idx 7) control returns. */
const CUSTODY: Record<number, string> = {
  4: 'custody hand-off · provider releases → payer owns the clock',
  7: 'custody hand-off · control returns to provider',
};

export function AuthorizationSpine({
  sim,
  focused,
  onFocus,
}: {
  sim: SimState;
  focused: number;
  onFocus: (idx: number) => void;
}): React.ReactElement {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const last = PATH.length - 1;
  const idx = Math.max(0, Math.min(last, focused));
  const spot = spotlight(sim);
  const spotIdx = spot?.idx ?? -1;
  const payerOpsIdx = PATH.findIndex((p) => p.stage.key === 'payer-ops');

  const move = (next: number): void => {
    onFocus(next);
    refs.current[next]?.focus();
  };
  const onKey = (e: React.KeyboardEvent): void => {
    let next = -1;
    if (e.key === 'ArrowRight') next = idx >= last ? 0 : idx + 1;
    else if (e.key === 'ArrowLeft') next = idx <= 0 ? last : idx - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    if (next >= 0) {
      e.preventDefault();
      move(next);
    }
  };

  const spotColor = spot
    ? spot.goldCarded
      ? '#d4a017'
      : spot.phase === 'denied'
        ? '#da1e28'
        : spot.mustHuman || spot.adverse
          ? '#b45309'
          : spot.gates[spot.idx] === 'pend'
            ? '#b45309'
            : '#24a148'
    : '#8d8d8d';
  const spotLabel = spot
    ? `${spot.id} · ${TXN_TYPE_META[spot.type as TxnType].label}`
    : 'none live';
  const spotStatus = spotStatusText(spot);

  return (
    <section className="ed-card p-3" aria-label="Authorization spine">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-carbon-gray-60">
          Authorization spine — the governed thread, end to end
        </p>
        <p className="text-[11px]" style={{ color: spotColor }}>
          <span aria-hidden>●</span>{' '}
          {spotIdx >= 0 ? (
            <span>
              {spotLabel} is now at step {spotIdx + 1} — {PATH[spotIdx].stage.label}
              {spotStatus && <span className="mono font-bold"> · {spotStatus}</span>}
            </span>
          ) : (
            <span>no thread live — press Play</span>
          )}
        </p>
      </div>

      <div className="overflow-x-auto pb-1">
        <div
          role="tablist"
          aria-label="Authorization stages"
          onKeyDown={onKey}
          className="flex items-stretch"
        >
          {PATH.map((p, i) => {
            const on = i === idx;
            const gated = p.stage.verdict.requiresHuman;
            const isSpot = i === spotIdx;
            return (
              <div key={p.stage.key} role="presentation" className="flex items-stretch">
                <button
                  ref={(el) => {
                    refs.current[i] = el;
                  }}
                  type="button"
                  role="tab"
                  id={spineTabId(i)}
                  aria-controls={SPINE_PANEL_ID}
                  aria-selected={on}
                  aria-current={on ? 'step' : undefined}
                  tabIndex={on ? 0 : -1}
                  onClick={() => move(i)}
                  className={`relative flex w-[92px] shrink-0 flex-col rounded-md border p-1.5 text-left transition ${
                    on
                      ? 'border-carbon-blue bg-carbon-blue-lighter shadow-carbon'
                      : 'border-carbon-gray-20 bg-white hover:border-carbon-blue-hover'
                  }`}
                  style={{ borderLeft: `4px solid ${LANE_ACCENT[p.stage.lane]}` }}
                  title={`${p.stage.actor}`}
                >
                  <span className="flex items-center gap-1">
                    <span
                      className="mono flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white"
                      style={{ background: isSpot ? spotColor : '#24427e' }}
                    >
                      {i + 1}
                    </span>
                    {isSpot && (
                      <span
                        className="rounded px-1 text-[7px] font-bold uppercase text-white"
                        style={{ background: spotColor }}
                      >
                        here · {spotStatus}
                      </span>
                    )}
                  </span>
                  <span className="mt-1 text-[9px] font-semibold leading-tight text-carbon-gray-90">
                    {p.stage.label}
                  </span>
                  {/* Party is named in TEXT, not conveyed by the left-border color alone (WCAG 1.4.1). */}
                  <span className="text-[7px] font-medium uppercase tracking-wide text-carbon-gray-50">
                    {LANE_LABEL[p.stage.lane]}
                  </span>
                  <span
                    className="mt-0.5 rounded px-1 py-0.5 text-[7px] font-bold uppercase"
                    style={{
                      background: gated ? '#fdf6dd' : '#defbe6',
                      color: gated ? '#b45309' : '#1f7a3d',
                    }}
                  >
                    {gated ? '👤 human-gated' : '✓ agent may act'}
                  </span>
                </button>
                {i < last && (
                  <div
                    role="presentation"
                    className="flex w-[52px] shrink-0 flex-col items-center justify-center px-0.5"
                  >
                    <span className="mono text-[8px] font-semibold text-carbon-gray-50">
                      {CONNECTORS[i]}
                    </span>
                    <span className="my-0.5 h-px w-full bg-carbon-gray-30" />
                    {CUSTODY[i] && (
                      <span
                        className="rounded px-0.5 text-center text-[6px] font-bold leading-tight text-white"
                        style={{ background: '#24427e' }}
                      >
                        {CUSTODY[i]}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Labeled detours off the spine (not crossing arcs) */}
      <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
        <Detour
          accent="#d4a017"
          tag="Detour · node ③"
          text="Trusted provider → PA WAIVED, skips ⑥ UM · earned A3 · non-adverse"
        />
        <Detour
          accent="#0e7490"
          tag="Loop · node ⑥"
          text="277-RFAI → records requested → returns · CMS-0057-F clock running"
        />
        <Detour
          accent="#da1e28"
          tag="Terminal · node ⑥"
          text="Deny = MD only · deemed-adverse 438.210(d) → human NABD"
        />
      </div>

      {/* Payer-ops UM sub-process, inline under the focused node */}
      {idx === payerOpsIdx && (
        <div className="mt-2 rounded-md border border-carbon-blue bg-[#f7f9fc] p-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-60">
            Payer-ops UM sub-process — only the MD denies
          </p>
          <div className="flex flex-wrap items-center gap-1">
            {PAYER_SUBSTEPS.map((step, i) => (
              <span key={step.key} className="flex items-center gap-1">
                <span
                  data-testid="um-substep"
                  className="rounded border px-1.5 py-0.5 text-[9px] font-semibold"
                  style={{
                    borderColor: step.human ? '#b45309' : '#0e7490',
                    background: step.human ? '#fdf6dd' : '#e6f2f5',
                    color: step.human ? '#b45309' : '#0e7490',
                  }}
                >
                  {step.label}
                  {step.human ? ' 👤' : ''}
                </span>
                {i < PAYER_SUBSTEPS.length - 1 && (
                  <span className="text-[9px] text-carbon-gray-40">→</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Detour({
  accent,
  tag,
  text,
}: {
  accent: string;
  tag: string;
  text: string;
}): React.ReactElement {
  return (
    <div className="rounded-md border p-1.5" style={{ borderLeft: `3px solid ${accent}` }}>
      <p className="text-[8px] font-bold uppercase tracking-wide" style={{ color: accent }}>
        {tag}
      </p>
      <p className="text-[9px] leading-snug text-carbon-gray-80">{text}</p>
    </div>
  );
}
