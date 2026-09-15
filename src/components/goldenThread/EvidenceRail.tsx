/**
 * EvidenceRail (Phase A — Golden Thread guided surface). A sticky sidebar rendering
 * of the append-only Evidence Record as a vertical spine: one tier-colored dot per
 * entry, its stage label, and its PHI-safe one-line summary. It ADAPTS
 * EvidenceTimeline — reusing that module's `summarizeEntry`, `STAGE_LABEL`, and its
 * seal-integrity wording — into a compact rail, and highlights the entries backing the
 * currently-active stage.
 *
 * SERVER COMPONENT (deliberately NO 'use client'): a client boundary would SERIALIZE
 * the whole `record` (memberId + every member-embedding entry id + the seal) into the
 * page for hydration, leaking references even when nothing member-identifying renders.
 * As a server component the record stays server-side; only the PHI-safe summaries reach
 * the browser. Deep imports (not the '@/lib/evidence' barrel → node:crypto).
 *
 * PHI DISCIPLINE: stage labels, tiers, and summaries (refs/codes/amounts) only.
 */
import type { EvidenceRecord } from '@/lib/evidence/evidenceRecord';
import { tierOfEntry } from '@/lib/evidence/tier';
import type { EvidenceTier } from '@/lib/evidence/tierConfig';
import StatusBadge from '@/components/ui/StatusBadge';
import { summarizeEntry, STAGE_LABEL, type EvidenceIntegrity } from './EvidenceTimeline';
import { STAGE_SPEC, type StageKey } from '@/lib/goldenThread/threadStageView';

/** Tier → dot color (weakest D0 → strongest D3). */
const TIER_DOT: Record<EvidenceTier, string> = {
  D0: 'bg-carbon-gray-30',
  D1: 'bg-carbon-blue',
  D2: 'bg-[#6929c4]',
  D3: 'bg-carbon-green',
};

/** Compact seal-integrity indicator (replicates EvidenceTimeline's honest three-state wording). */
function RailSeal({
  seal,
  integrity,
}: {
  seal: NonNullable<EvidenceRecord['seal']>;
  integrity?: EvidenceIntegrity;
}): React.ReactElement {
  return (
    <div
      className="mb-2 flex flex-wrap items-center gap-1.5 text-2xs"
      aria-label="Ledger integrity"
    >
      {integrity ? (
        <>
          <StatusBadge label="Sealed" variant="info" size="sm" />
          <StatusBadge
            label={integrity.intact ? 'Integrity intact' : 'Integrity broken'}
            variant={integrity.intact ? 'success' : 'danger'}
            size="sm"
          />
        </>
      ) : (
        <StatusBadge label="Sealed (not verified)" variant="neutral" size="sm" />
      )}
      <span className="text-carbon-gray-50">
        {seal.alg} · {seal.keyId}
      </span>
    </div>
  );
}

export function EvidenceRail({
  record,
  integrity,
  activeStageKey,
}: {
  record: EvidenceRecord;
  integrity?: EvidenceIntegrity;
  activeStageKey?: StageKey;
}): React.ReactElement {
  const activeTypes = activeStageKey
    ? (STAGE_SPEC.find((s) => s.key === activeStageKey)?.types ?? [])
    : [];

  return (
    <aside className="lg:sticky lg:top-4 lg:self-start">
      <div className="space-y-3 rounded-lg border border-carbon-gray-20 bg-white p-4">
        <h2 className="text-sm font-semibold">Evidence Record</h2>
        {record.seal ? <RailSeal seal={record.seal} integrity={integrity} /> : null}
        <ol
          className="space-y-3 border-l border-carbon-gray-20 pl-4"
          aria-label="Evidence record spine"
        >
          {record.entries.map((e) => {
            const tier = tierOfEntry(e);
            const isActive = activeTypes.includes(e.type);
            return (
              <li key={e.id} className="relative">
                <span
                  className={`absolute -left-[21px] top-1 inline-block h-2.5 w-2.5 rounded-full ${TIER_DOT[tier]} ${
                    isActive ? 'ring-2 ring-carbon-blue ring-offset-1' : ''
                  }`}
                  aria-hidden
                />
                <p
                  className={`flex flex-wrap items-center gap-1.5 text-xs font-medium ${
                    isActive ? 'text-carbon-blue' : ''
                  }`}
                >
                  <span>{STAGE_LABEL[e.stage] ?? e.stage}</span>
                  <span className="font-mono text-2xs text-carbon-gray-50">{tier}</span>
                </p>
                <p className="text-2xs text-carbon-gray-70">{summarizeEntry(e)}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </aside>
  );
}
