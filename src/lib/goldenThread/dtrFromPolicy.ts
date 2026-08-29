/** Verbatim copy of the repo's DTR generator, for adversarial validation. */
import type { QuestionnaireItemDef } from '@/lib/dtr/questionnaireResponse';
import type { NormalizedPolicy } from '@/lib/policy';

export interface GeneratedQuestionnaire {
  resourceType: 'Questionnaire';
  url: string;
  status: 'draft';
  title: string;
  derivedFrom: { source: string; policyId: string; number?: string | null; url?: string | null };
  generatedBy: 'deterministic-offline';
  item: QuestionnaireItemDef[];
}

export function generateQuestionnaireFromPolicy(policy: NormalizedPolicy): GeneratedQuestionnaire {
  const item: QuestionnaireItemDef[] = [];

  const indications = policy.indications ?? [];
  indications.forEach((ind, i) => {
    item.push({
      linkId: `indication-${ind.label || i + 1}`,
      text: `Does the member meet indication ${ind.label}: ${ind.title}?`,
      type: 'boolean',
      // Honor the criterion's logic when the mapper supplies it; default false keeps
      // existing flat-indication callers unchanged.
      required: ind.required ?? false,
    });
  });

  if (policy.determinationBasis === 'medical-necessity-criteria') {
    item.push({
      linkId: 'supporting-diagnosis',
      text: 'Supporting ICD-10-CM diagnosis code establishing medical necessity',
      type: 'string',
      format: 'icd10',
      helpText:
        'Format: a letter, two digits, then an optional dot and up to 4 characters (e.g. E66.01).',
      required: true,
    });
  }

  item.push({
    linkId: 'clinical-documentation',
    text: 'Attach clinical documentation supporting medical necessity',
    type: 'attachment',
    helpText: 'Upload the chart note / imaging / lab report that evidences the criteria above.',
    required: true,
  });

  const number = policy.number ?? undefined;
  return {
    resourceType: 'Questionnaire',
    url: `urn:rhtp:dtr:${policy.policyId}`,
    status: 'draft',
    title: `DTR — ${policy.title}`,
    derivedFrom: {
      source: policy.source,
      policyId: policy.policyId,
      number,
      url: policy.url ?? null,
    },
    generatedBy: 'deterministic-offline',
    item,
  };
}
