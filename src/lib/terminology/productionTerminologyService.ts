/**
 * Production TerminologyService — HONEST STUB.
 *
 * Every method throws TerminologyServiceNotConfiguredError naming the FHIR
 * terminology operations a real server must expose. Selected for the
 * `terminology` seam in production mode. When wired, replace the throws with
 * fetch() to the configured terminology server:
 *   validateCode -> CodeSystem/$validate-code
 *   translate    -> ConceptMap/$translate
 *   classify     -> ValueSet/$expand (+ membership) / an HCC grouping service
 */
import {
  TerminologyServiceNotConfiguredError,
  type ClassificationResult,
  type CodeValidation,
  type TerminologyService,
  type TranslationResult,
} from './types';

export const productionTerminologyService: TerminologyService = {
  id: 'production-terminology-server',
  validateCode(): CodeValidation {
    throw new TerminologyServiceNotConfiguredError('$validate-code');
  },
  translate(): TranslationResult {
    throw new TerminologyServiceNotConfiguredError('$translate');
  },
  classify(): ClassificationResult {
    throw new TerminologyServiceNotConfiguredError('classify (ValueSet $expand / HCC grouping)');
  },
};
