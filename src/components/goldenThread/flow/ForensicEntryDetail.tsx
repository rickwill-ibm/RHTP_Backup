'use client';
/**
 * ForensicEntryDetail — the per-row provenance drill for one sealed ledger entry, plus the auditor
 * read-me. It shows the ALREADY-SEALED fields of the entry (actor + human/agent, rule fired + version,
 * tier→rung, member-facing decision, oversight mode) and the back-link to whatever this seal minted
 * (a governed ticket via sealSeq/routedSeal/referSeal, or a recon record via mainSealSeq).
 *
 * HONESTY: `reproducible` is a DESIGN ANNOTATION, not a chain verdict. A PEND entry is reproducible:
 * false BY DESIGN (its analysis is not deterministically replayable) yet still verifies ok:true — the
 * chain is intact. We render it as "design annotation" and never as "chain broken". The read-me states
 * that this is a LOCAL integrity re-derivation, not a re-run of the underlying analysis.
 *
 * CLIENT-SAFE: engine types + pure read of the shared sim. No `@/lib/evidence` barrel, no node.
 */
import type { LedgerEntry, SimState } from '@/lib/goldenThread/flowSim';

export function ForensicEntryDetail({ e, s }: { e: LedgerEntry; s: SimState }): React.ReactElement {
  // Back-links: which minted artifact points AT this seal (LedgerEntry itself carries no forward ref).
  const mintedTickets = s.tickets.filter(
    (t) => t.sealSeq === e.seq || t.routedSeal === e.seq || t.referSeal === e.seq
  );
  const reconRecords = s.reconLedger.filter((r) => r.mainSealSeq === e.seq);

  const Field = ({ label, value }: { label: string; value: string }): React.ReactElement => (
    <div className="flex flex-col">
      <span className="text-[8px] uppercase tracking-wide text-[#6f93b3]">{label}</span>
      <span className="mono text-[10px] text-[#cfe3f4]">{value}</span>
    </div>
  );

  return (
    <div className="rounded border border-[#1c3f5f] bg-[#0f2740] p-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Field label="Actor" value={`${e.actor} · ${e.human ? 'human' : 'agent'}`} />
        <Field label="Rule fired" value={`${e.fired} · ${e.version}`} />
        <Field label="Tier → Rung" value={`${e.tier} → ${e.rung}`} />
        <Field label="Oversight" value={e.oversight} />
        <Field label="NIST AI-RMF" value={`${e.nistFn} · ${e.nistChar}`} />
        <Field
          label="Reproducible (design annotation)"
          value={
            e.reproducible
              ? 'yes — deterministic step'
              : 'no — analysis not replayable (still sealed)'
          }
        />
      </div>
      <div className="mt-2 flex flex-col">
        <span className="text-[8px] uppercase tracking-wide text-[#6f93b3]">
          Decision (member-facing reason)
        </span>
        <span className="text-[10px] text-[#cfe3f4]">{e.decision}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[8px] uppercase tracking-wide text-[#6f93b3]">This seal minted</span>
        {mintedTickets.length === 0 && reconRecords.length === 0 && (
          <span className="mono text-[9px] text-[#6f93b3]">
            no forward artifact (provenance / continuous-watch seal)
          </span>
        )}
        {mintedTickets.map((t) => (
          <span
            key={t.key}
            className="mono rounded border border-[#274b6d] px-1.5 py-0.5 text-[9px] text-[#9fc2e0]"
          >
            ticket {t.ref} (sealSeq {e.seq})
          </span>
        ))}
        {reconRecords.map((r) => (
          <span
            key={r.seq}
            className="mono rounded border border-[#274b6d] px-1.5 py-0.5 text-[9px] text-[#9fc2e0]"
          >
            recon record #{r.seq} · {r.claimRef}
          </span>
        ))}
      </div>
      <p className="mt-2 text-[8px] italic text-[#6f93b3]">
        <strong className="text-[#9fc2e0]">How to read this / what to check next:</strong> this is a
        LOCAL integrity re-derivation — it recomputes this entry&apos;s hash from its stored fields
        and checks the prior-link, NOT a re-run of the underlying analysis. A mismatch would mean a
        sealed field was edited after the fact (tamper); a holding seal proves only that the record
        is byte-for-byte what was sealed. A PEND row is{' '}
        <strong className="text-[#9fc2e0]">reproducible: false</strong> by design (its analysis is
        not deterministically replayable) — that is a design annotation, not a broken chain; it
        still verifies.
      </p>
    </div>
  );
}
