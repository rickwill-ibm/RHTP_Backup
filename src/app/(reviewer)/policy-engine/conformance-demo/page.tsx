'use client';

/**
 * CONFORMANCE SLICE demo route — renders the coded, value-set-bound CRD + DTR artifacts for the
 * bariatric CPT 43775 vertical directly from the generator, with no policy upload. It exists to
 * verify the target conformance in the browser before the pattern is scaled to the full pipeline.
 */
import {
  buildCrdCard,
  buildDtrQuestionnaire,
  type QItem,
} from '@/lib/policy/dtr/conformance/bariatricSlice';
import {
  VS_YES_NO_UNKNOWN,
  VS_OBESITY_DX,
  VS_COMORBIDITY,
} from '@/lib/policy/dtr/conformance/valueSets';

const VS_BY_URL = Object.fromEntries(
  [VS_YES_NO_UNKNOWN, VS_OBESITY_DX, VS_COMORBIDITY].map((v) => [v.url, v])
);

function CodePill({ system, code }: { system: string; code: string }): React.ReactElement {
  const label = system.includes('loinc')
    ? 'LOINC'
    : system.includes('icd-10')
      ? 'ICD-10'
      : system.includes('snomed')
        ? 'SNOMED'
        : system.includes('cpt')
          ? 'CPT'
          : system.includes('coverage-information')
            ? 'CRD'
            : system.includes('v2-0136')
              ? 'HL7'
              : 'code';
  return (
    <span className="inline-flex items-center gap-1 rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
      <span className="font-semibold text-indigo-600">{label}</span>
      {code}
    </span>
  );
}

function Field({ item }: { item: QItem }): React.ReactElement {
  const vs = item.answerValueSet ? VS_BY_URL[item.answerValueSet] : undefined;
  const prepop = item.extension?.some((e) => /initialExpression/.test(e.url));
  return (
    <div className="border-t border-slate-100 px-4 py-3 first:border-t-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-800">{item.text}</span>
        {item.required && <span className="text-rose-500">*</span>}
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          {(item.code ?? []).map((c) => (
            <CodePill key={c.code} system={c.system} code={c.code} />
          ))}
          {prepop && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
              ✓ pre-populated (EHR)
            </span>
          )}
          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
            {item.type}
          </span>
        </span>
      </div>
      {vs && (
        <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50/50 px-3 py-2">
          <div className="font-mono text-[11px] text-violet-700">answerValueSet · {vs.url}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {vs.concepts.map((c) => (
              <span
                key={c.code}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700"
              >
                {c.display}
                <CodePill system={c.system} code={c.code} />
              </span>
            ))}
          </div>
        </div>
      )}
      {item.enableWhen && (
        <div className="mt-2 font-mono text-[11px] text-slate-500">
          enableWhen · shown when “{item.enableWhen[0].question}” ={' '}
          {String(item.enableWhen[0].answerBoolean)}
        </div>
      )}
    </div>
  );
}

function Group({ group }: { group: QItem }): React.ReactElement {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
        {group.text}
      </div>
      {(group.item ?? []).map((i) => (
        <Field key={i.linkId} item={i} />
      ))}
    </div>
  );
}

export default function ConformanceDemoPage(): React.ReactElement {
  const card = buildCrdCard();
  const q = buildDtrQuestionnaire();
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <header>
        <div className="font-mono text-xs font-semibold uppercase tracking-widest text-indigo-600">
          Da Vinci conformance slice · CPT 43775
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">
          Coded CRD → DTR — sleeve gastrectomy
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Generated from a curated value-set map. Every choice binds to a real{' '}
          <span className="font-mono">answerValueSet</span>; clinical facts carry LOINC / ICD-10 /
          SNOMED codings and pre-populate from the EHR.
        </p>
      </header>

      {/* CRD coverage-info card */}
      <section className="overflow-hidden rounded-xl border border-sky-200">
        <div className="flex flex-wrap items-center gap-2 border-b border-sky-100 bg-sky-50 px-4 py-3">
          <span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-700">CRD</span>
          <span className="text-sm font-semibold text-slate-800">{card.summary}</span>
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
            indicator: {card.indicator}
          </span>
          <span className="ml-auto font-mono text-[11px] text-slate-500">{card.source.label}</span>
        </div>
        <div className="space-y-3 px-4 py-4">
          <p className="text-sm text-slate-600">{card.detail}</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Coverage:</span>
            {card.coverage.classification.map((c) => (
              <span
                key={c.code}
                className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"
              >
                {c.display}
                <CodePill system={c.system} code={c.code} />
              </span>
            ))}
            <CodePill system={card.coverage.forCode.system} code={card.coverage.forCode.code} />
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-600">
            SMART launch → appContext.questionnaire = {card.links[0].appContext.questionnaire}
          </div>
        </div>
      </section>

      {/* DTR Questionnaire */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700">
            DTR
          </span>
          <h2 className="text-sm font-semibold text-slate-800">{q.title}</h2>
          <span className="ml-auto font-mono text-[11px] text-slate-500">{q.url}</span>
        </div>
        {q.item.map((g) => (
          <Group key={g.linkId} group={g} />
        ))}
      </section>

      {/* Raw FHIR for verifiability */}
      <details className="rounded-lg border border-slate-200">
        <summary className="cursor-pointer bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">
          Raw FHIR (Questionnaire + CRD card)
        </summary>
        <pre className="overflow-x-auto bg-slate-900 p-4 text-[11px] leading-relaxed text-slate-100">
          {JSON.stringify({ crdCard: card, questionnaire: q }, null, 2)}
        </pre>
      </details>
    </main>
  );
}
