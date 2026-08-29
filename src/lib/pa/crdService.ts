/**
 * CRD service — Coverage Requirements Discovery.
 *
 * Patient-aware (findings C1/C2/C3/H3): the checklist is DERIVED from the member's coverage
 * context + the PUBLISHED coverage rule for the code (`deriveCrdResult`), not a canned mock. Real
 * CDS-Hooks cards from `/api/cds`, when present, refine the determination via `parseCrdCards`.
 * Wired to RHTP's /api/cds BFF route.
 */
import { postJson } from '@/lib/client/bff';
import type { CrdCheckResult } from '@/lib/pa/pa-types';
import { getPatientContext } from '@/lib/pa/patientContext';
import { coverageRuleForCode } from '@/lib/pa/publishedCoverage';
import { deriveCrdResult, parseCrdCards, type CrdCard } from '@/lib/pa/crdDerivation';

export interface RunCrdOptions {
  /** Date of service (eligibility is checked against it). */
  serviceDate?: string;
  /** Ordering provider display, for the network-check detail. */
  orderingProvider?: string;
  /** Explicit in-network signal for the ordering provider (demo: seeded network is verified). */
  orderingProviderInNetwork?: boolean;
}

export async function runCrdChecks(
  patientId: string,
  cptCode: string,
  opts: RunCrdOptions = {}
): Promise<CrdCheckResult> {
  const ctx = getPatientContext(patientId);
  const rule = coverageRuleForCode(cptCode);

  // Try the real CDS-Hooks endpoint; its cards (when present) refine the PA determination.
  let cardSignal;
  try {
    const r = await postJson<{ cards?: CrdCard[] }>('/api/cds', {
      hookId: 'order-sign',
      hookRequest: {
        hook: 'order-sign',
        context: {
          patientId,
          draftOrders: {
            entry: [
              {
                resource: { resourceType: 'ServiceRequest', code: { coding: [{ code: cptCode }] } },
              },
            ],
          },
        },
      },
    });
    if (r.ok && r.data) cardSignal = parseCrdCards(r.data.cards);
  } catch {
    // BFF unreachable — fall through to the context+rule derivation.
  }

  if (!ctx) {
    // No known member context — fail honest: eligibility unverified, PA required by rule.
    return unverifiedCrdResult(cptCode, rule.priorAuthRequired);
  }

  return deriveCrdResult(ctx, cptCode, rule, {
    serviceDate: opts.serviceDate,
    orderingProvider: opts.orderingProvider,
    orderingProviderInNetwork: opts.orderingProviderInNetwork,
    cardSignal,
  });
}

/** Honest placeholder when no member context is resolvable: nothing is asserted as verified. */
function unverifiedCrdResult(cptCode: string, priorAuthRequired: boolean): CrdCheckResult {
  return {
    patientEnrolled: {
      pass: false,
      label: 'Patient Enrolled',
      detail: 'No member context resolved — enrollment unverified',
      source: 'pa',
    },
    patientEligible: {
      pass: false,
      label: 'Patient Eligible',
      detail: 'Eligibility unverified — no coverage on file for this patient',
      source: 'pa',
    },
    providerInNetwork: {
      pass: false,
      label: 'Provider In-Network',
      detail: 'Network status not verified',
      source: 'emr',
    },
    noConflictingGuideline: {
      pass: true,
      label: 'No Conflicting Milliman/InterQual Guideline',
      detail: 'No conflicting guideline identified',
      source: 'guideline',
    },
    paRequired: {
      pass: true,
      required: priorAuthRequired,
      label: 'Prior Authorization Determination',
      detail: priorAuthRequired
        ? `Prior authorization REQUIRED (CPT ${cptCode})`
        : `Prior authorization NOT required (CPT ${cptCode})`,
      source: null,
    },
  };
}
