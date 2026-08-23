/**
 * External EMPI/MPI identity seam — public surface + resolver-kind selection.
 *
 * The pipeline's identity resolver is chosen by a resolver-KIND config, layered
 * over the existing `identity` dataMode seam:
 *   internal            -> the in-repo match engine (empiResolver) in production,
 *                          the deterministic stub in mock/seeded (current default).
 *   external-pixpdq     -> PIX/PDQ (HL7v2) external EMPI stub.
 *   external-pixm-pdqm  -> PIXm/PDQm (FHIR) external EMPI stub.
 * Internal stays the default so the demo stays green. External kinds resolve to
 * the stubs, which fail loud (ExternalEmpiNotConfiguredError) until wired.
 */
import type { IdentityResolver } from '@/lib/pipeline/types';
import { pixPdqIdentityResolver } from './pixPdqResolver';
import { pixmPdqmIdentityResolver } from './pixmPdqmResolver';

export const IDENTITY_RESOLVER_KINDS = Object.freeze([
  'internal',
  'external-pixpdq',
  'external-pixm-pdqm',
] as const);
export type IdentityResolverKind = (typeof IDENTITY_RESOLVER_KINDS)[number];

const DEFAULT_KIND: IdentityResolverKind = 'internal';

function isKind(v: unknown): v is IdentityResolverKind {
  return typeof v === 'string' && (IDENTITY_RESOLVER_KINDS as readonly string[]).includes(v);
}

// Process-local override, layered above env (tests / ops), never persisted.
const override: { value: IdentityResolverKind | null } = { value: null };

/** Set (or clear, with null) the resolver kind for this process. */
export function setIdentityResolverKind(kind: IdentityResolverKind | null | undefined): void {
  if (kind === null || kind === undefined) {
    override.value = null;
    return;
  }
  if (!isKind(kind)) {
    throw new TypeError(
      `setIdentityResolverKind: invalid kind '${String(kind)}' (valid: ${IDENTITY_RESOLVER_KINDS.join(', ')})`,
    );
  }
  override.value = kind;
}

function readEnvKind(): IdentityResolverKind | undefined {
  if (typeof process === 'undefined' || !process.env) return undefined;
  const raw = process.env.IDENTITY_RESOLVER_KIND?.toLowerCase();
  return isKind(raw) ? raw : undefined;
}

/** The effective resolver kind: session override, then env, then default. */
export function identityResolverKind(): IdentityResolverKind {
  return override.value ?? readEnvKind() ?? DEFAULT_KIND;
}

/**
 * The IdentityResolver for an external kind, or null for `internal` (the caller
 * keeps its internal selection). External resolvers throw until configured.
 */
export function externalIdentityResolverFor(kind: IdentityResolverKind): IdentityResolver | null {
  switch (kind) {
    case 'external-pixpdq':
      return pixPdqIdentityResolver;
    case 'external-pixm-pdqm':
      return pixmPdqmIdentityResolver;
    default:
      return null;
  }
}

export type {
  ExternalIdentityProtocol,
  ExternalIdentityResolver,
  ExternalDemographicTraits,
  ExternalPatientIdentifier,
  PixQuery,
  PixResponse,
  CrossReferenceStatus,
  PdqQuery,
  PdqResponse,
  PdqCandidate,
  PixPdqConfig,
  PixmPdqmConfig,
  PixmPdqmAuth,
  Hl7v2Transport,
  FhirTransport,
  FhirTransportRequest,
  FhirTransportResponse,
} from './types';
export { ExternalEmpiNotConfiguredError } from './types';
export { createPixPdqResolver, pixPdqResolver, pixPdqIdentityResolver } from './pixPdqResolver';
export {
  createPixmPdqmResolver,
  pixmPdqmResolver,
  pixmPdqmIdentityResolver,
} from './pixmPdqmResolver';

// ── Real query/parse logic surface (Wave B: external EMPI made real) ─────────
export {
  buildPixQuery,
  buildPdqQuery,
  parsePixResponse,
  parsePdqResponse,
  parseEr7,
  parseCx,
  encodeCx,
} from './hl7v2';
export {
  buildPixmRequest,
  buildPdqmRequest,
  parsePixmResponse,
  parsePdqmResponse,
} from './fhirPixm';
export {
  decideCrossReference,
  decideDemographic,
  type ExternalDisposition,
  type ExternalOutcome,
} from './disposition';
