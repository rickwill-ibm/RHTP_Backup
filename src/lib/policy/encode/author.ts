/**
 * Authoring workflow (RHTP Policy Engine) — the end-to-end orchestration the workbench calls.
 *
 * authorAndPublish: extracted CriteriaPolicy → encode → publish (Questionnaire + CRD rules) into the
 * store the runtime reads. This is the "Generate CRD + DTR" authoring step, made real.
 * runtimeCrd: an incoming PA request (procedure code + patient facts) → the CRD coverage-information
 * the reviewer sees, read FROM the published store (not a seed), with a fail-closed default when the
 * code was never published.
 *
 * Together these close the authoring → publication → runtime loop for any patient / any procedure.
 *
 * Design authority: docs/policy-encoder-spec.md; docs/crd-dtr-pas-remediation-plan.md.
 */
import type { CriteriaPolicy } from '../extract/criteria';
import type { DocRequirement, ProcedureRule } from './ir';
import { encodePolicy } from './encode';
import {
  publishPolicy,
  coverageRuleForCode,
  artifactForCode,
  type PublicationStore,
  type PublishedArtifact,
} from './publish';
import { crdCoverageInformation, type CrdCoverageInformation } from './crd';
import type { PatientFacts } from './evaluate';

export interface AuthorOptions {
  procedures?: ProcedureRule[];
  service?: string;
  documentation?: DocRequirement[];
  now?: () => string;
}

/** Encode and publish a policy; returns the published artifact (Questionnaire + CRD rules + version). */
export function authorAndPublish(
  store: PublicationStore,
  criteria: CriteriaPolicy,
  opts: AuthorOptions = {}
): PublishedArtifact {
  const policyLogic = encodePolicy(criteria, {
    procedures: opts.procedures,
    service: opts.service,
    documentation: opts.documentation,
  });
  return publishPolicy(store, policyLogic, { now: opts.now });
}

export interface RuntimeCrdResult {
  code: string;
  /** true when a rule was found in the published store; false ⇒ fail-closed default was applied. */
  published: boolean;
  coverage: CrdCoverageInformation;
}

/**
 * Runtime CRD for a PA request. Reads the published rule for the code; if none was ever published,
 * returns a fail-closed not-covered coverage-information (never a silent covered default).
 */
export function runtimeCrd(
  store: PublicationStore,
  code: string,
  facts: PatientFacts,
  guidelineId?: string
): RuntimeCrdResult {
  const contested = !guidelineId && (store.codeGuidelines.get(code)?.size ?? 0) > 1;
  const rule = coverageRuleForCode(store, code, guidelineId);
  if (!rule) {
    return {
      code,
      published: false,
      coverage: {
        code,
        coverage: 'not-covered',
        priorAuthRequired: true,
        criteriaNames: [],
        determination: {
          coverage: 'not-covered',
          basis: 'criteria-not-met',
          disposition: 'needs-info',
          unmet: [],
          unknown: [],
          rationale: contested
            ? `Code ${code} is published by more than one guideline; a guideline/plan context is required to determine coverage.`
            : `No coverage rule has been published for ${code}; defaulting to not-covered pending review.`,
        },
      },
    };
  }
  const artifact = artifactForCode(store, code, guidelineId);
  if (!artifact) {
    // rule found but artifact missing should be impossible; fail closed rather than assert.
    return {
      code,
      published: false,
      coverage: {
        code,
        coverage: 'not-covered',
        priorAuthRequired: true,
        criteriaNames: [],
        determination: {
          coverage: 'not-covered',
          basis: 'criteria-not-met',
          disposition: 'needs-info',
          unmet: [],
          unknown: [],
          rationale: `No published artifact for ${code}; defaulting to not-covered pending review.`,
        },
      },
    };
  }
  return {
    code,
    published: true,
    coverage: crdCoverageInformation(artifact.policyLogic, { ...facts, procedureCode: code }),
  };
}
