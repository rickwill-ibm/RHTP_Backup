'use client';

/**
 * PAS preview (the third sibling artifact) — a Da Vinci PAS request Bundle (FHIR 278 equivalent) assembled
 * from the signed-off policy's coverage rules + a SPECIMEN DTR response (no live patient at authoring time).
 * Honestly labeled: this is an authoring preview, not a conformance-tested submission. Thin renderer over
 * the pure `buildPasRequest`.
 */
import { useMemo, useState } from 'react';
import type { CoverageRule } from '@/lib/policy/crd/coverageRule';
import type { QuestionnaireItemDef } from '@/lib/dtr/questionnaireResponse';
import { buildPasRequest } from '@/lib/policy/pas/pasRequest';
import type { FhirClaim } from '@/lib/fhir/types';

export function PasPreviewPanel({
  coverageRules,
  items,
  questionnaireCanonical,
  policyTitle,
  policyId,
}: {
  coverageRules: CoverageRule[];
  items: QuestionnaireItemDef[];
  questionnaireCanonical?: string;
  policyTitle: string;
  policyId: string;
}): React.ReactElement {
  const [showJson, setShowJson] = useState(false);
  const preview = useMemo(
    () =>
      buildPasRequest({
        mode: 'specimen',
        items,
        coverageRules,
        questionnaireCanonical,
        policyTitle,
        policyId,
      }),
    [coverageRules, items, questionnaireCanonical, policyTitle, policyId]
  );
  const entries = preview.bundle.entry ?? [];
  const claim = entries.find((e) => e.resource?.resourceType === 'Claim')?.resource as
    FhirClaim | undefined;
  const paItems = claim?.item ?? [];
  const resourceCounts = entries.reduce<Record<string, number>>((acc, e) => {
    const t = e.resource?.resourceType;
    if (t) acc[t] = (acc[t] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section className="rounded-lg border border-slate-200">
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
        <span className="flex h-6 w-6 items-center justify-center rounded bg-teal-100 text-xs font-bold text-teal-700">
          PAS
        </span>
        <h3 className="text-sm font-semibold">Prior-authorization request</h3>
        <span className="text-xs text-slate-400">Da Vinci PAS Bundle · FHIR 278 equivalent</span>
        <span className="ml-auto rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
          Claim · use=preauthorization
        </span>
      </header>

      {/* Honesty banner — this is a specimen preview, not a real submission. */}
      <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
        Specimen preview — assembled from the authored policy with an empty QuestionnaireResponse
        (no patient). Not a conformance-tested submission; {preview.missingForSubmission.length}{' '}
        item
        {preview.missingForSubmission.length === 1 ? '' : 's'} would need answering before a real
        278.
      </div>

      <div className="grid gap-3 px-4 py-3 sm:grid-cols-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Requested procedures (PA-required)
          </div>
          {paItems.length === 0 ? (
            <p className="mt-1 text-xs text-slate-500">
              No prior-auth-required codes on this policy.
            </p>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {paItems.map((it) => {
                const c = it.productOrService.coding?.[0];
                return (
                  <li key={it.sequence} className="text-xs">
                    <span className="font-mono font-semibold text-slate-800">{c?.code}</span>{' '}
                    <span className="text-slate-500">{c?.display}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Bundled resources (self-contained)
          </div>
          <ul className="mt-1 flex flex-wrap gap-1">
            {Object.entries(resourceCounts).map(([type, n]) => (
              <li
                key={type}
                className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600"
              >
                {type}
                {n > 1 ? ` ×${n}` : ''}
              </li>
            ))}
          </ul>
          <div className="mt-2 text-[11px] text-slate-400">
            supportingInfo → the DTR QuestionnaireResponse (the evidence travels with the request).
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100 px-4 py-2">
        <button
          type="button"
          onClick={() => setShowJson((v) => !v)}
          className="text-xs font-semibold text-teal-700 hover:underline"
        >
          {showJson ? '▾ Hide' : '▸ Show'} FHIR Bundle JSON
        </button>
        {showJson && (
          <pre className="mt-2 max-h-72 overflow-auto rounded bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
            {JSON.stringify(preview.bundle, null, 2)}
          </pre>
        )}
      </div>
    </section>
  );
}
