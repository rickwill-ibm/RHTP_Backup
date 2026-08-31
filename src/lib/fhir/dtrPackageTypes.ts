/**
 * DTR package resource types — Questionnaire / ValueSet / Library (FHIR R4, partial).
 * Split out of `types.ts` for the file-size cap; re-exported from there so importers are unchanged.
 * Only the fields the DTR authoring + CRD→DTR→PAS flow consume.
 */
import type { FhirResource, FhirCoding, FhirCodeableConcept, FhirExtension } from './types';

export type FhirPublicationStatus = 'draft' | 'active' | 'retired' | 'unknown';

export interface FhirQuestionnaireEnableWhen {
  question: string;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'exists';
  answerBoolean?: boolean;
  answerDecimal?: number;
  answerInteger?: number;
  answerString?: string;
  answerCoding?: FhirCoding;
}

export interface FhirQuestionnaireAnswerOption {
  valueCoding?: FhirCoding;
  valueString?: string;
  valueInteger?: number;
}

export type FhirQuestionnaireItemType =
  | 'group'
  | 'boolean'
  | 'decimal'
  | 'integer'
  | 'date'
  | 'dateTime'
  | 'string'
  | 'text'
  | 'choice'
  | 'open-choice'
  | 'attachment'
  | 'quantity'
  | 'reference'
  // Non-answerable section header (used to title each medical-necessity determination pathway).
  | 'display';

export interface FhirQuestionnaireItem {
  linkId: string;
  text?: string;
  type: FhirQuestionnaireItemType;
  required?: boolean;
  repeats?: boolean;
  readOnly?: boolean;
  code?: FhirCoding[];
  answerValueSet?: string;
  answerOption?: FhirQuestionnaireAnswerOption[];
  enableWhen?: FhirQuestionnaireEnableWhen[];
  enableBehavior?: 'all' | 'any';
  extension?: FhirExtension[];
  item?: FhirQuestionnaireItem[];
}

export interface FhirQuestionnaire extends FhirResource {
  resourceType: 'Questionnaire';
  url?: string;
  version?: string;
  name?: string;
  title?: string;
  status: FhirPublicationStatus;
  experimental?: boolean;
  subjectType?: string[];
  date?: string;
  publisher?: string;
  description?: string;
  code?: FhirCoding[];
  item?: FhirQuestionnaireItem[];
}

export interface FhirValueSetConcept {
  code: string;
  display?: string;
}

export interface FhirValueSet extends FhirResource {
  resourceType: 'ValueSet';
  url?: string;
  version?: string;
  name?: string;
  title?: string;
  status: FhirPublicationStatus;
  compose?: { include?: Array<{ system: string; concept?: FhirValueSetConcept[] }> };
}

export interface FhirLibrary extends FhirResource {
  resourceType: 'Library';
  url?: string;
  version?: string;
  name?: string;
  title?: string;
  status: FhirPublicationStatus;
  experimental?: boolean;
  type?: FhirCodeableConcept;
  content?: Array<{ contentType: string; data?: string; url?: string }>;
}
