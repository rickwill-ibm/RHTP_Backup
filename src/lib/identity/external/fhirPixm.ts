/**
 * FHIR PIXm/PDQm request construction + response parsing.
 *
 * REAL query construction and response parsing for the FHIR identity family:
 *   PIXm  GET Patient/$ihe-pix?sourceIdentifier=sys|val&targetSystem=sys  (ITI-83)
 *         -> Parameters { targetIdentifier*, targetId* }
 *   PDQm  GET Patient?family=&given=&birthdate=&gender=...                (ITI-78)
 *         -> searchset Bundle (entry.search.score = match confidence)
 *
 * Pure and transport-free: turns a PixQuery/PdqQuery into a FhirTransportRequest
 * and parses the JSON response body into the seam's PixResponse/PdqResponse. The
 * HTTP send is a separate injected transport (types.ts FhirTransport) so the
 * build/parse logic is testable against a fake FHIR MPI without a live server.
 */
import type {
  CrossReferenceStatus,
  ExternalPatientIdentifier,
  FhirTransportRequest,
  PdqCandidate,
  PdqQuery,
  PdqResponse,
  PixmPdqmConfig,
  PixQuery,
  PixResponse,
} from './types';

function authHeaders(config: PixmPdqmConfig): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/fhir+json' };
  const auth = config.auth;
  if (auth.kind === 'bearer') headers.Authorization = `Bearer ${auth.token}`;
  else if (auth.kind === 'basic') {
    const raw = `${auth.username}:${auth.password}`;
    const encoded =
      typeof btoa === 'function' ? btoa(raw) : Buffer.from(raw, 'utf8').toString('base64');
    headers.Authorization = `Basic ${encoded}`;
  }
  // smart-backend token acquisition is a transport concern (CI-pending); the
  // header is added by the wired transport when it exchanges the client credential.
  return headers;
}

function base(config: PixmPdqmConfig): string {
  return config.fhirBaseUrl.replace(/\/+$/, '');
}

// ── PIXm  Patient/$ihe-pix ───────────────────────────────────────────────────

/** Build the PIXm $ihe-pix GET request for a source patient identifier. */
export function buildPixmRequest(query: PixQuery, config: PixmPdqmConfig): FhirTransportRequest {
  const params = new URLSearchParams();
  params.set('sourceIdentifier', `${query.sourceAssigningAuthority}|${query.sourcePatientId}`);
  for (const target of query.targetAssigningAuthorities ?? [])
    params.append('targetSystem', target);
  return {
    method: 'GET',
    url: `${base(config)}/Patient/$ihe-pix?${params.toString()}`,
    headers: authHeaders(config),
  };
}

interface FhirParameters {
  resourceType?: string;
  parameter?: Array<{
    name?: string;
    valueIdentifier?: { system?: string; value?: string };
    valueReference?: { reference?: string };
  }>;
}

interface FhirOperationOutcome {
  resourceType?: string;
  issue?: Array<{ severity?: string; code?: string }>;
}

/**
 * Parse a PIXm $ihe-pix Parameters response. targetIdentifier parameters carry
 * the cross-referenced ids; the enterprise id is the one whose system matches the
 * enterprise system. An OperationOutcome (error) or >1 enterprise id is ambiguous;
 * an empty result is not-found.
 */
export function parsePixmResponse(
  status: number,
  body: unknown,
  enterpriseSystem: string
): PixResponse {
  const empty: PixResponse = {
    status: 'not-found',
    enterpriseId: '',
    enterpriseAssigningAuthority: enterpriseSystem,
    crossReferences: [],
  };
  if (!body || typeof body !== 'object') return empty;
  const resourceType = (body as { resourceType?: string }).resourceType;
  if (status >= 400 || resourceType === 'OperationOutcome') {
    return { ...empty, status: 'ambiguous' };
  }
  const params = (body as FhirParameters).parameter ?? [];
  const ids: ExternalPatientIdentifier[] = [];
  for (const p of params) {
    if (p.name === 'targetIdentifier' && p.valueIdentifier?.value) {
      ids.push({
        assigningAuthority: p.valueIdentifier.system ?? '',
        value: p.valueIdentifier.value,
      });
    }
  }
  const enterprise = ids.filter((id) => id.assigningAuthority === enterpriseSystem);
  const peers = ids.filter((id) => id.assigningAuthority !== enterpriseSystem);
  if (enterprise.length === 0) return { ...empty, crossReferences: peers };
  if (enterprise.length > 1) return { ...empty, status: 'ambiguous', crossReferences: peers };
  return {
    status: 'resolved' as CrossReferenceStatus,
    enterpriseId: enterprise[0].value,
    enterpriseAssigningAuthority: enterpriseSystem,
    crossReferences: peers,
  };
}

// ── PDQm  GET Patient?family=&given=&birthdate= ──────────────────────────────

/** Build the PDQm Patient-search GET request from PHI-minimal traits. */
export function buildPdqmRequest(query: PdqQuery, config: PixmPdqmConfig): FhirTransportRequest {
  const params = new URLSearchParams();
  const t = query.traits;
  if (t.family) params.set('family', t.family);
  if (t.given) params.set('given', t.given);
  if (t.birthDate) params.set('birthdate', t.birthDate);
  if (t.gender) params.set('gender', t.gender);
  for (const id of t.identifiers ?? []) {
    params.append('identifier', `${id.assigningAuthority}|${id.value}`);
  }
  if (query.maxResults) params.set('_count', String(query.maxResults));
  return {
    method: 'GET',
    url: `${base(config)}/Patient?${params.toString()}`,
    headers: authHeaders(config),
  };
}

interface FhirBundle {
  resourceType?: string;
  entry?: Array<{
    resource?: FhirPatient;
    search?: { score?: number };
  }>;
}

interface FhirPatient {
  resourceType?: string;
  identifier?: Array<{ system?: string; value?: string }>;
  name?: Array<{ family?: string; given?: string[] }>;
  birthDate?: string;
  gender?: string;
}

/**
 * Parse a PDQm searchset Bundle into candidates. entry.search.score (0-1) becomes
 * the 0-100 confidence; the enterprise id is the Patient.identifier whose system
 * matches the enterprise system (falls back to the first identifier).
 */
export function parsePdqmResponse(
  status: number,
  body: unknown,
  enterpriseSystem: string
): PdqResponse {
  if (status >= 400 || !body || typeof body !== 'object') return { candidates: [] };
  const bundle = body as FhirBundle;
  if (bundle.resourceType !== 'Bundle') return { candidates: [] };
  const candidates: PdqCandidate[] = [];
  for (const entry of bundle.entry ?? []) {
    const patient = entry.resource;
    if (!patient || patient.resourceType !== 'Patient') continue;
    const ids: ExternalPatientIdentifier[] = (patient.identifier ?? [])
      .filter((i) => i.value)
      .map((i) => ({ assigningAuthority: i.system ?? '', value: i.value as string }));
    // E9: no id in the enterprise system => no enterprise anchor. Keep the
    // candidate (dominance/ambiguity still counts it) but leave enterpriseId EMPTY;
    // never fabricate an enterprise anchor from a peer-domain identifier.
    const enterprise = ids.find((id) => id.assigningAuthority === enterpriseSystem);
    const name = patient.name?.[0];
    const score = entry.search?.score;
    candidates.push({
      enterpriseId: enterprise?.value ?? '',
      enterpriseAssigningAuthority: enterpriseSystem,
      traits: {
        family: name?.family,
        given: name?.given?.[0],
        birthDate: patient.birthDate,
        gender: normalizeGender(patient.gender),
        identifiers: ids,
      },
      confidence:
        typeof score === 'number' ? Math.max(0, Math.min(100, Math.round(score * 100))) : 0,
    });
  }
  return { candidates };
}

function normalizeGender(g: string | undefined): PdqCandidate['traits']['gender'] {
  switch ((g || '').toLowerCase()) {
    case 'male':
      return 'male';
    case 'female':
      return 'female';
    case 'other':
      return 'other';
    default:
      return 'unknown';
  }
}

export type { FhirOperationOutcome };
