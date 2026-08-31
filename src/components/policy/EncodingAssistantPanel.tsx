'use client';

/**
 * Encoding assistant rail (policy-coding-specialist facing).
 *
 * A document-grounded Q&A the reviewer uses during encoding. It POSTs the question + the current
 * review to `/api/policy/assistant`, which runs the seam: a deterministic grounded-retrieval answer
 * offline, or an LLM at temperature 0 grounded in THIS policy + the coding map when configured. All
 * answer logic + the citation contract live in the tested `@/lib/policy/assistant/encodingAssistant`
 * module; this is a thin renderer. Type-only import keeps the server seam out of the client bundle.
 */
import { useEffect, useRef, useState } from 'react';
import type { PolicyReview } from '@/lib/policy/policyReview';
import type { AssistantAnswer, AssistantCitation } from '@/lib/policy/assistant/encodingAssistant';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  citations?: AssistantCitation[];
  grounded?: boolean;
  source?: string;
}

function buildSuggestions(review: PolicyReview): string[] {
  const out: string[] = [];
  const firstCode =
    review.guidelineCodes?.[0]?.code ??
    review.productSections?.[0]?.procedures?.[0]?.codes?.[0]?.code;
  const firstSection = review.criteriaSections?.[0]?.criteria?.[0]?.label;
  if (firstCode) out.push(`Why was ${firstCode} extracted?`);
  if (firstSection) out.push(`Explain criterion ${firstSection}`);
  if (firstCode) out.push(`What coverage role should ${firstCode} map to?`);
  return out.slice(0, 3);
}

export function EncodingAssistantPanel({
  review,
  seededQuestion,
}: {
  review: PolicyReview | null;
  /** When set (from a review-row "Explain <code>" click), the assistant asks about that code. The
   *  nonce lets the same code be re-asked. */
  seededQuestion?: { code: string; nonce: number };
}): React.ReactElement {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  // "Bring your own key" — the endpoint + key the demonstrator supplies to enable the live LLM.
  // SESSION-ONLY: held in memory for this tab, sent per-request to our own BFF, never written to
  // storage and never logged. Cleared on refresh (re-enter each session) or by Disconnect.
  const [aiCfg, setAiCfg] = useState<{ endpoint: string; apiKey: string } | null>(null);
  const [epInput, setEpInput] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [showConfig, setShowConfig] = useState(false);

  const suggestions = review ? buildSuggestions(review) : [];

  function enableAssistant(): void {
    const endpoint = epInput.trim();
    const apiKey = keyInput.trim();
    if (!endpoint || !apiKey) return;
    setAiCfg({ endpoint, apiKey });
    setKeyInput(''); // don't retain the secret in an input's state once applied
    setShowConfig(false);
  }
  function disconnectAssistant(): void {
    setAiCfg(null);
    setEpInput('');
    setKeyInput('');
  }

  async function ask(question: string): Promise<void> {
    const q = question.trim();
    if (!q || !review || busy) return;
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch('/api/policy/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, review, assistantConfig: aiCfg ?? undefined }),
      });
      const a = (await res.json()) as AssistantAnswer;
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          text: a.text ?? '(no answer)',
          citations: a.citations,
          grounded: a.grounded,
          source: a.source,
        },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          text: 'The assistant is unavailable right now.',
          grounded: false,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  // Keep a ref to the latest `ask` so the seed effect fires with current review/config without
  // depending on `ask` (which changes every render) — that would otherwise re-fire on every message.
  const askRef = useRef(ask);
  useEffect(() => {
    askRef.current = ask;
  });
  // Fire ONLY when the seed nonce changes (a new "Explain <code>" click) — never on message updates.
  useEffect(() => {
    if (seededQuestion) void askRef.current(`Explain ${seededQuestion.code}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seededQuestion?.nonce]);

  return (
    <aside className="flex h-full flex-col rounded-lg border border-slate-200 bg-slate-50">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <span
              className={`h-2 w-2 rounded-full ring-2 ${
                aiCfg ? 'bg-emerald-500 ring-emerald-100' : 'bg-slate-400 ring-slate-200'
              }`}
            />
            Encoding Assistant
          </h3>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                aiCfg ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
              }`}
              title={
                aiCfg
                  ? 'Live LLM enabled with your endpoint + key (session only)'
                  : 'Deterministic grounded retrieval — runs offline'
              }
            >
              {aiCfg ? 'Live LLM · your key' : 'Deterministic · offline'}
            </span>
            <button
              type="button"
              onClick={() => setShowConfig((s) => !s)}
              className="rounded border border-slate-300 px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-white"
            >
              {aiCfg ? 'Change' : 'Connect'}
            </button>
          </div>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-slate-500">
          temp 0 (deterministic) · grounded in <b>this policy + the coding map</b> · cites every
          source · never invents criteria
        </p>
      </div>

      {(showConfig || !aiCfg) && (
        <div className="border-b border-slate-200 bg-white px-4 py-3">
          <p className="text-[11px] font-semibold text-slate-700">
            Step 1 — Connect your model{' '}
            <span className="font-normal text-slate-400">(optional)</span>
          </p>
          <p className="mt-0.5 text-[10px] leading-snug text-slate-500">
            Enter an endpoint + Anthropic API key to run the live assistant. Held in memory for this
            session only — never saved or logged. Skip to use the offline deterministic assistant.
          </p>
          <div className="mt-2 space-y-1.5">
            <input
              type="text"
              value={epInput}
              onChange={(e) => setEpInput(e.target.value)}
              placeholder="AI_CODING_ENDPOINT — e.g. https://…/v1/messages"
              className="w-full rounded border border-slate-300 px-2 py-1 text-[11px]"
            />
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              autoComplete="off"
              placeholder="ANTHROPIC_API_KEY"
              className="w-full rounded border border-slate-300 px-2 py-1 text-[11px] font-mono"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!epInput.trim() || !keyInput.trim()}
                onClick={enableAssistant}
                className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                Enable assistant
              </button>
              {aiCfg && (
                <button
                  type="button"
                  onClick={disconnectAssistant}
                  className="rounded border border-slate-300 px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                >
                  Disconnect
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs leading-relaxed text-slate-600 shadow-sm">
            {review
              ? 'Ask about a code, a criterion, or how a code resolves in the coding map. I answer only from this policy and the coding map, and cite the span.'
              : 'Load a policy to begin — I answer questions grounded in the document under review.'}
          </div>
        )}
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div
              key={i}
              className="ml-auto max-w-[90%] rounded-lg rounded-br-sm bg-blue-600 px-3 py-2 text-xs text-white"
            >
              {m.text}
            </div>
          ) : (
            <div
              key={i}
              className="mr-auto max-w-[92%] rounded-lg rounded-bl-sm border border-slate-200 bg-white px-3 py-2.5 text-xs leading-relaxed text-slate-700 shadow-sm"
            >
              {m.text}
              {m.citations && m.citations.length > 0 && (
                <span className="mt-2 block rounded bg-blue-50 px-2 py-1 font-mono text-[10px] text-blue-700">
                  ↗ source · {m.citations.map((c) => c.ref).join(' · ')}
                </span>
              )}
              {m.grounded === false && (
                <span className="mt-1.5 block text-[10px] italic text-amber-600">
                  not anchored to a cited span
                </span>
              )}
            </div>
          )
        )}
        {busy && <div className="text-[11px] italic text-slate-400">thinking…</div>}
      </div>

      {suggestions.length > 0 && messages.length === 0 && (
        <div className="space-y-1.5 px-4 pb-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void ask(s)}
              className="w-full rounded-full border border-transparent bg-blue-50 px-3 py-1.5 text-left text-[11px] text-blue-700 hover:border-blue-300"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-slate-200 bg-white px-3 py-2.5">
        <input
          type="text"
          value={input}
          disabled={!review || busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void ask(input);
          }}
          placeholder={review ? 'Ask about this policy…' : 'Load a policy first'}
          className="flex-1 rounded border border-slate-300 px-2.5 py-1.5 text-xs disabled:bg-slate-50"
        />
        <button
          type="button"
          disabled={!review || busy || !input.trim()}
          onClick={() => void ask(input)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-blue-600 text-white disabled:opacity-40"
          aria-label="Send"
        >
          ↑
        </button>
      </div>
    </aside>
  );
}

export default EncodingAssistantPanel;
