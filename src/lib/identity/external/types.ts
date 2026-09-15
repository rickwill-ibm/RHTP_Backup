/**
 * External EMPI/MPI identity seam — protocol types (Iteration 4 external seam).
 *
 * The internal resolver (empiResolver.ts) runs the in-repo match engine. Many
 * production deployments instead defer identity to an ENTERPRISE MPI/EMPI over
 * IHE identity profiles. Two protocol families cover the field:
 *
 *   PIX/PDQ   — HL7v2 messaging. PIX = Patient Identifier Cross-referencing
 *               (QBP^Q23 / RSP^K23): given a patient id in one assigning
 *               authority, return the id(s) in others + the enterprise id. PDQ =
 *               Patient Demographics Query (QBP^Q22 / RSP^K22): given demographic
 *               traits, return candidate patients.
 *   PIXm/PDQm — the FHIR restatement. PIXm = the $ihe-pix operation on Patient.
 *               PDQm = a Patient search (?family=&birthdate=...) returning a
 *               Bundle of candidates.
 *
 * Both families implement ONE seam (ExternalIdentityResolver): a cross-reference
 * call (PIX / PIXm) and a demographics call (PDQ / PDQm). Only the wire encoding
 * differs. An external EMPI returns an ENTERPRISE / GLOBAL id; that id becomes
 * the anchored member id the rest of the pipeline uses (see README).
 *
 * These are STUB TYPES + SEAMS. The adapters throw ExternalEmpiNotConfiguredError
 * until a real endpoint is wired (repo fail-loud pattern).
 */

/** The two IHE identity protocol families this seam expresses. */
export type ExternalIdentityProtocol = 'PIX/PDQ' | 'PIXm/PDQm';

/** PHI-minimal demographic traits carried into a PDQ / PDQm query. */
export interface ExternalDemographicTraits {
  family?: string;
  given?: string;
  birthDate?: string; // YYYY-MM-DD
  gender?: 'male' | 'female' | 'other' | 'unknown';
  /** Domain-scoped identifiers already known (e.g. an MRN in an assigning authority). */
  identifiers?: ExternalPatientIdentifier[];
}

/** A patient identifier scoped to one assigning authority (OID or FHIR system). */
export interface ExternalPatientIdentifier {
  /** Assigning-authority OID (HL7v2 CX.4) or FHIR Identifier.system. */
  assigningAuthority: string;
  value: string;
}

// ── PIX / PIXm cross-reference ────────────────────────────────────────────────

/** PIX / PIXm query: resolve a source patient id to the enterprise + peer ids. */
export interface PixQuery {
  /** The patient id to cross-reference. */
  sourcePatientId: string;
  /** OID (PIX) or system uri (PIXm) of the id's assigning authority. */
  sourceAssigningAuthority: string;
  /** Restrict the returned domains; empty/undefined = all known domains. */
  targetAssigningAuthorities?: string[];
}

export type CrossReferenceStatus = 'resolved' | 'ambiguous' | 'not-found';

/** PIX / PIXm response: the enterprise id + the peer-domain cross references. */
export interface PixResponse {
  status: CrossReferenceStatus;
  /** The enterprise / global id — becomes the anchored member id when resolved. */
  enterpriseId: string;
  /** Assigning authority (OID / system) that owns the enterprise id. */
  enterpriseAssigningAuthority: string;
  /** The same person's id in each requested peer domain. */
  crossReferences: ExternalPatientIdentifier[];
}

// ── PDQ / PDQm demographics query ─────────────────────────────────────────────

/** PDQ / PDQm query: candidate patients matching demographic traits. */
export interface PdqQuery {
  traits: ExternalDemographicTraits;
  /** Cap on candidates returned by the responder. */
  maxResults?: number;
}

/** One PDQ / PDQm candidate: an enterprise id + the responder's match score. */
export interface PdqCandidate {
  enterpriseId: string;
  enterpriseAssigningAuthority: string;
  traits: ExternalDemographicTraits;
  /** Responder-supplied confidence 0-100 (RSP QRI-1 / FHIR search score). */
  confidence: number;
}

export interface PdqResponse {
  candidates: PdqCandidate[];
}

// ── The seam ──────────────────────────────────────────────────────────────────

/**
 * One external identity resolver, whichever protocol family backs it. The two
 * calls map 1:1 onto PIX+PDQ (HL7v2) and PIXm+PDQm (FHIR).
 */
export interface ExternalIdentityResolver {
  readonly id: string;
  readonly protocol: ExternalIdentityProtocol;
  /** PIX / PIXm: cross-reference a source id to the enterprise + peer ids. */
  crossReference(query: PixQuery): Promise<PixResponse>;
  /** PDQ / PDQm: demographics query returning candidate patients. */
  demographicQuery(query: PdqQuery): Promise<PdqResponse>;
}

// ── Config shapes each family needs to go live ───────────────────────────────

/** HL7v2 PIX/PDQ endpoint config (MLLP / HL7v2-over-MLLP or a v2 web gateway). */
export interface PixPdqConfig {
  /** MLLP host:port or gateway URL of the PIX/PDQ manager. */
  endpoint: string;
  /** OID of the assigning authority this app queries under (CX.4 / MSH). */
  assigningAuthorityOid: string;
  /** MSH-3 sending application. */
  sendingApplication: string;
  /** MSH-4 sending facility. */
  sendingFacility: string;
  /** MSH-5 receiving application (the PIX/PDQ manager). */
  receivingApplication: string;
  /** MSH-6 receiving facility. */
  receivingFacility: string;
  /** HL7v2 encoding; default ER7 (pipe-and-hat). */
  encoding?: 'ER7' | 'XML';
}

/** FHIR PIXm/PDQm endpoint config. */
export interface PixmPdqmConfig {
  /** Base URL of the FHIR server exposing $ihe-pix + Patient search. */
  fhirBaseUrl: string;
  /** Assigning authority system uri for the app's local ids. */
  assigningAuthoritySystem: string;
  /** Auth for the FHIR calls. */
  auth: PixmPdqmAuth;
}

export type PixmPdqmAuth =
  | { kind: 'none' }
  | { kind: 'bearer'; token: string }
  | { kind: 'basic'; username: string; password: string }
  | { kind: 'smart-backend'; tokenUrl: string; clientId: string; scope: string };

// ── Injected transports (the live-endpoint boundary; CI-pending) ─────────────
//
// The query-construction and response-parsing LOGIC is real and always runs. The
// wire send is factored out behind these transports so the logic is exercised
// against a FAKE MPI in tests. A resolver with NO transport wired fails closed
// (throws ExternalEmpiNotConfiguredError) — a config shape alone is not a live
// MPI. Production supplies a real MLLP client (HL7v2) or fetch adapter (FHIR).

/**
 * HL7v2 transport: send an ER7 request message (QBP) over MLLP and return the
 * raw ER7 response (RSP). The default resolvers wire none (fail closed); a fake
 * MPI implements this to answer message-shaped requests deterministically.
 */
export type Hl7v2Transport = (er7Request: string) => Promise<string>;

/** A FHIR REST request the PIXm/PDQm logic builds; the transport performs it. */
export interface FhirTransportRequest {
  method: 'GET' | 'POST';
  url: string;
  headers: Record<string, string>;
  body?: string;
}

/** A FHIR REST response the transport returns; body is the parsed JSON payload. */
export interface FhirTransportResponse {
  status: number;
  body: unknown;
}

/** FHIR transport: perform a built request and return status + parsed body. */
export type FhirTransport = (request: FhirTransportRequest) => Promise<FhirTransportResponse>;

/**
 * Thrown by every external stub method until a real endpoint is configured.
 * The message NAMES the config each family needs (fail-loud, PHI-free).
 */
export class ExternalEmpiNotConfiguredError extends Error {
  readonly protocol: ExternalIdentityProtocol;
  readonly capability: string;
  constructor(protocol: ExternalIdentityProtocol, capability: string, needs: string) {
    super(
      `External EMPI not configured for ${protocol} "${capability}". ` +
        `Real integration is a later roadmap iteration. Needs: ${needs}`
    );
    this.name = 'ExternalEmpiNotConfiguredError';
    this.protocol = protocol;
    this.capability = capability;
  }
}
