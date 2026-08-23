/**
 * PIX/PDQ (HL7v2) external identity resolver — REAL query/parse logic.
 *
 * Implements the ExternalIdentityResolver seam for the HL7v2 messaging family:
 *   crossReference  -> PIX  QBP^Q23 / RSP^K23 (Patient Identifier Cross-ref, ITI-9)
 *   demographicQuery-> PDQ  QBP^Q22 / RSP^K22 (Patient Demographics Query, ITI-21)
 *
 * The message BUILD + PARSE logic (hl7v2.ts) is real and always runs. The MLLP
 * wire send is an injected Hl7v2Transport so the logic is verified against a fake
 * MPI. Fail-closed rule: a resolver with an incomplete config OR no transport
 * wired throws ExternalEmpiNotConfiguredError before any work — a config shape
 * alone is not a live MPI, so the default (unwired) resolver still fails loud.
 */
import type { IdentityResolver } from '@/lib/pipeline/types';
import { buildPdqQuery, buildPixQuery, parsePdqResponse, parsePixResponse } from './hl7v2';
import {
  ExternalEmpiNotConfiguredError,
  type ExternalIdentityResolver,
  type Hl7v2Transport,
  type PdqQuery,
  type PdqResponse,
  type PixPdqConfig,
  type PixQuery,
  type PixResponse,
} from './types';

const PROTOCOL = 'PIX/PDQ' as const;

/** The HL7v2 config keys an operator must supply for this family to go live. */
const NEEDS =
  'PIXPDQ_ENDPOINT (MLLP host:port), PIXPDQ_ASSIGNING_AUTHORITY_OID, ' +
  'PIXPDQ_SENDING_APP, PIXPDQ_SENDING_FACILITY, PIXPDQ_RECEIVING_APP, PIXPDQ_RECEIVING_FACILITY ' +
  '+ a wired MLLP transport (live endpoint is CI-pending)';

function requireConfig(capability: string, config?: PixPdqConfig): PixPdqConfig {
  if (
    !config ||
    !config.endpoint ||
    !config.assigningAuthorityOid ||
    !config.sendingApplication ||
    !config.sendingFacility ||
    !config.receivingApplication ||
    !config.receivingFacility
  ) {
    throw new ExternalEmpiNotConfiguredError(PROTOCOL, capability, NEEDS);
  }
  return config;
}

function requireTransport(capability: string, transport?: Hl7v2Transport): Hl7v2Transport {
  if (!transport) throw new ExternalEmpiNotConfiguredError(PROTOCOL, capability, NEEDS);
  return transport;
}

/** Stable non-crypto content hash (djb2, 8 hex) for a deterministic control id. */
function controlIdFor(seed: string): string {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0').toUpperCase();
}

/**
 * Construct the PIX/PDQ resolver. Config and transport are optional so the seam
 * can be selected before an endpoint exists; every call throws until BOTH a
 * complete config and a wired MLLP transport are present. When wired, the real
 * QBP is built, sent, and the RSP parsed into the seam response.
 */
export function createPixPdqResolver(
  config?: PixPdqConfig,
  transport?: Hl7v2Transport,
): ExternalIdentityResolver {
  return {
    id: 'external-pixpdq-hl7v2',
    protocol: PROTOCOL,
    async crossReference(query: PixQuery): Promise<PixResponse> {
      const cfg = requireConfig('PIX cross-reference (QBP^Q23 / RSP^K23)', config);
      const send = requireTransport('PIX cross-reference (QBP^Q23 / RSP^K23)', transport);
      const controlId = controlIdFor(`Q23:${query.sourceAssigningAuthority}:${query.sourcePatientId}`);
      const request = buildPixQuery(query, cfg, controlId);
      const raw = await send(request);
      return parsePixResponse(raw, cfg.assigningAuthorityOid);
    },
    async demographicQuery(query: PdqQuery): Promise<PdqResponse> {
      const cfg = requireConfig('PDQ demographics query (QBP^Q22 / RSP^K22)', config);
      const send = requireTransport('PDQ demographics query (QBP^Q22 / RSP^K22)', transport);
      const t = query.traits;
      const controlId = controlIdFor(`Q22:${t.family ?? ''}:${t.given ?? ''}:${t.birthDate ?? ''}`);
      const request = buildPdqQuery(query, cfg, controlId);
      const raw = await send(request);
      return parsePdqResponse(raw, cfg.assigningAuthorityOid);
    },
  };
}

/** Default PIX/PDQ resolver with no config/transport (throws until wired). */
export const pixPdqResolver: ExternalIdentityResolver = createPixPdqResolver();

/**
 * The PIX/PDQ family as the pipeline's synchronous IdentityResolver seam. A real
 * PIX call is async; the sync seam fails closed with ExternalEmpiNotConfiguredError
 * (never a default identity — E9). Going live requires a pre-resolution step or an
 * async IdentityResolver (roadmap; see README) that runs crossReference and maps
 * the result through disposition.ts (link vs HELD).
 */
export const pixPdqIdentityResolver: IdentityResolver = () => {
  throw new ExternalEmpiNotConfiguredError('PIX/PDQ', 'pipeline identity resolution', NEEDS);
};
