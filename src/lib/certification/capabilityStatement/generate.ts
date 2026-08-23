/**
 * Deterministic FHIR R4 CapabilityStatement generator (B2, iteration 10 Wave B).
 *
 * Input: the audited ImplementedSurface (surface.ts). Output: a CapabilityStatement
 * that lists ONLY the resources, operations, profiles and security that the code
 * actually implements. There are no clocks and no randomness: same surface in,
 * byte-identical statement out (arrays are sorted). This is what makes the
 * statement a trustworthy conformance artifact rather than marketing.
 */
import type {
  CapabilityStatementResource,
  CapabilityResource,
  CapabilityOperation,
  CapabilityRest,
  ImplementedSurface,
  RestSecurity,
} from './types';
import { implementedSurface } from './surface';

/** Fixed metadata — deterministic, never derived from the wall clock. */
const META = {
  id: 'tcoc-capabilitystatement',
  url: 'https://tcoc.example/fhir/CapabilityStatement/tcoc',
  version: '1.2.0', // composite framework v1.2 (iteration 10 Wave B)
  name: 'TcocCapabilityStatement',
  title: 'TCOC Platform CapabilityStatement (generated from implemented surface)',
  publisher: 'TCOC Platform — Certification (Wave B)',
  // Fixed effective date of this generated statement (no `new Date()`).
  date: '2026-08-23',
  softwareName: 'tcoc',
  softwareVersion: '0.1.0',
  fhirVersion: '4.0.1',
} as const;

const SECURITY_SERVICE_SYSTEM =
  'http://terminology.hl7.org/CodeSystem/restful-security-service';

function byString<T>(key: (t: T) => string) {
  return (a: T, b: T) => key(a).localeCompare(key(b));
}

function buildSecurity(surface: ImplementedSurface): RestSecurity {
  const s = surface.security;
  const scopeList = [...s.scopes].sort().join(' ');
  const cds = s.cdsHooks ? ' CDS Hooks discovery is served at /api/cds-hooks.' : '';
  return {
    cors: s.cors,
    service: [
      {
        coding: [{ system: SECURITY_SERVICE_SYSTEM, code: 'SMART-on-FHIR', display: 'SMART-on-FHIR' }],
        text: 'SMART-on-FHIR (OAuth2 authorization-code + PKCE; server-held token)',
      },
    ],
    description: `SMART-on-FHIR. Supported scopes: ${scopeList}.${cds} Source: ${s.provenance}.`,
  };
}

function buildResources(surface: ImplementedSurface): CapabilityResource[] {
  return [...surface.resources]
    .sort(byString((r) => r.type))
    .map((r) => {
      const resource: CapabilityResource = {
        type: r.type,
        interaction: [...r.interactions].sort().map((code) => ({ code })),
      };
      // Only attach supportedProfile when the validator actually enforces one.
      if (surface.enforcedProfiles.length > 0) {
        resource.supportedProfile = [...surface.enforcedProfiles].sort();
      }
      if (r.documentation) resource.documentation = r.documentation;
      return resource;
    });
}

function toOperation(name: string, definition: string, documentation: string): CapabilityOperation {
  return { name, definition, documentation };
}

/** Generate the CapabilityStatement from a surface (defaults to the live surface). */
export function generateCapabilityStatement(
  surface: ImplementedSurface = implementedSurface()
): CapabilityStatementResource {
  const serverOps = surface.operations
    .filter((o) => o.mode === 'server')
    .sort(byString((o) => o.name))
    .map((o) => toOperation(o.name, o.definition, o.documentation));

  const clientOps = surface.operations
    .filter((o) => o.mode === 'client')
    .sort(byString((o) => o.name))
    .map((o) => toOperation(o.name, o.definition, o.documentation));

  const rest: CapabilityRest[] = [
    {
      mode: 'server',
      documentation:
        'RESTful server surface generated from the implemented API routes and terminology operations. Lists only implemented capabilities.',
      security: buildSecurity(surface),
      resource: buildResources(surface),
      operation: serverOps,
    },
  ];

  // Client rest entry only when the app genuinely invokes an outbound operation.
  if (clientOps.length > 0) {
    rest.push({
      mode: 'client',
      documentation:
        'Outbound operations this application invokes as a client of external actors (e.g. IHE PIXm). Not served by this application.',
      operation: clientOps,
    });
  }

  return {
    resourceType: 'CapabilityStatement',
    id: META.id,
    url: META.url,
    version: META.version,
    name: META.name,
    title: META.title,
    status: 'active',
    experimental: false,
    date: META.date,
    publisher: META.publisher,
    kind: 'instance',
    software: { name: META.softwareName, version: META.softwareVersion },
    fhirVersion: META.fhirVersion,
    format: ['application/fhir+json', 'json'],
    rest,
  };
}

/** Stable JSON serialization (sorted keys) for byte-identical determinism checks. */
export function serializeCapabilityStatement(
  cs: CapabilityStatementResource = generateCapabilityStatement()
): string {
  const sortKeys = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value && typeof value === 'object') {
      return Object.keys(value as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = sortKeys((value as Record<string, unknown>)[k]);
          return acc;
        }, {});
    }
    return value;
  };
  return JSON.stringify(sortKeys(cs), null, 2);
}
