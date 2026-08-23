/**
 * FHIR R4 CapabilityStatement — minimal typed subset (B2, iteration 10 Wave B).
 *
 * Only the elements the generator actually emits are modelled. This is a
 * deliberately small, self-contained shape so the certification module does not
 * depend on a full FHIR type library. It mirrors the R4 CapabilityStatement
 * resource (http://hl7.org/fhir/R4/capabilitystatement.html).
 *
 * Wave A (conformance matrix) integration point: if Wave A exports matrix types,
 * they can be imported here later. Until then this module is self-standing; the
 * only cross-import is the ACTUAL implemented surface (terminology + profile
 * validator), so the statement is derived from code, never hand-asserted.
 */

export type FhirCode = string;

export interface Coding {
  system?: string;
  code?: string;
  display?: string;
}

/** CapabilityStatement.rest.resource.interaction / .interaction (system). */
export interface ResourceInteraction {
  code:
    | 'read'
    | 'vread'
    | 'update'
    | 'patch'
    | 'delete'
    | 'history-instance'
    | 'history-type'
    | 'create'
    | 'search-type';
  documentation?: string;
}

export interface SearchParam {
  name: string;
  type: 'number' | 'date' | 'string' | 'token' | 'reference' | 'composite' | 'quantity' | 'uri';
  documentation?: string;
}

export interface CapabilityResource {
  type: string;
  /** Canonical URLs of profiles the server ENFORCES for this type (never aspirational). */
  supportedProfile?: string[];
  interaction: ResourceInteraction[];
  searchParam?: SearchParam[];
  documentation?: string;
}

/** CapabilityStatement.rest.operation and .rest.resource.operation. */
export interface CapabilityOperation {
  name: string;
  /** Canonical OperationDefinition URL. */
  definition: string;
  documentation?: string;
}

export interface SecurityService {
  coding: Coding[];
  text?: string;
}

export interface RestSecurity {
  cors?: boolean;
  service?: SecurityService[];
  description?: string;
}

export interface CapabilityRest {
  mode: 'server' | 'client';
  documentation?: string;
  security?: RestSecurity;
  resource?: CapabilityResource[];
  operation?: CapabilityOperation[];
}

export interface CapabilityStatementResource {
  resourceType: 'CapabilityStatement';
  id: string;
  url: string;
  version: string;
  name: string;
  title: string;
  status: 'draft' | 'active' | 'retired' | 'unknown';
  experimental: boolean;
  date: string;
  publisher: string;
  kind: 'instance' | 'capability' | 'requirements';
  software?: { name: string; version?: string };
  fhirVersion: FhirCode;
  format: string[];
  rest: CapabilityRest[];
}

// ── Implemented-surface facts (the single source of truth for the generator) ──

export type OperationExposure = 'http-route' | 'terminology-library' | 'client-invoked';

/** One operation the codebase ACTUALLY implements, with provenance. */
export interface ImplementedOperation {
  name: string;
  definition: string;
  /** How it is exposed: an inbound HTTP route, an internal terminology library op, or an outbound client call. */
  exposure: OperationExposure;
  /** Rest mode the operation is surfaced under. */
  mode: 'server' | 'client';
  /** Source file that implements it (audit provenance). */
  provenance: string;
  documentation: string;
}

export interface ImplementedResource {
  type: string;
  interactions: ResourceInteraction['code'][];
  provenance: string;
  documentation?: string;
}

export interface SmartSecurityFacts {
  service: 'SMART-on-FHIR';
  cors: boolean;
  /** OAuth scopes the server is configured to request/accept (from env default). */
  scopes: string[];
  /** True when CDS Hooks discovery is served alongside SMART. */
  cdsHooks: boolean;
  provenance: string;
}

export interface ImplementedSurface {
  resources: ImplementedResource[];
  operations: ImplementedOperation[];
  /** Profiles the profile validator ENFORCES (empty when it is a structural stub). */
  enforcedProfiles: string[];
  security: SmartSecurityFacts;
}
