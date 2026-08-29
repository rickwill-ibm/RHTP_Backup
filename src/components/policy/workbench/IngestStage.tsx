'use client';

/**
 * Ingest stage (Step 1) — tenant + upload dropzone, format-detection summary, and demo controls.
 * Extracted from PolicyDtrWorkbench for the size cap; a thin renderer driven entirely by props.
 */
import type { PolicyReview } from '@/lib/policy/policyReview';

export function IngestStage({
  tenant,
  setTenant,
  runExtraction,
  fileName,
  loading,
  error,
  review,
  lastFile,
  onReset,
  onContinue,
}: {
  tenant: string;
  setTenant: (s: string) => void;
  runExtraction: (file: File) => void;
  fileName: string | null;
  loading: boolean;
  error: string | null;
  review: PolicyReview | null;
  lastFile: File | null;
  onReset: () => void;
  onContinue: () => void;
}): React.ReactElement {
  return (
    <>
      <section
        className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) runExtraction(f);
        }}
      >
        <div className="mx-auto mb-3 flex max-w-sm items-center gap-2">
          <label className="whitespace-nowrap text-xs font-medium text-slate-600">Tenant</label>
          <input
            type="text"
            value={tenant}
            onChange={(e) => setTenant(e.target.value)}
            placeholder="e.g. the payer / plan this policy is for"
            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </div>
        <p className="text-sm text-slate-600">
          Drop a payer policy — <span className="font-medium">PDF, Word (.doc/.docx), or RTF</span>{' '}
          — here, or
        </p>
        <label className="mt-2 inline-block cursor-pointer rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
          Choose a file from your computer
          <input
            type="file"
            accept=".pdf,.txt,.doc,.docx,.rtf,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/rtf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) runExtraction(f);
              e.target.value = '';
            }}
          />
        </label>
        {fileName && <p className="mt-2 text-xs text-slate-500">Loaded: {fileName}</p>}
      </section>

      {loading && (
        <p className="text-sm text-slate-600">Extracting policy → building draft DTR review…</p>
      )}
      {error && <p className="text-sm text-rose-700">{error}</p>}

      {review && (
        <section className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 p-4">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Demo</span>
          <button
            type="button"
            onClick={() => {
              if (lastFile) runExtraction(lastFile);
            }}
            disabled={!lastFile || loading}
            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-white disabled:opacity-50"
          >
            ↻ Reprocess this document
          </button>
          <button
            type="button"
            onClick={onReset}
            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-white"
          >
            ⟲ Reset
          </button>
          <button
            type="button"
            disabled={!review.promotable}
            onClick={onContinue}
            className="ml-auto rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Continue to review →
          </button>
        </section>
      )}
    </>
  );
}
