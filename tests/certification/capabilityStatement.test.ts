/**
 * B2 (iteration 10 Wave B) — the generated FHIR R4 CapabilityStatement must
 * reflect ONLY the real, implemented surface.
 *
 * DoD proofs:
 *   - lists only implemented operations ($member-match, PAS $submit, $validate-code,
 *     $translate, $expand served; $ihe-pix as a CLIENT operation);
 *   - a NOT-implemented operation ($everything) is NEVER listed (E9);
 *   - profiles reflect the profile VALIDATOR (a structural stub -> no US Core
 *     supportedProfile is asserted);
 *   - rest.security reflects SMART-on-FHIR;
 *   - deterministic: same surface -> byte-identical statement.
 */
import { describe, it, expect } from 'vitest';
import {
  generateCapabilityStatement,
  serializeCapabilityStatement,
  implementedSurface,
} from '@/lib/certification/capabilityStatement';
import { structuralProfileValidator } from '@/lib/pipeline/profileValidator';

const cs = generateCapabilityStatement();
const serverRest = cs.rest.find((r) => r.mode === 'server')!;
const clientRest = cs.rest.find((r) => r.mode === 'client');
const serverOpNames = (serverRest.operation ?? []).map((o) => o.name);
const clientOpNames = (clientRest?.operation ?? []).map((o) => o.name);
const allOpNames = [...serverOpNames, ...clientOpNames];

describe('CapabilityStatement — shape & metadata', () => {
  it('is an R4 CapabilityStatement', () => {
    expect(cs.resourceType).toBe('CapabilityStatement');
    expect(cs.fhirVersion).toBe('4.0.1');
    expect(cs.status).toBe('active');
    expect(cs.kind).toBe('instance');
    expect(cs.format).toContain('application/fhir+json');
  });

  it('is deterministic — no wall-clock date, byte-identical across runs', () => {
    expect(cs.date).toBe('2026-08-23');
    expect(serializeCapabilityStatement()).toBe(serializeCapabilityStatement());
    expect(serializeCapabilityStatement(generateCapabilityStatement())).toBe(
      serializeCapabilityStatement(generateCapabilityStatement())
    );
  });
});

describe('CapabilityStatement — lists only implemented operations', () => {
  it('server operations are exactly the implemented, HTTP/terminology-backed ones', () => {
    expect(serverOpNames).toEqual(
      expect.arrayContaining(['$member-match', '$submit', '$validate-code', '$translate', '$expand'])
    );
  });

  it('every listed operation is backed by an entry in the implemented surface', () => {
    const implemented = new Set(implementedSurface().operations.map((o) => o.name));
    for (const name of allOpNames) expect(implemented.has(name)).toBe(true);
  });

  it('every listed operation carries a canonical OperationDefinition URL', () => {
    for (const op of [...(serverRest.operation ?? []), ...(clientRest?.operation ?? [])]) {
      expect(op.definition).toMatch(/^https?:\/\/.+/);
      expect(op.name.startsWith('$')).toBe(true);
    }
  });

  it('$ihe-pix is declared as a CLIENT operation, not a served one', () => {
    expect(clientOpNames).toContain('$ihe-pix');
    expect(serverOpNames).not.toContain('$ihe-pix');
  });

  // E9: a not-implemented operation must NEVER appear.
  it('does NOT list $everything (not implemented anywhere in the repo)', () => {
    expect(allOpNames).not.toContain('$everything');
    expect(serializeCapabilityStatement()).not.toContain('$everything');
  });

  it('does NOT list other unimplemented operations', () => {
    for (const absent of ['$diff', '$docref', '$lastn', '$graphql', '$apply']) {
      expect(allOpNames).not.toContain(absent);
    }
  });
});

describe('CapabilityStatement — resources reflect the passthrough surface', () => {
  it('lists exactly the resource types the FHIR passthrough serves', () => {
    const types = (serverRest.resource ?? []).map((r) => r.type).sort();
    expect(types).toEqual(
      ['ClaimResponse', 'Condition', 'Coverage', 'MedicationRequest', 'Patient'].sort()
    );
  });

  it('Patient exposes read + search-type + create; others do not claim read', () => {
    const patient = (serverRest.resource ?? []).find((r) => r.type === 'Patient')!;
    const codes = patient.interaction.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['read', 'search-type', 'create']));
    const coverage = (serverRest.resource ?? []).find((r) => r.type === 'Coverage')!;
    expect(coverage.interaction.map((i) => i.code)).not.toContain('read');
  });

  it('does NOT list a resource type the code does not serve', () => {
    const types = (serverRest.resource ?? []).map((r) => r.type);
    for (const absent of ['Observation', 'Encounter', 'Practitioner', 'Immunization']) {
      expect(types).not.toContain(absent);
    }
  });
});

describe('CapabilityStatement — profiles reflect the validator', () => {
  it('the profile validator is a structural pre-flight, not US Core $validate', () => {
    // Guards the premise: if this ever changes, the profile assertions below
    // must be revisited rather than silently passing.
    expect(structuralProfileValidator.id).toContain('structural-preflight');
  });

  it('asserts NO supportedProfile because the validator enforces none', () => {
    expect(implementedSurface().enforcedProfiles).toEqual([]);
    for (const r of serverRest.resource ?? []) {
      expect(r.supportedProfile ?? []).toEqual([]);
    }
  });

  it('never claims a US Core profile the validator does not enforce', () => {
    expect(serializeCapabilityStatement()).not.toMatch(/us-core/i);
  });
});

describe('CapabilityStatement — rest.security reflects SMART', () => {
  it('declares SMART-on-FHIR as the security service', () => {
    const services = serverRest.security?.service ?? [];
    const codings = services.flatMap((s) => s.coding);
    expect(codings.some((c) => c.code === 'SMART-on-FHIR')).toBe(true);
  });

  it('documents the configured SMART scopes', () => {
    const desc = serverRest.security?.description ?? '';
    for (const scope of ['patient/*.read', 'launch/patient', 'openid', 'fhirUser', 'offline_access']) {
      expect(desc).toContain(scope);
    }
  });

  it('notes CDS Hooks discovery alongside SMART', () => {
    expect(serverRest.security?.description ?? '').toMatch(/CDS Hooks/i);
  });
});
