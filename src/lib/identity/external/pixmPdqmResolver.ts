/**
 * PIXm/PDQm (FHIR) external identity resolver — REAL query/parse logic.
 *
 * Implements the ExternalIdentityResolver seam for the FHIR family:
 *   crossReference   -> PIXm  GET Patient/$ihe-pix (sourceIdentifier -> targetSystem)
 *   demographicQuery -> PDQm  GET Patient?family=&given=&birthdate= (searchset Bundle)
 *
 * The request BUILD + Bundle/Parameters PARSE logic (fhirPixm.ts) is real and
 * always runs. The HTTP send is an injected FhirTransport so the logic is verified
 * against a fake FHIR MPI. Fail-closed rule: an incomplete config OR no wired
 * transport throws ExternalEmpiNotConfiguredError before any work — a config shape
 * alone is not a live MPI, so the default (unwired) resolver still fails loud.
 */
import type { IdentityResolver } from '@/lib/pipeline/types';
import { buildPdqmRequest, buildPixmRequest, parsePdqmResponse, parsePixmResponse } from './fhirPixm';
import {
  ExternalEmpiNotConfiguredError,
  type ExternalIdentityResolver,
  type FhirTransport,
  type PdqQuery,
  type PdqResponse,
  type PixmPdqmConfig,
  type PixQuery,
  type PixResponse,
} from './types';

const PROTOCOL = 'PIXm/PDQm' as const;

/** The FHIR config keys an operator must supply for this family to go live. */
const NEEDS =
  'PIXM_FHIR_BASE_URL, PIXM_ASSIGNING_AUTHORITY_SYSTEM, and auth ' +
  '(PIXM_AUTH_KIND = none|bearer|basic|smart-backend + its credentials) ' +
  '+ a wired FHIR transport (live endpoint is CI-pending)';

function requireConfig(capability: string, config?: PixmPdqmConfig): PixmPdqmConfig {
  if (!config || !config.fhirBaseUrl || !config.assigningAuthoritySystem || !config.auth) {
    throw new ExternalEmpiNotConfiguredError(PROTOCOL, capability, NEEDS);
  }
  return config;
}

function requireTransport(capability: string, transport?: FhirTransport): FhirTransport {
  if (!transport) throw new ExternalEmpiNotConfiguredError(PROTOCOL, capability, NEEDS);
  return transport;
}

/**
 * Construct the PIXm/PDQm resolver. Config and transport are optional so the seam
 * can be selected before a FHIR endpoint exists; every call throws until BOTH a
 * complete config and a wired transport are present. When wired, the real request
 * is built, performed, and the Parameters/Bundle parsed into the seam response.
 */
export function createPixmPdqmResolver(
  config?: PixmPdqmConfig,
  transport?: FhirTransport,
): ExternalIdentityResolver {
  return {
    id: 'external-pixm-pdqm-fhir',
    protocol: PROTOCOL,
    async crossReference(query: PixQuery): Promise<PixResponse> {
      const cfg = requireConfig('PIXm $ihe-pix operation', config);
      const perform = requireTransport('PIXm $ihe-pix operation', transport);
      const request = buildPixmRequest(query, cfg);
      const res = await perform(request);
      return parsePixmResponse(res.status, res.body, cfg.assigningAuthoritySystem);
    },
    async demographicQuery(query: PdqQuery): Promise<PdqResponse> {
      const cfg = requireConfig('PDQm Patient search', config);
      const perform = requireTransport('PDQm Patient search', transport);
      const request = buildPdqmRequest(query, cfg);
      const res = await perform(request);
      return parsePdqmResponse(res.status, res.body, cfg.assigningAuthoritySystem);
    },
  };
}

/** Default PIXm/PDQm resolver with no config/transport (throws until wired). */
export const pixmPdqmResolver: ExternalIdentityResolver = createPixmPdqmResolver();

/**
 * The PIXm/PDQm family as the pipeline's synchronous IdentityResolver seam. A real
 * PIXm call is async; the sync seam fails closed with ExternalEmpiNotConfiguredError
 * (never a default identity — E9). Going live requires a pre-resolution step or an
 * async IdentityResolver (roadmap; see README) that runs crossReference and maps
 * the result through disposition.ts (link vs HELD).
 */
export const pixmPdqmIdentityResolver: IdentityResolver = () => {
  throw new ExternalEmpiNotConfiguredError('PIXm/PDQm', 'pipeline identity resolution', NEEDS);
};
