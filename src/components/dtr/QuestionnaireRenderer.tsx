'use client';

import { useState } from 'react';
import {
  buildQuestionnaireResponse,
  isItemActive,
  isItemAnswerValid,
  type QuestionnaireItemDef,
  type AnswerValue,
  type QuestionnaireResponse,
} from '@/lib/dtr/questionnaireResponse';

/**
 * Native DTR questionnaire renderer (plan Slice 4 / blueprint §6.4).
 * Renders a typed questionnaire, accepts prepopulated answers, emits a QuestionnaireResponse.
 *
 * Typed inputs — the Generate stage is not a free-text form: booleans render as checkboxes,
 * `choice` as radios, `decimal`/`integer` as numeric fields, `attachment` as a real file upload,
 * and a `string` with `format:'icd10'` validates the code inline so arbitrary text can't be
 * submitted. `enableWhen` hides items whose gate is unmet. Required + format errors block submit.
 */
export function QuestionnaireRenderer({
  items,
  prepopulated,
  questionnaireCanonical,
  patientRef,
  onComplete,
}: {
  items: QuestionnaireItemDef[];
  prepopulated?: Record<string, AnswerValue>;
  questionnaireCanonical?: string;
  patientRef?: string;
  onComplete?: (qr: QuestionnaireResponse) => void;
}): React.ReactElement {
  const [answers, setAnswers] = useState<Record<string, AnswerValue | undefined>>(
    prepopulated ?? {}
  );
  const [missing, setMissing] = useState<string[]>([]);
  const [invalid, setInvalid] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);

  function set(linkId: string, value: AnswerValue | undefined): void {
    setAnswers((a) => ({ ...a, [linkId]: value }));
  }

  function submit(): void {
    const res = buildQuestionnaireResponse({
      questionnaireCanonical,
      patientRef,
      items,
      answers,
      complete: true,
    });
    setMissing(res.missingRequired);
    setInvalid(res.invalid);
    setSubmitted(true);
    if (res.missingRequired.length === 0 && res.invalid.length === 0) onComplete?.(res.response);
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {items.map((item) => {
        if (!isItemActive(item, answers)) return null;
        const val = answers[item.linkId];
        const isMissing = missing.includes(item.linkId);
        // Live format feedback for typed fields (e.g. ICD-10), plus whatever the last submit flagged.
        const isInvalid =
          invalid.includes(item.linkId) || (submitted && !isItemAnswerValid(item, val));
        const id = `q-${item.linkId}`;
        const errBorder = isMissing || isInvalid ? 'border-red-400' : 'border-slate-300';
        return (
          <div key={item.linkId} className="space-y-1">
            <label htmlFor={id} className="block text-sm font-medium">
              {item.text}
              {item.required ? <span className="text-red-600"> *</span> : null}
            </label>
            {item.helpText ? <p className="text-xs text-slate-500">{item.helpText}</p> : null}

            {item.type === 'boolean' ? (
              <input
                id={id}
                type="checkbox"
                checked={Boolean(val)}
                onChange={(e) => set(item.linkId, e.target.checked)}
              />
            ) : item.type === 'attachment' ? (
              <div className="space-y-1">
                <input
                  id={id}
                  type="file"
                  className="block w-full text-sm text-slate-600 file:mr-3 file:rounded file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
                  onChange={(e) => set(item.linkId, e.target.files?.[0]?.name ?? '')}
                  aria-invalid={isMissing}
                />
                {val ? <p className="text-xs text-emerald-700">Attached: {String(val)}</p> : null}
              </div>
            ) : item.type === 'choice' && item.answerOption ? (
              <div className="space-y-1" role="radiogroup" aria-labelledby={id}>
                {item.answerOption.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={id}
                      value={opt.value}
                      checked={String(val ?? '') === opt.value}
                      onChange={() => set(item.linkId, opt.value)}
                    />
                    {opt.label ?? opt.value}
                  </label>
                ))}
              </div>
            ) : (
              <input
                id={id}
                type={
                  item.type === 'integer' || item.type === 'decimal'
                    ? 'number'
                    : item.type === 'date'
                      ? 'date'
                      : 'text'
                }
                step={item.type === 'decimal' ? 'any' : undefined}
                inputMode={item.type === 'decimal' ? 'decimal' : undefined}
                value={val === undefined ? '' : String(val)}
                onChange={(e) =>
                  set(
                    item.linkId,
                    item.type === 'integer' || item.type === 'decimal'
                      ? e.target.value === ''
                        ? undefined
                        : Number(e.target.value)
                      : e.target.value
                  )
                }
                className={`w-full rounded border px-2 py-1 text-sm ${errBorder}`}
                aria-invalid={isMissing || isInvalid}
              />
            )}

            {isMissing ? <p className="text-xs text-red-600">Required</p> : null}
            {isInvalid && !isMissing ? (
              <p className="text-xs text-red-600">
                {item.format === 'icd10'
                  ? 'Enter a valid ICD-10-CM code (e.g. E66.01).'
                  : 'Invalid value.'}
              </p>
            ) : null}
          </div>
        );
      })}
      <button
        type="submit"
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white"
      >
        Complete documentation
      </button>
    </form>
  );
}

export default QuestionnaireRenderer;
