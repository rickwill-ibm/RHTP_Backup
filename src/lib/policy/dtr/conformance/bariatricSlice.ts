/**
 * Da Vinci CONFORMANCE SLICE — CPT 43775 (laparoscopic sleeve gastrectomy), end to end.
 *
 * Proves the target the current engine can't yet reach: a coded, value-set-bound CRD `coverage-info`
 * card and a DTR R4 `Questionnaire` whose items carry `code` (LOINC/ICD-10/SNOMED/CPT), bind choices
 * to a real `answerValueSet`, pre-populate known facts from the EHR via SDC `initialExpression`, and
 * reveal supporting evidence with `enableWhen`. Deterministic + pure; binds to the curated terminology
 * in `valueSets.ts` (a payer authors the codes; the generator never fabricates them).
 *
 * INVARIANT: the CRD card's questionnaire canonical === the DTR Questionnaire.url (Da Vinci: the CRD
 * card launches exactly this DTR Questionnaire). INVARIANT: every coded item carries a real system.
 */
import {
  SYSTEM,
  VS_YES_NO_UNKNOWN,
  VS_OBESITY_DX,
  VS_COMORBIDITY,
  LOINC_BMI,
  CPT_SLEEVE,
  CRD_CARD_TYPE_COVERAGE_INFO,
  CRD_COVERAGE_PA_REQUIRED,
  CRD_COVERAGE_COVERED,
  type Coding,
} from './valueSets';

const SDC_INITIAL_EXPRESSION =
  'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-initialExpression';

export interface FhirExtension {
  url: string;
  valueExpression?: { language: 'text/fhirpath' | 'text/cql'; expression: string };
}
export interface QItem {
  linkId: string;
  text: string;
  type: 'group' | 'boolean' | 'decimal' | 'choice' | 'attachment' | 'display';
  code?: Coding[];
  required?: boolean;
  readOnly?: boolean;
  answerValueSet?: string;
  enableWhen?: {
    question: string;
    operator: '=';
    answerBoolean?: boolean;
    answerCoding?: Coding;
  }[];
  extension?: FhirExtension[];
  item?: QItem[];
}
export interface DtrQuestionnaire {
  resourceType: 'Questionnaire';
  url: string;
  version: string;
  name: string;
  title: string;
  status: 'active';
  subjectType: ['Patient'];
  code: Coding[];
  item: QItem[];
}

/** CDS Hooks card the CRD service returns (Da Vinci coverage-info pattern). */
export interface CrdCard {
  uuid: string;
  summary: string;
  indicator: 'info' | 'warning' | 'critical';
  detail: string;
  source: { label: string; url?: string };
  cardTypes: Coding[];
  coverage: { classification: Coding[]; priorAuthRequired: boolean; forCode: Coding };
  links: {
    label: string;
    type: 'smart';
    url: string;
    appContext: { questionnaire: string };
  }[];
}

const CANONICAL = 'urn:rhtp:dtr/Questionnaire/bariatric-surgery-sleeve';
const VERSION = '1.0.0';

function prepop(expr: string): FhirExtension[] {
  return [
    { url: SDC_INITIAL_EXPRESSION, valueExpression: { language: 'text/cql', expression: expr } },
  ];
}

/** The DTR Questionnaire for the slice — grouped, coded, value-set-bound, pre-populated. */
export function buildDtrQuestionnaire(): DtrQuestionnaire {
  return {
    resourceType: 'Questionnaire',
    url: CANONICAL,
    version: VERSION,
    name: 'BariatricSurgerySleeveGastrectomy',
    title: 'Bariatric Surgery — Clinical Documentation',
    status: 'active',
    subjectType: ['Patient'],
    code: [CPT_SLEEVE],
    item: [
      {
        linkId: 'clinical-criteria',
        text: 'Clinical criteria',
        type: 'group',
        item: [
          {
            linkId: 'bmi',
            text: 'Body mass index',
            type: 'decimal',
            code: [LOINC_BMI],
            readOnly: true,
            extension: prepop("Observation.where(code.coding.code='39156-5').value"),
          },
          {
            linkId: 'obesity-dx',
            text: 'Obesity diagnosis',
            type: 'choice',
            code: [{ system: SYSTEM.snomed, code: '414916001', display: 'Obesity (disorder)' }],
            answerValueSet: VS_OBESITY_DX.url,
            readOnly: true,
            extension: prepop("Condition.where(code.memberOf('" + VS_OBESITY_DX.url + "'))"),
          },
          {
            linkId: 'comorbidity',
            text: 'Qualifying comorbidity',
            type: 'choice',
            answerValueSet: VS_COMORBIDITY.url,
            readOnly: true,
            extension: prepop("Condition.where(code.memberOf('" + VS_COMORBIDITY.url + "'))"),
          },
        ],
      },
      {
        linkId: 'weight-management',
        text: 'Weight management',
        type: 'group',
        item: [
          {
            linkId: 'supervised-program',
            text: 'Has the patient completed a supervised weight-management program of at least 6 months?',
            type: 'choice',
            required: true,
            answerValueSet: VS_YES_NO_UNKNOWN.url,
          },
        ],
      },
      {
        linkId: 'concurrent-procedures',
        text: 'Concurrent procedures',
        type: 'group',
        item: [
          {
            linkId: 'hiatal-hernia-planned',
            text: 'Is repair of a pre-existing hiatal hernia planned during this procedure?',
            type: 'boolean',
            required: true,
          },
          {
            linkId: 'hiatal-hernia-evidence',
            text: 'Attach imaging or operative note confirming the hiatal hernia',
            type: 'attachment',
            required: true,
            enableWhen: [{ question: 'hiatal-hernia-planned', operator: '=', answerBoolean: true }],
          },
        ],
      },
    ],
  };
}

/** The CRD coverage-info card that launches the DTR Questionnaire above. */
export function buildCrdCard(): CrdCard {
  return {
    uuid: 'crd-bariatric-sleeve-43775',
    summary: 'Prior authorization required',
    indicator: 'warning',
    detail:
      'Laparoscopic sleeve gastrectomy is covered subject to medical-necessity criteria. Complete the DTR documentation to establish medical necessity.',
    source: { label: 'Horizon BCBSNJ', url: 'https://www.horizonblue.com' },
    cardTypes: [CRD_CARD_TYPE_COVERAGE_INFO],
    coverage: {
      classification: [CRD_COVERAGE_COVERED, CRD_COVERAGE_PA_REQUIRED],
      priorAuthRequired: true,
      forCode: CPT_SLEEVE,
    },
    links: [
      {
        label: 'Complete Requirements',
        type: 'smart',
        url: 'https://dtr.rhtp.example/launch',
        // INVARIANT: appContext.questionnaire === the DTR Questionnaire.url this card launches.
        appContext: { questionnaire: CANONICAL },
      },
    ],
  };
}

export const SLICE_CANONICAL = CANONICAL;
