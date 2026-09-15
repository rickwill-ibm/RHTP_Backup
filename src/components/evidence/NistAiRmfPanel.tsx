/**
 * NistAiRmfPanel (Phase E). Renders the NIST AI-RMF projection of a real order→cash thread:
 * the four core functions (GOVERN/MAP/MEASURE/MANAGE) with their controls + cited evidence,
 * the seven trustworthiness characteristics, and the per-decision explainability records.
 * Server component, presentational over the pure `AiRmfProfile` (buildAiRmfProfile).
 */
import type {
  AiRmfProfile,
  RmfFunctionBlock,
  ControlStatus,
  ExplainabilityRecord,
} from '@/lib/evidence/nistAiRmf';

const STATUS_CLS: Record<ControlStatus, string> = {
  satisfied: 'bg-carbon-green-light text-carbon-green border-carbon-green',
  partial: 'bg-carbon-yellow-light text-[#b45309] border-carbon-yellow',
  'n/a': 'bg-carbon-gray-10 text-carbon-gray-60 border-carbon-gray-20',
};

const FN_ACCENT: Record<string, string> = {
  GOVERN: '#24427e',
  MAP: '#0f766e',
  MEASURE: '#8a5a12',
  MANAGE: '#be123c',
};

function StatusPill({ status }: { status: ControlStatus }): React.ReactElement {
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${STATUS_CLS[status]}`}
    >
      {status}
    </span>
  );
}

function FunctionBlock({ block }: { block: RmfFunctionBlock }): React.ReactElement {
  const accent = FN_ACCENT[block.fn] ?? '#24427e';
  return (
    <div className="ed-card p-4" style={{ borderTop: `3px solid ${accent}` }}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-base" style={{ color: accent }}>
          {block.fn}
        </h3>
        <span className="text-[11px] text-carbon-gray-50">{block.controls.length} controls</span>
      </div>
      <p className="mt-0.5 text-xs text-carbon-gray-60">{block.blurb}</p>
      <div className="mt-3 space-y-2">
        {block.controls.map((c) => (
          <div key={c.id} className="rounded border border-carbon-gray-20 p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="mono text-[11px] font-semibold text-carbon-gray-70">{c.id}</span>
              <StatusPill status={c.status} />
            </div>
            <p className="mt-0.5 text-xs font-medium text-carbon-gray-100">{c.title}</p>
            <p className="mt-0.5 text-[11px] text-carbon-gray-60">{c.evidence}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExplainRow({ r }: { r: ExplainabilityRecord }): React.ReactElement {
  return (
    <tr className="border-b border-carbon-gray-20 last:border-0">
      <td className="py-2 pr-3 align-top text-xs font-medium text-carbon-gray-100">{r.stage}</td>
      <td className="py-2 pr-3 align-top">
        <span className="mono text-[11px] text-carbon-gray-70">{r.firedRule}</span>
        <span className="block text-[10px] text-carbon-gray-50">v{r.ruleVersion}</span>
      </td>
      <td className="py-2 pr-3 align-top">
        <span className="mono text-[11px] font-semibold">
          {r.evidenceTier} → {r.ceilingRung}
        </span>
      </td>
      <td className="py-2 pr-3 align-top text-[11px] text-carbon-gray-70">
        {r.requiresHuman ? 'human-gated' : 'auto-eligible'}
      </td>
      <td className="py-2 align-top text-[11px] text-carbon-gray-70">{r.reason}</td>
    </tr>
  );
}

export function NistAiRmfPanel({ profile }: { profile: AiRmfProfile }): React.ReactElement {
  return (
    <div className="space-y-6">
      <div className="ed-card flex flex-wrap items-center justify-between gap-4 p-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-carbon-gray-50">
            AI-RMF control coverage (this thread)
          </p>
          <p className="num mt-0.5 text-3xl">
            {profile.satisfied}
            <span className="text-lg text-carbon-gray-50">/{profile.total}</span>
          </p>
        </div>
        <p className="max-w-md text-[11px] text-carbon-gray-60">
          A projection over the sealed evidence record — it adds no ledger entries and mutates
          nothing. Each control cites the real evidence feature (tier · interlock · seal · HITL gate
          · provenance) that satisfies it.
        </p>
      </div>

      <div>
        <h2 className="mb-2 text-lg">Core functions</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {profile.functions.map((b) => (
            <FunctionBlock key={b.fn} block={b} />
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-lg">Trustworthiness characteristics</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {profile.trustworthiness.map((t) => (
            <div key={t.characteristic} className="ed-card p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{t.characteristic}</span>
                <StatusPill status={t.status} />
              </div>
              <p className="mt-1 text-[11px] text-carbon-gray-60">{t.note}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="ed-card p-4">
        <h2 className="mb-1 text-lg">Per-decision explainability</h2>
        <p className="mb-3 text-[11px] text-carbon-gray-50">
          Each AI-influenced decision on the thread: what fired, at which version, the evidence tier
          and the authority ceiling it licenses, whether a human gate applies, and a member-facing
          reason.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-carbon-gray-30 text-[10px] uppercase tracking-wide text-carbon-gray-50">
                <th className="py-1 pr-3 font-semibold">Stage</th>
                <th className="py-1 pr-3 font-semibold">Fired rule</th>
                <th className="py-1 pr-3 font-semibold">Tier → rung</th>
                <th className="py-1 pr-3 font-semibold">Gate</th>
                <th className="py-1 font-semibold">Member-facing reason</th>
              </tr>
            </thead>
            <tbody>
              {profile.explainability.map((r, i) => (
                <ExplainRow key={i} r={r} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
