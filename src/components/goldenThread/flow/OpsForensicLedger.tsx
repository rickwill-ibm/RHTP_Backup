'use client';
/**
 * OpsForensicLedger — the dark, hash-chained live evidence ledger table (with actor/fired filters and
 * per-row seal re-verify), split out of OperationsBoard. Pure presentational over the shared sim; the
 * seal indicator re-derives the retained chain on every render. Props unchanged (`s`, `op`).
 */
import React, { useMemo, useState } from 'react';
import {
  ledgerIntact,
  verifyEntryDetail,
  type EntryVerifyDetail,
  type SimState,
  type LedgerEntry,
} from '@/lib/goldenThread/flowSim';
import { NIST_COLOR } from '@/lib/goldenThread/nistMap';
import type { OperatingSim } from '@/components/goldenThread/flow/useOperatingSim';
import { HONEST_NIST_NOTE } from '@/components/goldenThread/flow/opsShared';
import { ForensicEntryDetail } from '@/components/goldenThread/flow/ForensicEntryDetail';

export function OpsForensicLedger({ s }: { s: SimState; op?: OperatingSim }): React.ReactElement {
  const [actor, setActor] = useState('all');
  const [fired, setFired] = useState('all');
  // The DETAILED tamper-evidence re-check per row (recomputed vs stored hash + prev-link), and which
  // rows have their provenance drill expanded. Both are pure reads — determinism-safe.
  const [verified, setVerified] = useState<Record<number, EntryVerifyDetail>>({});
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const intact = ledgerIntact(s);
  const rows = useMemo(() => [...s.ledger].slice(-140).reverse(), [s.ledger]);
  const actors = useMemo(
    () => Array.from(new Set(s.ledger.map((e) => e.actor))).sort(),
    [s.ledger]
  );
  const fires = useMemo(() => Array.from(new Set(s.ledger.map((e) => e.fired))).sort(), [s.ledger]);
  const shown = rows.filter(
    (e) => (actor === 'all' || e.actor === actor) && (fired === 'all' || e.fired === fired)
  );

  return (
    <div className="rounded-lg" style={{ background: '#0b1a2b' }}>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <h3 className="text-sm font-semibold text-white">
          Forensic log — the live evidence ledger
        </h3>
        <span
          className="mono text-[10px] font-semibold"
          style={{ color: intact ? '#54d98c' : '#ff8a8a' }}
        >
          {intact ? '● seal intact' : '● seal BROKEN'} · {s.ledgerSeq} sealed · head{' '}
          {s.chainHead.toString(16).slice(-6)}
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-[9px] text-[#9fc2e0]">
          {(['GOVERN', 'MAP', 'MEASURE', 'MANAGE'] as const).map((fn) => (
            <span key={fn} className="flex items-center gap-0.5">
              <span
                className="inline-block h-2 w-2 rounded-sm"
                style={{ background: NIST_COLOR[fn] }}
              />
              {fn}
            </span>
          ))}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-3 pb-1 text-[10px] text-[#9fc2e0]">
        <span className="font-semibold uppercase tracking-wide">Actor</span>
        <select
          value={actor}
          onChange={(e) => setActor(e.target.value)}
          className="rounded border border-[#274b6d] bg-[#0f2740] px-1 py-0.5 text-[10px] text-[#cfe3f4]"
        >
          <option value="all">all</option>
          {actors.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <span className="font-semibold uppercase tracking-wide">Fired</span>
        <select
          value={fired}
          onChange={(e) => setFired(e.target.value)}
          className="rounded border border-[#274b6d] bg-[#0f2740] px-1 py-0.5 text-[10px] text-[#cfe3f4]"
        >
          <option value="all">all</option>
          {fires.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <span className="mono text-[9px] text-[#6f93b3]">{shown.length} shown</span>
      </div>
      <div className="max-h-72 overflow-y-auto px-3 pb-2">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0" style={{ background: '#0b1a2b' }}>
            <tr className="text-[9px] uppercase tracking-wide text-[#6f93b3]">
              <th className="py-1 pr-1 font-semibold" />
              <th className="py-1 pr-2 font-semibold">#</th>
              <th className="py-1 pr-2 font-semibold">Actor</th>
              <th className="py-1 pr-2 font-semibold">Fired</th>
              <th className="py-1 pr-2 font-semibold">Tier→Rung</th>
              <th className="py-1 pr-2 font-semibold">Decision</th>
              <th className="py-1 pr-2 font-semibold">NIST AI-RMF (illustrative)</th>
              <th className="py-1 font-semibold">Integrity</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={8} className="py-3 text-[10px] italic text-[#6f93b3]">
                  the record builds as the run proceeds — press Play
                </td>
              </tr>
            )}
            {shown.map((e: LedgerEntry) => {
              const vd = verified[e.seq];
              const open = !!expanded[e.seq];
              return (
                <React.Fragment key={e.seq}>
                  <tr className="border-b border-[#13324f] align-top">
                    <td className="py-1.5 pr-1">
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-label={`${open ? 'Collapse' : 'Expand'} provenance for seal ${e.seq}`}
                        onClick={() => setExpanded((r) => ({ ...r, [e.seq]: !open }))}
                        className="mono rounded border border-[#274b6d] px-1 text-[10px] text-[#9fc2e0] hover:bg-[#13324f]"
                      >
                        {open ? '▾' : '▸'}
                      </button>
                    </td>
                    <td className="mono py-1.5 pr-2 text-[10px] text-[#6f93b3]">{e.seq}</td>
                    <td
                      className="mono py-1.5 pr-2 text-[10px]"
                      style={{ color: e.human ? '#ffd27a' : '#9fc2e0' }}
                    >
                      {e.actor}
                    </td>
                    <td className="mono py-1.5 pr-2 text-[10px] text-[#cfe3f4]">
                      {e.fired}
                      <span className="block text-[8px] text-[#5f83a3]">{e.version}</span>
                    </td>
                    <td className="mono py-1.5 pr-2 text-[10px] font-semibold text-white">
                      {e.tier}→{e.rung}
                    </td>
                    <td className="py-1.5 pr-2 text-[10px] text-[#cfe3f4]">{e.decision}</td>
                    <td className="py-1.5 pr-2">
                      <span className="inline-flex flex-wrap items-center gap-1">
                        <span
                          className="mono rounded px-1 py-0.5 text-[9px] font-bold text-white"
                          style={{ background: NIST_COLOR[e.nistFn] }}
                        >
                          {e.nistFn}
                        </span>
                        <span className="text-[9px] text-[#9fc2e0]">{e.nistChar}</span>
                        <span className="rounded border border-[#274b6d] px-1 text-[9px] text-[#7fa8c9]">
                          {e.oversight}
                        </span>
                      </span>
                    </td>
                    <td className="py-1.5">
                      {vd === undefined ? (
                        <button
                          type="button"
                          onClick={() =>
                            setVerified((r) => {
                              const d = verifyEntryDetail(s, e.seq);
                              return d ? { ...r, [e.seq]: d } : r;
                            })
                          }
                          className="rounded border border-[#274b6d] px-1.5 py-0.5 text-[9px] text-[#9fc2e0] hover:bg-[#13324f]"
                          title="Recompute this entry's hash from its stored fields and check the chain link"
                        >
                          ↻ Re-derive hash (chain-consistency)
                        </button>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          <span
                            className="mono text-[9px] font-bold"
                            style={{ color: vd.ok ? '#54d98c' : '#ff8a8a' }}
                          >
                            {vd.ok ? '✓ HASH MATCHES' : '✗ TAMPER'}
                          </span>
                          <span className="mono text-[8px] text-[#7fa8c9]">
                            recomputed {vd.recomputed}
                          </span>
                          <span className="mono text-[8px] text-[#7fa8c9]">stored {vd.stored}</span>
                          <span
                            className="mono text-[8px]"
                            style={{ color: vd.prevOk ? '#54d98c' : '#ff8a8a' }}
                          >
                            prev-link {vd.prevOk ? 'ok' : 'BROKEN'}
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>
                  {open && (
                    <tr className="border-b border-[#13324f]">
                      <td colSpan={8} className="pb-2">
                        <ForensicEntryDetail e={e} s={s} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="px-3 pb-2 text-[8px] italic text-[#6f93b3]">
        Append-only, hash-chained: the seal indicator re-derives the whole retained chain on every
        render — any naive edit to a sealed field breaks it.{' '}
        <strong className="text-[#9fc2e0]">Re-derive hash (chain-consistency)</strong> recomputes
        that one entry&apos;s hash from its stored fields and shows the recomputed vs stored hex
        plus the prev-link result — a local integrity re-derivation, not a re-run of the underlying
        analysis. (Illustrative: an unkeyed content hash catches accidental/naive edits; a
        production seal is keyed/signed — HMAC or a signature — so it is tamper-EVIDENT against a
        motivated editor.) Expand a row (▸) for its sealed provenance. Agent rows are capped to the{' '}
        <strong className="text-[#9fc2e0]">earned</strong> ceiling — the ticket shows the
        action-class capability, the ledger shows the authority actually exercised.{' '}
        {HONEST_NIST_NOTE}
      </p>
    </div>
  );
}
