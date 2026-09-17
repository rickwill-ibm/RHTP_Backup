'use client';
/**
 * StageFocusPanel — the governance read-out for the spine's focused stage, modelled on the
 * ProcessFlowBoard StepDetail pattern. Four columns, all projected from PATH[focused].stage:
 * WHO ACTS · WHAT'S WRITTEN (the sealed ledger entry) · AUTHORITY (Twin-Ladder cap + the persistent
 * adverse floor) · HAND-OFF (the notification + the next node it lights up). Vocabulary is kept
 * payer-credible exactly as e2eFlow spells it (278/835/CARC, 42 CFR 455.23, 438.210(d), §1557).
 *
 * PRESENTATION-ONLY. CLIENT-SAFE: spine + engine types + opsShared + React only. No `@/lib/evidence`.
 */
import { LANE_LABEL } from '@/lib/goldenThread/e2eFlow';
import {
  PATH,
  displayAuthority,
  execEarnedCeiling,
  type SimState,
} from '@/lib/goldenThread/flowSim';
import { TwinLadderCodes } from '@/components/goldenThread/flow/opsShared';
import { spineTabId, SPINE_PANEL_ID } from '@/components/goldenThread/flow/AuthorizationSpine';

const LANE_ACCENT: Record<string, string> = {
  emr: '#0f766e',
  'provider-agent': '#0e7490',
  payer: '#24427e',
  'payer-agent': '#5b3fa3',
  surveillance: '#b45309',
};

function Column({
  label,
  accent,
  children,
}: {
  label: string;
  accent: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div
      className="rounded-md border border-carbon-gray-20 p-2"
      style={{ borderTop: `3px solid ${accent}` }}
    >
      <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-carbon-gray-50">
        {label}
      </p>
      <div className="space-y-1 text-[11px] text-carbon-gray-90">{children}</div>
    </div>
  );
}

export function StageFocusPanel({
  sim,
  focused,
}: {
  sim: SimState;
  focused: number;
}): React.ReactElement {
  const clamped = Math.max(0, Math.min(PATH.length - 1, focused));
  const node = PATH[clamped];
  const stage = node.stage;
  const v = stage.verdict;
  // Route the DISPLAYED authority through the same governed clamp every other view uses — a stage's
  // static capability (permittedRung) is shown capped to what the fleet has EARNED (execEarnedCeiling),
  // so this panel can never assert A3-autonomous before A1 is earned.
  const da = displayAuthority(v.permittedRung, v.requiresHuman, sim);
  const accent = LANE_ACCENT[stage.lane] ?? '#24427e';
  const isPayerOps = stage.key === 'payer-ops';
  const next = PATH[node.idx + 1];

  return (
    <section
      className="ed-card p-3"
      role="tabpanel"
      id={SPINE_PANEL_ID}
      aria-labelledby={spineTabId(clamped)}
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">
          Step {stage.seq} · {stage.label}
        </h3>
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
          style={{
            background: v.requiresHuman ? '#fdf6dd' : '#defbe6',
            color: v.requiresHuman ? '#b45309' : '#1f7a3d',
          }}
        >
          {v.requiresHuman ? 'Human-gated' : 'Agent may act'}
        </span>
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <Column label="Who acts" accent={accent}>
          <p className="font-semibold">{LANE_LABEL[stage.lane]}</p>
          <p className="text-carbon-gray-70">{stage.actor}</p>
          {isPayerOps && (
            <p className="mt-1 rounded bg-[#f7f9fc] px-1 py-0.5 text-[10px] text-carbon-gray-70">
              UM sub-process: intake → eligibility → nurse 👤 → RFI 👤 → MD 👤 → determination →
              notify. Only the Medical Director denies.
            </p>
          )}
        </Column>

        <Column label="What this stage writes" accent="#0b1a2b">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-50">
            Audit entry sealed here
          </p>
          <p className="mono text-[10px] leading-snug text-carbon-gray-80">{stage.auditEntry}</p>
          <p className="mt-1">
            <span className="mono rounded bg-carbon-gray-10 px-1 text-[10px] font-bold text-carbon-gray-80">
              {v.evidenceTier}→{da.shown}
            </span>{' '}
            <span className="text-[10px] text-carbon-gray-50">
              evidence tier → authority{da.capped ? ' (capped to earned)' : ''}
            </span>
          </p>
        </Column>

        <Column label="Authority" accent="#24427e">
          <TwinLadderCodes
            tier={v.evidenceTier}
            rung={da.shown}
            human={v.requiresHuman}
            capped={da.capped}
            now={da.ceiling}
            size="md"
          />
          <p className="text-[10px] text-carbon-gray-50">
            Fleet earned ceiling now:{' '}
            <span className="mono font-bold text-carbon-gray-80">A{execEarnedCeiling(sim)}</span>
            {da.capped && (
              <span className="text-carbon-gray-40">
                {' '}
                — stage capability {v.permittedRung} capped to earned
              </span>
            )}
          </p>
          <p className="text-[10px] text-carbon-gray-60">{v.reason}</p>
          <div
            className="mt-1 rounded px-1.5 py-1 text-[9px] font-bold"
            style={{ background: '#fff1f1', color: '#b42318', border: '1px dashed #da1e28' }}
          >
            adverse · high-dollar · novel → always a human
          </div>
        </Column>

        <Column label="Hand-off" accent={accent}>
          {stage.notification ? (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-50">
                Notifies · {stage.notification.party}
              </p>
              <p className="text-carbon-gray-80">{stage.notification.text}</p>
            </>
          ) : (
            <p className="text-[10px] italic text-carbon-gray-50">
              No party notification at this stage.
            </p>
          )}
          <p className="mt-1 text-[10px] text-carbon-gray-60">
            {next ? (
              <>
                Lights up next: <span className="font-semibold">{next.stage.label}</span> (step{' '}
                {next.stage.seq})
              </>
            ) : (
              <>Terminal stage — continuous surveillance closes the loop.</>
            )}
          </p>
        </Column>
      </div>
    </section>
  );
}
