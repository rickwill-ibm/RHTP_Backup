'use client';
/**
 * LanRungPicker — the HCP-LAN APM ladder picker (Cat 3A → 3B → 4), extracted from GainShareModeler so
 * the modeler shell stays under the file cap. Picking a rung resets the model to that rung's defaults.
 * Each button states whether the rung carries downside (two-sided) — color-keyed AND text-labelled.
 *
 * CLIENT-SAFE: pure economics data only. No `@/lib/evidence` barrel, no node:crypto.
 */
import { LAN_TIERS, type LanTier, type LanTierId } from '@/lib/gainShare/gainShareEconomics';

export function LanRungPicker({
  activeTierId,
  tierNote,
  onPick,
}: {
  activeTierId: LanTierId;
  tierNote: string;
  onPick: (id: LanTierId) => void;
}): React.ReactElement {
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-50">
        Risk-transfer rung · HCP-LAN APM framework
      </p>
      <div className="flex flex-wrap gap-1.5">
        {LAN_TIERS.map((t: LanTier) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t.id)}
            aria-pressed={t.id === activeTierId}
            className={`rounded-lg border px-3 py-1.5 text-left transition ${t.id === activeTierId ? 'border-carbon-blue bg-carbon-blue-lighter' : 'border-carbon-gray-20 hover:bg-carbon-gray-10'}`}
          >
            <span className="mono block text-[9px] font-bold text-carbon-blue">{t.lan}</span>
            <span className="block text-[11px] font-semibold text-carbon-gray-90">{t.name}</span>
            <span
              className={`block text-[9px] font-semibold ${t.twoSided ? 'text-[#8a3ffc]' : 'text-carbon-gray-50'}`}
            >
              {t.twoSided ? '⇅ two-sided (upside + downside)' : '↑ upside-only (no downside)'}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-1 text-[10px] text-carbon-gray-60">{tierNote}</p>
    </div>
  );
}
