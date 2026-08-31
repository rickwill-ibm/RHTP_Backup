/**
 * Authoring PAS bridge — types. The third artifact of a CRD → DTR → PAS chain: a Da Vinci PAS (Prior
 * Authorization Support) request Bundle — the FHIR equivalent of an X12 278 — assembled from a policy's
 * coverage rules plus either a real completed DTR QuestionnaireResponse or a labeled SPECIMEN response.
 *
 * BOUNDARY: this is authoring PREVIEW / assembly only. It shares FHIR TYPES with the runtime submission
 * builder (`src/lib/pa/pasBundle.ts`), never its code path. It does NOT transmit an X12 278 to a
 * clearinghouse — that needs infra the payer controls. Deterministic + pure.
 */
import type { QuestionnaireResponse, QuestionnaireItemDef } from '@/lib/dtr/questionnaireResponse';
import type { CoverageRule } from '@/lib/policy/crd/coverageRule';
import type { FhirBundle } from '@/lib/fhir/types';

interface PasRequestBase {
  coverageRules: CoverageRule[];
  questionnaireCanonical?: string;
  policyTitle: string;
  policyId: string;
  baseUrl?: string;
  /** ISO timestamp, injected for determinism. Omitted ⇒ no `Claim.created`. */
  now?: string;
}

export type PasRequestInput =
  | (PasRequestBase & { mode: 'response'; response: QuestionnaireResponse; patientRef: string })
  | (PasRequestBase & { mode: 'specimen'; items: QuestionnaireItemDef[] });

export interface PasRequestPreview {
  bundle: FhirBundle;
  /** True when the QuestionnaireResponse was SYNTHESIZED (no live patient): a preview, not a real
   *  submission. */
  synthesized: boolean;
  /** True only when the davinci-pas profile is asserted (response mode) — never on a specimen, since
   *  we run no conformance validation here. */
  conformanceAsserted: boolean;
  /** Required items still unanswered — what a real submission would have to supply. */
  missingForSubmission: string[];
}
