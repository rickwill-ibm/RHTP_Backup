'use client';
/**
 * PartyWorkbench — the analyst console (Hex/Colab-style notebook) at the end of the operating loop.
 *
 * When a ticket is opened from the flow/Operations, this console loads it into a notebook: the
 * agent-produced RCA is streamed as cells, grounded in the transaction facts the agent systems hold
 * (270/271 eligibility, 278 responses, 837/835, coverage, enrollment, contract), and the analyst can
 * ask grounded follow-ups (NLQ) and trigger the governed resolution. Without a focused ticket it
 * shows the LIVE-wired AnalystWorkbench (real endpoints) + this seat's live queue.
 *
 * CLIENT-SAFE: shared sim + spine + AnalystWorkbench (itself barrel-free). No `@/lib/evidence` barrel.
 */
import { useMemo, useState } from 'react';
import {
  TICKETS as SEED_TICKETS,
  ROLE_SIDE,
  ROLE_LABEL,
  type OpsTicket,
} from '@/lib/goldenThread/e2eFlow';
import type { WorkbenchAnalysis } from '@/components/goldenThread/AnalystWorkbench';
import { WorkflowPanel } from '@/components/goldenThread/flow/WorkflowPanel';
import { AnalystChat } from '@/components/goldenThread/flow/AnalystChat';
import { startersForSide, widenQueryForAlgorithm } from '@/lib/goldenThread/analytics';
import type { OperatingSim } from '@/components/goldenThread/flow/useOperatingSim';
import { nistForAlgorithm } from '@/lib/goldenThread/nistMap';
import { displayAuthority, execEarnedCeiling } from '@/lib/goldenThread/flowSim';
import {
  TwinLadderCodes,
  NistChips,
  ExecLegendMini,
  HONEST_NIST_NOTE,
} from '@/components/goldenThread/flow/opsShared';
import StatusBadge from '@/components/ui/StatusBadge';

type Side = 'payer' | 'provider' | 'neutral';
type Variant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'purple';
const SEV_VARIANT: Record<OpsTicket['severity'], Variant> = {
  critical: 'danger',
  warning: 'warning',
  action: 'info',
  info: 'neutral',
};
const SIDE_LABEL: Record<Side, string> = {
  payer: 'Payer / MCO workbench',
  provider: 'Provider workbench',
  neutral: 'Neutral · State-TPL / PI recovery',
};

export interface PartyWorkbenchProps {
  side: Side;
  tickets: OpsTicket[];
  recordId: string;
  analyses: WorkbenchAnalysis[];
  op: OperatingSim;
  openTicketId: string | null;
  openTicketKey: string | null;
  onClearOpenTicket: () => void;
  onOpenTicket?: (seedId: string, side: Side, liveKey?: string) => void;
}

export function PartyWorkbench({
  side,
  recordId,
  analyses,
  op,
  openTicketId,
  openTicketKey,
  onClearOpenTicket,
  onOpenTicket,
}: PartyWorkbenchProps): React.ReactElement {
  const focus = openTicketId ? SEED_TICKETS.find((t) => t.id === openTicketId) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base">{SIDE_LABEL[side]}</h3>
        <StatusBadge
          label={
            focus
              ? 'Analyst notebook · grounded on the ticket record (seed)'
              : 'Grounded on the live operating record'
          }
          variant={focus ? 'neutral' : 'info'}
          size="sm"
        />
      </div>
      <ExecLegendMini />

      {focus ? (
        <TicketConsole
          ticket={focus}
          onBack={onClearOpenTicket}
          op={op}
          side={side}
          liveKey={openTicketKey}
        />
      ) : (
        <IdleConsole
          side={side}
          recordId={recordId}
          analyses={analyses}
          op={op}
          onOpenTicket={onOpenTicket}
        />
      )}
    </div>
  );
}

/* ─────────────────────────── The ticket-focused analyst notebook ─────────────────────────── */

interface Cell {
  kind: 'source' | 'agent' | 'nlq' | 'action';
  title: string;
  body: React.ReactNode;
}

function TicketConsole({
  ticket: t,
  onBack,
  op,
  side,
  liveKey,
}: {
  ticket: OpsTicket;
  onBack: () => void;
  op: OperatingSim;
  side: Side;
  liveKey: string | null;
}): React.ReactElement {
  const v = t.verdict;
  const spec = nistForAlgorithm(t.algorithm);
  const da = displayAuthority(v.permittedRung, v.requiresHuman, op.sim); // single-sourced display authority
  const oversight = da.oversight;
  const facts = groundedFacts(t);
  const live = liveKey ? op.sim.tickets.find((x) => x.key === liveKey) : undefined;
  const sealSeq = live?.sealSeq; // the ledger entry that backs this detection (provenance link)
  const status = live?.status;
  const canAct = !!live && status !== 'Closed'; // requires a resolvable live ticket, not a stale key
  // Is the cited seal still in the retained ledger window (else the cite would dangle)?
  const sealRetained =
    sealSeq !== undefined &&
    sealSeq > op.sim.ledgerSeq - 400 &&
    op.sim.ledger.some((e) => e.seq === sealSeq);
  const [disp, setDisp] = useState<'resolved' | 'cleared' | null>(null);
  const [reason, setReason] = useState('');
  const [secondReviewer, setSecondReviewer] = useState(false);
  const sourceByKey = new Map(facts.sources.map((sc) => [sc.key, sc]));
  const [connected, setConnected] = useState<Set<string>>(
    () => new Set(facts.sources.filter((sc) => sc.defaultOn).map((sc) => sc.key))
  );
  const toggleSource = (key: string): void =>
    setConnected((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const [qa, setQa] = useState<
    Array<{ q: string; a: string; matched?: string[]; refused?: boolean }>
  >([]);
  const [prepared, setPrepared] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const ask = (q: string, a: string, matched?: string[], refused?: boolean): void =>
    setQa((prev) => (prev.some((x) => x.q === q) ? prev : [...prev, { q, a, matched, refused }]));
  const askFree = (): void => {
    const question = draft.trim();
    if (!question) return;
    const r = answerFromRecord(t, question);
    ask(question, r.answer, r.matched, r.refused);
    setDraft('');
  };

  return (
    <div className="space-y-3">
      {/* Notebook header */}
      <div className="ed-card flex flex-wrap items-center justify-between gap-2 p-3">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="mono text-[10px] text-carbon-blue hover:underline"
          >
            ← back to queue
          </button>
          <p className="mono mt-0.5 text-[10px] uppercase tracking-wide text-carbon-gray-50">
            {t.id} · {t.algorithm} · {ROLE_LABEL[t.role]} ({t.operator})
            {sealSeq !== undefined && (
              <span
                className="ml-1 rounded bg-carbon-gray-10 px-1 normal-case text-carbon-gray-60"
                title="The sealed ledger entry that backs this detection"
              >
                · sealed evidence #{sealSeq}
                {sealRetained
                  ? ' (Operations forensic log)'
                  : ' (aged out of the retained window — full ledger server-persisted)'}
              </span>
            )}
            {status && status !== 'New' && (
              <span className="ml-1 rounded bg-carbon-blue-lighter px-1 normal-case text-carbon-blue">
                · {status.toLowerCase()}
              </span>
            )}
          </p>
          <h4 className="text-base font-semibold">{t.title}</h4>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge label={t.severity} variant={SEV_VARIANT[t.severity]} />
          <TwinLadderCodes
            tier={v.evidenceTier}
            rung={da.capability}
            human={v.requiresHuman}
            capped={da.capped}
            now={da.ceiling}
          />
          <NistChips fn={spec.fn} char={spec.char} oversight={oversight} />
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* ── MAIN COLUMN — the conversation + its explanation are the focus ── */}
        <div className="min-w-0 space-y-3">
          {/* A live governed WORKFLOW is the actionable surface — show it first. */}
          {liveKey && op.sim.workflows.find((w) => w.ticketKey === liveKey) && (
            <WorkflowPanel op={op} wf={op.sim.workflows.find((w) => w.ticketKey === liveKey)!} />
          )}

          {/* Mode B — TICKET RESPONSE: the agent's RCA LEADS (it was already produced when the ticket opened) */}
          <NotebookCell
            kind="agent"
            n={1}
            title="Agent RCA · produced when the agent opened this ticket"
          >
            <ol className="list-decimal space-y-1.5 pl-4 text-xs text-carbon-gray-90">
              {t.rca.map((line, i) => (
                <li key={i} className="leading-snug">
                  {line}
                </li>
              ))}
            </ol>
            <div className="mt-2 rounded border border-carbon-gray-20 bg-carbon-gray-10 p-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-50">
                Recommended action
              </p>
              <p className="mt-0.5 text-xs text-carbon-gray-90">{t.recommendation}</p>
            </div>
          </NotebookCell>

          {/* Case-scoped analysis — runs the book-wide view the RCA points at ("widen to every claim on this code"),
              so the recommended next step stays in-frame instead of forcing the analyst back to the notebook. */}
          <AnalystChat
            op={op}
            starters={[widenQueryForAlgorithm(t.algorithm)]}
            heading={'Widen & analyse — beyond this one case'}
            subheading={'Runs the book-wide view your RCA points at · returns a chart · multi-turn'}
          />

          {/* Ask-about-this-case moved to the right inspector rail (below) */}

          {/* Governed resolution + close the loop */}
          <NotebookCell
            kind="action"
            n={2}
            title="Resolve &amp; close · governed outbound + case disposition"
          >
            {status === 'Closed' ? (
              <p className="rounded border border-carbon-green bg-carbon-green-light p-2 text-[11px] font-semibold text-carbon-green">
                ● Case closed —{' '}
                {live?.disposition === 'cleared'
                  ? 'cleared, not FWA'
                  : 'dispositioned (any proposed action pending human release)'}
                . The closure is sealed on the ledger; the ticket has left the open baskets.
              </p>
            ) : (
              <>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-50">
                  1 · Propose a governed outbound
                </p>
                <div className="flex flex-wrap gap-2">
                  {t.outbound.map((a) => {
                    // Behavioral earned-gate (matches proposeOutbound): autonomous EXECUTION requires the fleet to
                    // have EARNED A2. Below that, even a non-gated action routes to a human — so no live "execute"
                    // exists while unearned, and the ledger never shows an EXECUTED act above the earned ceiling.
                    const autoEarned = execEarnedCeiling(op.sim) >= 2;
                    const routeToHuman = a.humanGated || !autoEarned;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        disabled={!canAct}
                        onClick={() => {
                          setPrepared(a.id);
                          if (liveKey) op.propose(liveKey, a.label, routeToHuman);
                        }}
                        className={`rounded border px-2 py-1 text-[11px] font-medium transition disabled:opacity-40 ${routeToHuman ? 'border-carbon-yellow bg-carbon-yellow-light text-[#b45309] hover:bg-[#fbecb0]' : 'border-carbon-gray-30 bg-white text-carbon-gray-80 hover:bg-carbon-gray-10'}`}
                      >
                        {routeToHuman && <span aria-hidden>🔒 </span>}
                        {a.label}
                        {a.humanGated ? (
                          <span className="ml-1 text-[9px] uppercase">· human-gated</span>
                        ) : !autoEarned ? (
                          <span className="ml-1 text-[9px] uppercase">
                            · routes to human (not yet earned)
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                {prepared && (
                  <p className="mono mt-2 rounded border border-carbon-gray-20 bg-white p-2 text-[10px] text-carbon-gray-70">
                    {(() => {
                      const a = t.outbound.find((x) => x.id === prepared);
                      if (!a) return null;
                      const autoEarned = execEarnedCeiling(op.sim) >= 2;
                      return a.humanGated || !autoEarned
                        ? `"${a.label}" on ${a.channel} — sealed to the ledger as PROPOSED (pending an authorized human to release${!a.humanGated && !autoEarned ? '; the fleet has not earned autonomous authority' : ''}). Not transmitted (mock). Watch the "sealed records" count rise on the Operations tab.`
                        : `"${a.label}" on ${a.channel} — sealed to the ledger as EXECUTED (non-adverse, non-submission). Not transmitted (mock).`;
                    })()}
                  </p>
                )}
                <p className="mb-1 mt-3 text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-50">
                  2 · Disposition &amp; close the case
                </p>
                {disp === null ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!canAct}
                      onClick={() => {
                        setDisp('resolved');
                        setReason('');
                        setSecondReviewer(false);
                      }}
                      className="rounded bg-carbon-blue px-2 py-1 text-[11px] font-semibold text-white hover:bg-carbon-blue-hover disabled:opacity-40"
                    >
                      Resolve &amp; close (disposition recorded)
                    </button>
                    <button
                      type="button"
                      disabled={!canAct}
                      onClick={() => {
                        setDisp('cleared');
                        setReason('');
                        setSecondReviewer(false);
                      }}
                      className="rounded border border-carbon-gray-40 px-2 py-1 text-[11px] font-semibold text-carbon-gray-70 hover:bg-carbon-gray-10 disabled:opacity-40"
                    >
                      Clear — not FWA
                    </button>
                  </div>
                ) : (
                  (() => {
                    const critical = t.severity === 'critical';
                    const needsSecond = critical && disp === 'cleared'; // segregation of duties on a critical clear
                    const needReason = critical; // a rationale is required to close a critical case
                    const ready =
                      (!needReason || reason.trim().length > 3) && (!needsSecond || secondReviewer);
                    return (
                      <div className="rounded border border-carbon-gray-20 bg-carbon-gray-10 p-2">
                        <p className="text-[10px] font-semibold text-carbon-gray-80">
                          {disp === 'cleared' ? 'Clear — not FWA' : 'Resolve & close'} ·{' '}
                          {t.severity} case{' '}
                          {live?.assignedTo ? `· grabbed by ${live.assignedTo}` : ''}
                        </p>
                        <textarea
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder={
                            needReason
                              ? 'Rationale (required to close a critical case) — sealed to the ledger…'
                              : 'Rationale (optional) — sealed to the ledger…'
                          }
                          rows={2}
                          className="mt-1 w-full rounded border border-carbon-gray-30 px-2 py-1 text-[11px]"
                        />
                        {needsSecond && (
                          <label className="mt-1 flex items-center gap-1.5 text-[9px] text-carbon-gray-70">
                            <input
                              type="checkbox"
                              checked={secondReviewer}
                              onChange={(e) => setSecondReviewer(e.target.checked)}
                            />
                            Segregation of duties: a second reviewer (not the grabber) has signed
                            off on clearing this critical fraud lead.
                          </label>
                        )}
                        {disp === 'cleared' && critical && (
                          <p className="mt-1 text-[9px] text-[#b45309]">
                            Clearing a credible-fraud signal is a recorded decision — consider a 42
                            CFR 455.23 / MFCU referral review before dismissal.
                          </p>
                        )}
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={!ready}
                            onClick={() => {
                              if (liveKey) {
                                op.close(
                                  liveKey,
                                  disp,
                                  needsSecond ? 'analyst+reviewer' : 'analyst',
                                  reason.trim() || undefined
                                );
                                onBack();
                              }
                            }}
                            className={`rounded px-2 py-1 text-[11px] font-semibold text-white ${ready ? 'bg-carbon-blue hover:bg-carbon-blue-hover' : 'cursor-not-allowed bg-carbon-gray-30'}`}
                          >
                            Confirm — seal closure
                          </button>
                          <button
                            type="button"
                            onClick={() => setDisp(null)}
                            className="rounded border border-carbon-gray-30 px-2 py-1 text-[11px] text-carbon-gray-60"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    );
                  })()
                )}
                {!canAct && (
                  <p className="mt-1 text-[9px] italic text-carbon-gray-40">
                    Open this case from Operations or Surveillance to enable disposition (needs the
                    live ticket).
                  </p>
                )}
              </>
            )}
            <p className="mt-2 text-[10px] italic text-carbon-gray-40">
              Closing appends a sealed CLOSURE record — evidence is never deleted. Adverse
              determinations (455.23 suspension, deemed-adverse NABD, gold-card revocation,
              recoupment) are human decisions in the recommendation — never one-click agent actions.
            </p>
          </NotebookCell>

          <p className="text-[9px] italic text-carbon-gray-40">{HONEST_NIST_NOTE}</p>
        </div>

        {/* ── RIGHT INSPECTOR — reference panels dock here (hover/click to open) ── */}
        <Inspector
          tools={[
            {
              key: 'source',
              label: `Source systems · ${side} seat`,
              sub: 'provenance & access · connect / attest',
              accent: '#24427e',
              body: (
                <>
                  <SourcePanel
                    sources={facts.sources}
                    side={side}
                    connected={connected}
                    onToggle={toggleSource}
                  />
                  <p className="mt-1.5 text-[9px] italic text-carbon-gray-40">
                    Each connection is access-controlled by your seat and must be configured before
                    it loads; elevated (SIU/PHI) and 42 CFR Part 2 sources require an attestation.
                    Connecting a source records who connected it. Illustrative topology — no live
                    endpoints in this prototype.
                  </p>
                </>
              ),
            },
            {
              key: 'facts',
              label: 'Grounded facts',
              sub: `${t.provider.split(' (')[0]} · ${t.payer}`,
              accent: '#24427e',
              body: (
                <>
                  <table className="w-full text-left">
                    <tbody>
                      {facts.rows.map((r) => {
                        const sc = r.src === '*' ? undefined : sourceByKey.get(r.src);
                        const liveRow = r.src === '*' || connected.has(r.src);
                        return (
                          <tr key={r.k} className="border-b border-carbon-gray-10 last:border-0">
                            <td className="w-32 py-1 pr-3 align-top text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-50">
                              {r.k}
                            </td>
                            <td className="py-1">
                              {liveRow ? (
                                <span className="mono text-[11px] text-carbon-gray-90">{r.v}</span>
                              ) : (
                                <span className="text-[10px] italic text-carbon-gray-40">
                                  — connect{' '}
                                  <span className="font-semibold not-italic">
                                    {sc?.label ?? r.src}
                                  </span>{' '}
                                  to load
                                </span>
                              )}
                              <span
                                className="ml-2 rounded bg-carbon-gray-10 px-1 text-[8px] uppercase tracking-wide text-carbon-gray-40"
                                title="Provenance — the source system this fact came from"
                              >
                                {r.src === '*' ? 'governance' : (sc?.label ?? r.src)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="mt-1 text-[9px] italic text-carbon-gray-40">
                    Codes / refs only — PHI-safe. Values are modeled seed data (illustrative); each
                    row shows the source it would be read from. Rows from unconnected sources load
                    only after you connect that source.
                  </p>
                </>
              ),
            },
            {
              key: 'ask',
              label: 'Ask about this case',
              sub: 'fielded-fact retriever · facts on file',
              accent: '#0f766e',
              body: (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {facts.nlq.map((item) => (
                      <button
                        key={item.q}
                        type="button"
                        onClick={() => ask(item.q, item.a)}
                        className="rounded-full border border-[#0f766e] px-2 py-0.5 text-[10px] font-medium text-[#0f766e] hover:bg-[#e6f4f1]"
                      >
                        {item.q}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 space-y-2">
                    {qa.map((x) => (
                      <div
                        key={x.q}
                        className={`rounded border p-2 ${x.refused ? 'border-carbon-yellow bg-carbon-yellow-light' : 'border-carbon-gray-20 bg-white'}`}
                      >
                        <p className="text-[11px] font-semibold text-carbon-gray-90">{x.q}</p>
                        <p className="mono mt-0.5 text-[10px] text-carbon-gray-70">{x.a}</p>
                        {x.matched && x.matched.length > 0 && (
                          <p className="mt-1 text-[9px] text-carbon-gray-50">
                            Matched fields: <span className="mono">{x.matched.join(' · ')}</span>
                          </p>
                        )}
                        {!x.refused && (
                          <p className="mt-0.5 text-[9px] text-carbon-gray-40">
                            Provenance: ticket <span className="mono">{t.id}</span>
                            {sealSeq !== undefined && (
                              <>
                                {' '}
                                · sealed evidence <span className="mono">#{sealSeq}</span>{' '}
                                {sealRetained
                                  ? '(Operations forensic log)'
                                  : '(aged out of retained window — server-persisted)'}
                              </>
                            )}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') askFree();
                      }}
                      placeholder="Ask your own question about this case…"
                      className="flex-1 rounded border border-carbon-gray-30 px-2 py-1 text-[11px]"
                    />
                    <button
                      type="button"
                      onClick={askFree}
                      className="rounded bg-carbon-gray-90 px-2 py-1 text-[11px] font-semibold text-white hover:bg-black"
                    >
                      Ask
                    </button>
                  </div>
                  <p className="mt-1 text-[9px] italic text-carbon-gray-40">
                    A fielded-fact retriever, not a reasoning AI: it matches your question to facts
                    on the record and answers with what the record states, echoing the fields it
                    matched. It refuses comparisons, trends and current external status rather than
                    guess. A wired NLU/agent runtime would answer over the live evidence.
                  </p>
                </>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}

/* ── The right-hand inspector: reference panels dock here; hover or click a header to open one ── */
function Inspector({
  tools,
}: {
  tools: Array<{ key: string; label: string; sub: string; accent: string; body: React.ReactNode }>;
}): React.ReactElement {
  const [active, setActive] = useState<string | null>(null);
  return (
    <aside className="lg:sticky lg:top-3">
      <div className="ed-card overflow-hidden p-0">
        <div
          className="flex items-center gap-2 border-b border-carbon-gray-20 px-3 py-2"
          style={{ background: '#fafbfc' }}
        >
          <span className="text-[11px] font-semibold uppercase tracking-wide text-carbon-gray-60">
            Inspector
          </span>
          <span className="text-[10px] text-carbon-gray-40">sources · facts · Q&amp;A</span>
          <span className="mono ml-auto text-[9px] text-carbon-gray-40">click to open</span>
        </div>
        <div className="divide-y divide-carbon-gray-10">
          {tools.map((tl) => {
            const open = active === tl.key;
            return (
              <div key={tl.key}>
                <button
                  type="button"
                  onClick={() => setActive((a) => (a === tl.key ? null : tl.key))}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-carbon-blue-lighter"
                  style={{ background: open ? '#f5f8fc' : 'transparent' }}
                >
                  <span
                    className="inline-block h-4 w-1 shrink-0 rounded-sm"
                    style={{ background: tl.accent }}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] font-semibold text-carbon-gray-90">
                      {tl.label}
                    </span>
                    <span className="block truncate text-[10px] text-carbon-gray-40">{tl.sub}</span>
                  </span>
                  <span
                    className="mono ml-auto shrink-0 text-[11px]"
                    style={{ color: open ? tl.accent : '#9c9891' }}
                  >
                    {open ? '▾' : '▸'}
                  </span>
                </button>
                {open && (
                  <div className="max-h-[62vh] overflow-y-auto border-t border-carbon-gray-10 bg-white px-3 py-3">
                    {tl.body}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-1.5 px-1 text-[9px] italic text-carbon-gray-40">
        Reference panels dock here so the conversation stays the focus. Opening one pins it — click
        its header again to close.
      </p>
    </aside>
  );
}

function NotebookCell({
  kind,
  n,
  title,
  children,
  defaultOpen = true,
  subtitle,
}: {
  kind: Cell['kind'];
  n: number;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  subtitle?: string;
}): React.ReactElement {
  const accent =
    kind === 'agent'
      ? '#5b3fa3'
      : kind === 'nlq'
        ? '#0f766e'
        : kind === 'action'
          ? '#b45309'
          : '#24427e';
  const tag =
    kind === 'agent' ? 'agent' : kind === 'nlq' ? 'ask' : kind === 'action' ? 'resolve' : 'data';
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-lg border border-carbon-gray-20 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 border-b border-carbon-gray-10 px-3 py-1.5 text-left transition hover:bg-carbon-gray-10"
        style={{ background: open ? '#fafbfc' : 'transparent' }}
      >
        <span
          className="mono flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-white"
          style={{ background: accent }}
        >
          {n}
        </span>
        <span
          className="mono rounded px-1 text-[9px] font-bold uppercase tracking-wide text-white"
          style={{ background: accent }}
        >
          {tag}
        </span>
        <span className="text-[11px] font-semibold text-carbon-gray-80">{title}</span>
        {!open && subtitle && (
          <span className="truncate text-[10px] text-carbon-gray-40">· {subtitle}</span>
        )}
        <span className="mono ml-auto text-[11px] text-carbon-gray-40">
          {open ? '▾' : '▸ show'}
        </span>
      </button>
      {open && <div className="p-3">{children}</div>}
    </div>
  );
}

/* ── The access-controlled source connection panel ── */
function SourcePanel({
  sources,
  side,
  connected,
  onToggle,
}: {
  sources: SourceDef[];
  side: Side;
  connected: Set<string>;
  onToggle: (key: string) => void;
}): React.ReactElement {
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [attested, setAttested] = useState(false);
  return (
    <div className="space-y-1.5">
      {sources.map((sc) => {
        const access = sourceAccess(sc, side);
        const on = connected.has(sc.key);
        const isConfig = configuring === sc.key;
        const gated = access === 'elevated' || access === 'consent';
        return (
          <div key={sc.key} className="rounded border border-carbon-gray-20 bg-white">
            <div className="flex items-center gap-2 px-2 py-1.5">
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{
                  background: on ? '#24a148' : access === 'not-permitted' ? '#da1e28' : '#c4c4c4',
                }}
              />
              <span className="text-[11px] font-semibold text-carbon-gray-80">{sc.label}</span>
              <span className="mono text-[9px] text-carbon-gray-40">{sc.edi}</span>
              {access === 'elevated' && (
                <span className="rounded bg-carbon-yellow-light px-1 text-[8px] font-semibold uppercase text-[#b45309]">
                  elevated
                </span>
              )}
              {access === 'consent' && (
                <span className="rounded bg-[#f6f2ff] px-1 text-[8px] font-semibold uppercase text-[#6929c4]">
                  Part 2 consent
                </span>
              )}
              <span className="ml-auto">
                {access === 'not-permitted' ? (
                  <span
                    className="rounded border border-carbon-gray-20 px-1.5 py-0.5 text-[9px] text-carbon-gray-40"
                    title={`${sc.scope} system — out of scope for the ${side} seat`}
                  >
                    🔒 not permitted · {sc.scope}
                  </span>
                ) : on ? (
                  <button
                    type="button"
                    onClick={() => onToggle(sc.key)}
                    className="rounded border border-carbon-green px-1.5 py-0.5 text-[9px] font-semibold text-carbon-green hover:bg-carbon-green-light"
                  >
                    ● connected · disconnect
                  </button>
                ) : isConfig ? (
                  <span className="text-[9px] text-carbon-gray-40">configuring…</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setConfiguring(sc.key);
                      setAttested(false);
                    }}
                    className="rounded bg-carbon-blue px-1.5 py-0.5 text-[9px] font-semibold text-white hover:bg-carbon-blue-hover"
                  >
                    {gated ? '🔒 configure access' : 'connect'}
                  </button>
                )}
              </span>
            </div>
            {isConfig && (
              <div className="border-t border-carbon-gray-10 bg-carbon-gray-10 px-2 py-1.5">
                <p className="text-[9px] text-carbon-gray-60">
                  Configure connection · scope <span className="mono">{sc.edi}</span> · read-only ·{' '}
                  {side} seat
                </p>
                {access === 'elevated' && (
                  <label className="mt-1 flex items-center gap-1.5 text-[9px] text-carbon-gray-70">
                    <input
                      type="checkbox"
                      checked={attested}
                      onChange={(e) => setAttested(e.target.checked)}
                    />
                    I attest I hold elevated (SIU / PI / PHI) access for this source; the grant is
                    recorded.
                  </label>
                )}
                {access === 'consent' && (
                  <label className="mt-1 flex items-center gap-1.5 text-[9px] text-carbon-gray-70">
                    <input
                      type="checkbox"
                      checked={attested}
                      onChange={(e) => setAttested(e.target.checked)}
                    />
                    42 CFR Part 2: I attest a valid consent / segmentation basis exists before
                    loading SUD-adjacent detail.
                  </label>
                )}
                <div className="mt-1 flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={gated && !attested}
                    onClick={() => {
                      onToggle(sc.key);
                      setConfiguring(null);
                      setAttested(false);
                    }}
                    className={`rounded px-1.5 py-0.5 text-[9px] font-semibold text-white ${gated && !attested ? 'cursor-not-allowed bg-carbon-gray-30' : 'bg-carbon-blue hover:bg-carbon-blue-hover'}`}
                  >
                    Confirm connection
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfiguring(null);
                      setAttested(false);
                    }}
                    className="rounded border border-carbon-gray-30 px-1.5 py-0.5 text-[9px] text-carbon-gray-60"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Source model + access control (per analyst seat) ── */
export interface SourceDef {
  key: string;
  label: string;
  edi: string;
  scope: 'shared' | 'payer' | 'provider' | 'neutral'; // whose system it is
  requiresElevated?: boolean; // needs an elevated-access grant (SIU/PI, PHI)
  consent?: boolean; // 42 CFR Part 2 SUD consent gate
  defaultOn: boolean;
}
export type SourceAccess = 'connectable' | 'elevated' | 'consent' | 'not-permitted';
/** What the current seat may do with a source — the switch is bound to access control. */
export function sourceAccess(src: SourceDef, side: Side): SourceAccess {
  if (src.scope !== 'shared' && src.scope !== side) return 'not-permitted'; // another party's internal system
  if (src.consent) return 'consent';
  if (src.requiresElevated) return 'elevated';
  return 'connectable';
}

const BH_ALGOS = new Set(['DENY-DISPARATE-IMPACT']);

/* ── Grounded fact synthesis (deterministic, from the seed ticket) — every fact carries provenance (src) ── */
function groundedFacts(t: OpsTicket): {
  sources: SourceDef[];
  rows: Array<{ k: string; v: string; src: string }>;
  nlq: Array<{ q: string; a: string }>;
} {
  const bh = BH_ALGOS.has(t.algorithm);
  const sources: SourceDef[] = [
    { key: 'elig', label: 'Eligibility', edi: '270/271', scope: 'shared', defaultOn: true },
    { key: 'pa', label: 'Prior-auth', edi: '278', scope: 'shared', defaultOn: true },
    { key: 'claims', label: 'Claims', edi: '837 P/I/D', scope: 'shared', defaultOn: true },
    { key: 'remit', label: 'Remittance', edi: '835', scope: 'shared', defaultOn: true },
    {
      key: 'coverage',
      label: 'Coverage / enrollment',
      edi: 'FHIR Coverage',
      scope: 'shared',
      defaultOn: true,
    },
    { key: 'contract', label: 'Contract', edi: 'fee schedule', scope: 'payer', defaultOn: true },
    {
      key: 'siu',
      label: 'SIU case system',
      edi: 'internal',
      scope: 'payer',
      requiresElevated: true,
      defaultOn: false,
    },
    {
      key: 'mpi',
      label: 'Member detail (PHI)',
      edi: 'FHIR Patient',
      scope: 'payer',
      requiresElevated: true,
      defaultOn: false,
    },
    ...(bh
      ? [
          {
            key: 'sud',
            label: 'Behavioral-health / SUD detail',
            edi: '42 CFR Part 2',
            scope: 'shared' as const,
            consent: true,
            defaultOn: false,
          },
        ]
      : []),
  ];
  const rows: Array<{ k: string; v: string; src: string }> = [
    { k: 'Provider', v: `${t.provider}`, src: 'claims' },
    { k: 'Payer / plan', v: `${t.payer}`, src: 'coverage' },
    ...(t.emr ? [{ k: 'EHR source', v: `${t.emr} · SMART on FHIR`, src: 'pa' }] : []),
    { k: 'Coverage (270/271)', v: coverageFact(t), src: 'elig' },
    { k: 'Refs / codes', v: t.claimRefs, src: 'claims' },
    { k: 'Exposure (837→835)', v: `${exposureFact(t)} · SLA ${t.slaHours}h`, src: 'remit' },
    {
      k: 'Twin-Ladder verdict',
      v: `${t.verdict.evidenceTier} → ${t.verdict.permittedRung} capability · ${t.verdict.requiresHuman ? 'human-gated (detect/advise)' : 'agent-eligible once earned'}`,
      src: '*',
    },
    ...(bh
      ? [
          {
            k: 'BH cohort detail',
            v: '§1557 cohort membership + criteria (SUD-adjacent, Part 2)',
            src: 'sud',
          },
        ]
      : []),
  ];
  const nlq: Array<{ q: string; a: string }> = [
    { q: 'What eligibility & coverage back this member?', a: coverageFact(t) },
    {
      q: 'Show the 837 → 835 delta.',
      a: `Exposure on the flagged refs (${t.claimRefs}) is ${exposureFact(t)}; the 835 CARC/RARC groups are attached to the reconciliation record. Extrapolate book-wide only via a statistically-valid sample.`,
    },
    {
      q: 'What authority does the agent have here, and why?',
      a: `${t.verdict.evidenceTier} → ${t.verdict.permittedRung} is the action-class CAPABILITY. ${t.verdict.reason}${t.verdict.requiresHuman ? ' The submission/adverse action is human-gated regardless of proof.' : ' Autonomy is EARNED, not assumed — the agent acts autonomously only up to what the fleet has earned; until then it advises a human.'}`,
    },
    {
      q: 'What is the recommended next action, and who signs it?',
      a: `${t.recommendation} Owner: ${t.operator} (${ROLE_LABEL[t.role]}).`,
    },
  ];
  if (t.algorithm === 'DENY-DISPARATE-IMPACT') {
    nlq.push({
      q: 'What is the four-fifths ratio and cohort n?',
      a: `The §1557 screen ran on the behavioral-health cohort in ${t.claimRefs}; the four-fifths ratio is below 0.80. This is a cohort statistic — no per-member adverse action is taken; it routes to the Medical Director + Compliance for risk-adjustment review, not an auto rule-change.`,
    });
  }
  if (t.algorithm === 'CALENDAR-IMPOSSIBLE') {
    nlq.push({
      q: 'Rule out the benign NPI-aggregation cause?',
      a: `Check TIN↔NPI rollup, group-vs-individual NPI mapping and timezone/timestamp aggregation FIRST — that is the common non-fraud explanation. Only after it is excluded does the temporal-impossibility signal support an SIU case.`,
    });
  }
  return { sources, rows, nlq };
}

/**
 * Honest fielded-fact retriever: matches the analyst's question to fields ON the record and answers
 * with what the record STATES, echoing the matched fields. It refuses (rather than guess) on
 * negation, comparison, trend-over-time, or current-external-status questions it structurally cannot
 * evaluate. It never phrases output as judgment. Deterministic; not a reasoning AI.
 */
function coverageFact(t: OpsTicket): string {
  if (t.algorithm === 'COB-TPL')
    return 'Coordination of benefits: a commercial primary is present alongside Apple Health — Medicaid is payer of last resort, so coverage coordination IS the finding here (270/271 + TPL), not incidental.';
  return 'Coverage ACTIVE · enrollment segment current (illustrative seed); not the driver of this finding.';
}
function exposureFact(t: OpsTicket): string {
  if (t.exposureUsd === 0)
    return 'Exposure here is regulatory / reprocessing, not a dollar figure (a compliance finding) — not $0 of harm.';
  return `$${t.exposureUsd.toLocaleString()} on refs ${t.claimRefs}`;
}
function answerFromRecord(
  t: OpsTicket,
  question: string
): { answer: string; matched: string[]; refused: boolean } {
  const q = ` ${question.toLowerCase()} `;
  const fields: Array<{ keys: string[]; label: string; value: string }> = [
    { keys: ['provider', 'npi', 'entity', 'facility'], label: 'provider', value: t.provider },
    { keys: ['payer', 'plan', 'mco', 'insurer'], label: 'payer/plan', value: t.payer },
    {
      keys: [
        'exposure',
        'amount',
        'dollar',
        '$',
        'money',
        'delta',
        'underpay',
        'overpay',
        'recover',
        'paid',
      ],
      label: 'exposure',
      value: exposureFact(t),
    },
    {
      keys: ['ref', 'code', 'cpt', 'claim', 'encounter', 'hcpcs'],
      label: 'refs/codes',
      value: t.claimRefs,
    },
    {
      keys: ['authority', 'rung', 'autonomy', 'gate', 'permit', 'twin', 'human-gated'],
      label: 'authority',
      value: `${t.verdict.evidenceTier}→${t.verdict.permittedRung} capability · ${t.verdict.requiresHuman ? 'human-gated (detect/advise)' : 'agent-eligible once earned (autonomy is earned, not assumed)'} — ${t.verdict.reason}`,
    },
    {
      keys: ['eligib', 'coverage', 'enroll', 'cob', 'coordination', 'primary'],
      label: 'coverage',
      value: coverageFact(t),
    },
    {
      keys: ['recommend', 'next action', 'should', 'do next', 'next step'],
      label: 'recommendation',
      value: t.recommendation,
    },
    { keys: ['sla', 'deadline', 'due', 'clock'], label: 'SLA', value: `${t.slaHours}h` },
    {
      keys: ['fair', 'disparate', '1557', 'bias', 'cohort', 'ratio', 'four-fifths', 'parity'],
      label: 'fairness',
      value:
        'A §1557 four-fifths cohort screen; a ratio below 0.80 routes to the Medical Director + Compliance for risk-adjusted review — a cohort statistic, no per-member adverse action.',
    },
    {
      keys: ['part 2', 'part2', 'sud', 'consent', 'segment', 'behavioral', '42 cfr'],
      label: 'part 2 / consent',
      value:
        '42 CFR Part 2 SUD consent & segmentation apply before member-adjacent BH context is surfaced — cited in the RCA.',
    },
    {
      keys: ['rca', 'cause', 'root', 'finding', 'fired', 'evidence'],
      label: 'RCA',
      value: t.rca[0] ?? t.title,
    },
    { keys: ['severity', 'critical', 'priority', 'urgent'], label: 'severity', value: t.severity },
  ];
  const matched = fields.filter((f) => f.keys.some((k) => q.includes(k)));
  const hardTokens = [
    ' not ',
    "n't ",
    ' vs ',
    ' versus ',
    'compare',
    'trend',
    'over time',
    'yesterday',
    'last month',
    'currently',
    ' now ',
    'will ',
    'predict',
    'forecast',
    'right now',
    ' than ',
    'higher',
    'lower',
    'exceed',
    'greater',
    'more than',
    'less than',
    'biggest',
    'largest',
  ];
  if (hardTokens.some((k) => q.includes(k))) {
    return {
      answer: `I can only surface facts on file for this case — I can't evaluate negation, comparisons, trends over time, or current external status, so I won't guess. ${matched[0] ? `The record states: ${matched[0].label} — ${matched[0].value}` : `On file: provider, payer/plan, refs, exposure, authority, recommendation, RCA.`}`,
      matched: matched.map((m) => m.label),
      refused: true,
    };
  }
  if (matched.length === 0) {
    return {
      answer: `I couldn't map that to a field on this record. On file: provider, payer/plan, refs/codes, exposure, Twin-Ladder authority, recommendation, SLA, and the agent RCA — ask about any of those.`,
      matched: [],
      refused: true,
    };
  }
  return {
    answer: `The record states — ${matched
      .slice(0, 3)
      .map((m) => `${m.label}: ${m.value}`)
      .join('  ·  ')}`,
    matched: matched.slice(0, 3).map((m) => m.label),
    refused: false,
  };
}

/* ─────────────────────────── Idle console (no ticket focused) ─────────────────────────── */

function IdleConsole({
  side,
  op,
  onOpenTicket,
}: {
  side: Side;
  recordId: string;
  analyses: WorkbenchAnalysis[];
  op: OperatingSim;
  onOpenTicket?: (seedId: string, side: Side, liveKey?: string) => void;
}): React.ReactElement {
  const mine = useMemo(
    () =>
      op.sim.tickets.filter((t) => {
        const seed = SEED_TICKETS.find((x) => x.id === t.ref);
        return seed && ROLE_SIDE[seed.role] === side && t.status !== 'Closed';
      }),
    [op.sim.tickets, side]
  );

  return (
    <div className="space-y-4">
      {/* Mode A — EXPLORATION: party-specific ready-to-go analyses over the SHARED ledger (payer ≠ provider ≠ neutral).
          The appeal call-to-action is a provider revenue action, so it's only wired for the provider seat. */}
      <AnalystChat
        op={op}
        starters={startersForSide(side)}
        heading={`${side === 'payer' ? 'Payer / MCO' : side === 'provider' ? 'Provider rev-integrity' : 'State oversight'} analyst — explore the book`}
        subheading={`Ready-to-go analyses for the ${side === 'neutral' ? 'State oversight' : side} lens · live over the shared ledger · multi-turn`}
        onAppeal={
          side !== 'provider'
            ? undefined
            : () => {
                const top = [...op.sim.reconLedger]
                  .filter(
                    (r) =>
                      r.reconClass === 'underpayment' &&
                      !r.recoveredUsd &&
                      !op.sim.workflows.some((w) => w.reconSeq === r.seq)
                  )
                  .sort((a, b) => Math.abs(b.deltaUsd) - Math.abs(a.deltaUsd))[0];
                if (top) {
                  op.startAppeal(top.seq);
                  const t = op.sim.tickets.find((x) => x.reconRecordSeq === top.seq);
                  if (t && onOpenTicket) onOpenTicket(t.ref, side, t.key);
                }
              }
        }
      />

      <div className="ed-card p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-50">
          Live tickets in this seat — click to work one
        </p>
        <div className="mt-2 space-y-2">
          {mine.length === 0 && (
            <p className="text-[11px] italic text-carbon-gray-40">
              no live tickets yet — press Play on the flow or Operations
            </p>
          )}
          {mine.map((t) => {
            const seed = SEED_TICKETS.find((x) => x.id === t.ref);
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => onOpenTicket?.(t.ref, side, t.key)}
                className="block w-full rounded border border-carbon-gray-20 p-2 text-left transition hover:border-carbon-blue hover:bg-carbon-blue-lighter"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="mono text-[10px] font-semibold text-carbon-gray-80">
                    {t.key} · {seed ? ROLE_LABEL[seed.role] : t.role}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <StatusBadge label={t.severity} variant={SEV_VARIANT[t.severity]} size="sm" />
                    <span className="text-[10px] font-semibold text-carbon-blue">Open →</span>
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-carbon-gray-90">{t.title}</p>
                {seed &&
                  (() => {
                    const da = displayAuthority(
                      seed.verdict.permittedRung,
                      seed.verdict.requiresHuman,
                      op.sim
                    );
                    return (
                      <div className="mt-0.5">
                        <TwinLadderCodes
                          tier={seed.verdict.evidenceTier}
                          rung={da.capability}
                          human={seed.verdict.requiresHuman}
                          capped={da.capped}
                          now={da.ceiling}
                        />
                      </div>
                    );
                  })()}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
