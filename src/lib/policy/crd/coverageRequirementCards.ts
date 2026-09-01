/**
 * coverageRequirementCards.ts — the SINGLE source of CRD (Coverage Requirements
 * Discovery) coverage cards.
 *
 * Consumed by BOTH CRD surfaces so their card content/shape cannot drift (E15 parity):
 *   - the /api/cds client mock  (devCrdCards → buildCrdCards)
 *   - the hosted /api/cds-hooks/order-select CDS Hooks service (buildCrdCards)
 *
 * SAFETY (coverage services fail CLOSED): a coverage service that cannot determine
 * requirements must NEVER return an empty card list — to an EHR, an empty CRD response
 * reads as "no prior authorization needed". `crdIndeterminateCards()` is the fail-closed
 * card every error / unknown-context path must emit instead of `[]`.
 *
 * SCOPE / honesty: this produces CDS Hooks-conformant coverage *advisory cards*. It does
 * NOT emit Da Vinci CRD `coverage-information` system-actions and is not validated against
 * the Da Vinci CRD card/system-action profiles.
 *
 * PHI/injection: `procedureName` is taken from STRUCTURED coding display only, never from
 * order free-text (`code.text` / `note`) — clinician free-text is attacker-influenced and
 * may carry PHI or markdown, so it is never echoed into a card.
 */
import type { CdsCard } from '@/lib/server/cdsClient';

/** A CDS Hooks-shaped coverage card: CdsCard + the fields a hosted service must carry. */
export interface CrdCoverageCard extends CdsCard {
  uuid: string;
  indicator: 'info' | 'warning' | 'critical';
  source: { label: string; url?: string };
}

export interface CrdCoverageInput {
  procedureName: string;
  cptCode: string;
  /** Documentation (DTR) link target. Default: the in-app prior-auth workspace. */
  documentationUrl?: string;
}

/** Deterministic-id seam so responses are stable/idempotent and byte-assertable in tests. */
export interface CrdProducerSeams {
  idFor?: (role: string, key: string) => string;
}

const SOURCE_LABEL = 'RHTP Coverage Requirements';
const DOC_URL_DEFAULT = '/prior-auth';
const CPT_SYSTEM = 'http://www.ama-assn.org/go/cpt';

/** Stable id: identical input → identical uuid (idempotent retries, testable). */
function defaultId(role: string, key: string): string {
  return `crd-${role}-${key}`;
}

/**
 * The coverage-card producer. Pure + deterministic. PA-required is `critical`
 * (the platform's established CRD contract); the covered alternative is `info`.
 */
export function buildCrdCards(
  input: CrdCoverageInput,
  seams: CrdProducerSeams = {}
): CrdCoverageCard[] {
  const idFor = seams.idFor ?? defaultId;
  const cpt = input.cptCode;
  const url = input.documentationUrl ?? DOC_URL_DEFAULT;
  return [
    {
      uuid: idFor('pa-required', cpt),
      summary: `Prior authorization required: ${input.procedureName} (CPT ${cpt})`,
      indicator: 'critical',
      detail: `Payer coverage policy requires documentation review. Complete the DTR questionnaire to proceed with ${input.procedureName}.`,
      source: { label: SOURCE_LABEL },
      links: [{ label: 'Open documentation (DTR)', url, type: 'smart' }],
    },
    {
      uuid: idFor('alternative', cpt),
      summary: 'Alternative covered without prior authorization — see policy',
      indicator: 'info',
      source: { label: SOURCE_LABEL },
    },
  ];
}

/**
 * FAIL-CLOSED card. A coverage service that cannot determine requirements returns THIS,
 * never `[]`. Emitted for: unknown/missing patient, no structured order to evaluate, or
 * any error while deriving coverage.
 */
export function crdIndeterminateCards(seams: CrdProducerSeams = {}): CrdCoverageCard[] {
  const idFor = seams.idFor ?? defaultId;
  return [
    {
      uuid: idFor('indeterminate', 'none'),
      summary:
        'Coverage requirements could not be determined — verify prior authorization manually',
      indicator: 'warning',
      detail:
        'The coverage service could not evaluate this order (unrecognized patient/context or a system error). Do NOT assume prior authorization is unnecessary — verify PA requirements through the standard payer channel before proceeding.',
      source: { label: SOURCE_LABEL },
      links: [{ label: 'Prior authorization', url: DOC_URL_DEFAULT, type: 'smart' }],
    },
  ];
}

/** A minimal view of a FHIR order resource carried in a CDS Hooks draftOrders bundle. */
export interface DraftOrderResource {
  id?: string;
  resourceType?: string;
  code?: {
    text?: string;
    coding?: { system?: string; code?: string; display?: string }[];
  };
}

/**
 * Resolve a coverage input from an order resource using STRUCTURED coding only.
 * Prefers a CPT-system coding; falls back to any coding that carries a code.
 * Returns null when there is no structured code (→ caller must fail closed; it must NOT
 * fall back to a demo scenario, which would surface a wrong-patient coverage card).
 */
export function crdInputFromOrder(
  resource: DraftOrderResource | undefined
): CrdCoverageInput | null {
  const coding = resource?.code?.coding ?? [];
  const cptCoding =
    coding.find((c) => c.system === CPT_SYSTEM && c.code) ?? coding.find((c) => c.code);
  if (!cptCoding?.code) return null;
  const procedureName = cptCoding.display?.trim() || `CPT ${cptCoding.code}`;
  return { cptCode: cptCoding.code, procedureName };
}
