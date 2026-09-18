'use client';
/**
 * AnalystChat — the workbench's analytic conversation. The analyst asks (free-text or a chip); the query
 * RUNS (a visible querying → computing → rendering state, so it never reads as pre-loaded); the answer
 * comes back as a narrative + a live chart + flagged outliers + follow-up questions + (where it applies)
 * a governed action. Multi-turn: follow-ups drill down. Deterministic; intent-matched, not an LLM.
 *
 * CLIENT-SAFE: analytics engine + Chart + shared sim.
 */
import { useCallback, useRef, useState } from 'react';
import {
  runQuery,
  matchQuery,
  queryLabel,
  STARTERS,
  type AnalyticResult,
} from '@/lib/goldenThread/analytics';
import { Chart } from '@/components/goldenThread/charts/Chart';
import type { OperatingSim } from '@/components/goldenThread/flow/useOperatingSim';

type Msg =
  | { role: 'user'; text: string; id: string }
  | { role: 'running'; id: string }
  | { role: 'assistant'; result: AnalyticResult; id: string };

export function AnalystChat({
  op,
  onAppeal,
  starters,
  heading,
  subheading,
}: {
  op: OperatingSim;
  onAppeal?: () => void;
  starters?: string[];
  heading?: string;
  subheading?: string;
}): React.ReactElement {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const seq = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const starterIds = starters && starters.length ? starters : STARTERS;

  const ask = useCallback(
    (raw: string, forcedId?: string) => {
      const text = raw.trim();
      if (!text && !forcedId) return;
      const id = forcedId ?? matchQuery(text);
      const uKey = `u${seq.current++}`,
        rKey = `r${seq.current++}`;
      setMsgs((m) => [
        ...m,
        { role: 'user', text: forcedId ? queryLabel(forcedId) : text, id: uKey },
        { role: 'running', id: rKey },
      ]);
      setInput('');
      window.setTimeout(() => {
        const result = runQuery(op.sim, id);
        setMsgs((m) =>
          m.map((x) => (x.id === rKey && result ? { role: 'assistant', result, id: rKey } : x))
        );
        window.setTimeout(
          () =>
            scrollRef.current?.scrollTo({
              top: scrollRef.current.scrollHeight,
              behavior: 'smooth',
            }),
          30
        );
      }, 620);
    },
    [op.sim]
  );

  return (
    <div className="ed-card flex flex-col p-0" style={{ maxHeight: 620 }}>
      <div className="flex items-center justify-between gap-2 border-b border-carbon-gray-20 px-3 py-2">
        <div>
          <p className="text-[13px] font-semibold text-carbon-gray-90">
            {heading ?? 'Analyst — ask the record'}
          </p>
          <p className="text-[10px] text-carbon-gray-50">
            {subheading ??
              'Runs live over the operating record · returns a chart you can read · multi-turn'}
          </p>
        </div>
        <span className="rounded-full bg-[#eef4fb] px-2 py-0.5 text-[10px] font-semibold text-[#2f6db0]">
          ◆ analytic
        </span>
      </div>

      <div ref={scrollRef} className="min-h-[220px] flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {msgs.length === 0 && (
          <div className="text-[12px] text-carbon-gray-60">
            <p>Ask a question to run an analysis over the record — or start with:</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {starterIds.map((qid) => (
                <button
                  key={qid}
                  type="button"
                  onClick={() => ask('', qid)}
                  className="rounded-full border border-carbon-blue px-2.5 py-1 text-[11px] font-medium text-carbon-blue transition hover:bg-carbon-blue-lighter"
                >
                  {queryLabel(qid)}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m) => {
          if (m.role === 'user')
            return (
              <div key={m.id} className="flex justify-end">
                <span className="max-w-[85%] rounded-lg rounded-br-sm bg-carbon-blue px-3 py-1.5 text-[12px] text-white">
                  {m.text}
                </span>
              </div>
            );
          if (m.role === 'running') return <RunningBubble key={m.id} />;
          return (
            <AssistantMsg
              key={m.id}
              r={m.result}
              onFollowup={(qid) => ask('', qid)}
              onAppeal={onAppeal}
            />
          );
        })}
      </div>

      <div className="border-t border-carbon-gray-20 p-2">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') ask(input);
            }}
            placeholder="Ask… e.g. “show the underpayment cluster” or “which denials get overturned?”"
            className="flex-1 rounded border border-carbon-gray-30 px-2.5 py-1.5 text-[12px] text-carbon-gray-90 outline-none focus:border-carbon-blue"
          />
          <button
            type="button"
            onClick={() => ask(input)}
            className="rounded bg-carbon-blue px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-carbon-blue-hover"
          >
            Ask
          </button>
        </div>
        <p className="mt-1 text-[9px] italic text-carbon-gray-40">
          Deterministic intent-matching over the record (pattern-matched, not an LLM); charts
          labelled real vs illustrative. A wired NLU/agent runtime would answer over the live
          evidence.
        </p>
      </div>
    </div>
  );
}

function RunningBubble(): React.ReactElement {
  return (
    <div className="flex items-center gap-2 text-[11px] text-carbon-gray-60">
      <span className="flex gap-0.5">
        <span
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-carbon-blue"
          style={{ animationDelay: '0ms' }}
        />
        <span
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-carbon-blue"
          style={{ animationDelay: '120ms' }}
        />
        <span
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-carbon-blue"
          style={{ animationDelay: '240ms' }}
        />
      </span>
      <span className="mono">querying the record → computing → rendering chart…</span>
    </div>
  );
}

function AssistantMsg({
  r,
  onFollowup,
  onAppeal,
}: {
  r: AnalyticResult;
  onFollowup: (qid: string) => void;
  onAppeal?: () => void;
}): React.ReactElement {
  const real = r.honest.startsWith('REAL');
  return (
    <div className="max-w-[95%] rounded-lg rounded-bl-sm border border-carbon-gray-20 bg-white p-3">
      <p className="text-[12px] font-semibold text-carbon-gray-90">{r.answer}</p>
      <div className="mt-2 overflow-x-auto">
        <Chart spec={r.chart} />
      </div>
      {r.outliers && (
        <p className="mt-1 text-[11px]">
          <span className="rounded bg-[#fbeae9] px-1.5 py-0.5 text-[10px] font-semibold text-[#b42318]">
            ⚑ {r.outliers}
          </span>
        </p>
      )}
      <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11px] text-carbon-gray-80">
        {r.detail.map((d, i) => (
          <li key={i}>{d}</li>
        ))}
      </ul>
      <p className="mt-1.5 text-[9px] italic" style={{ color: real ? '#0e6027' : '#8a8681' }}>
        {real ? '● ' : ''}
        {r.honest}
      </p>
      {r.action && r.action.kind === 'appeal' && onAppeal && (
        <button
          type="button"
          onClick={onAppeal}
          className="mt-2 rounded bg-carbon-blue px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-carbon-blue-hover"
        >
          {r.action.label} →
        </button>
      )}
      {r.followups.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-carbon-gray-10 pt-2">
          <span className="text-[10px] text-carbon-gray-40">Follow up:</span>
          {r.followups.map((qid) => (
            <button
              key={qid}
              type="button"
              onClick={() => onFollowup(qid)}
              className="rounded-full border border-carbon-gray-30 px-2 py-0.5 text-[10px] text-carbon-gray-70 transition hover:border-carbon-blue hover:text-carbon-blue"
            >
              {queryLabel(qid)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
