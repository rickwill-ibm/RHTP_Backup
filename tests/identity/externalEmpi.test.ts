import { afterEach, describe, expect, it } from 'vitest';
import {
  buildPdqQuery,
  buildPdqmRequest,
  buildPixQuery,
  buildPixmRequest,
  createPixPdqResolver,
  createPixmPdqmResolver,
  decideCrossReference,
  decideDemographic,
  ExternalEmpiNotConfiguredError,
  externalIdentityResolverFor,
  identityResolverKind,
  IDENTITY_RESOLVER_KINDS,
  parseEr7,
  setIdentityResolverKind,
  type FhirTransport,
  type Hl7v2Transport,
  type PixmPdqmConfig,
  type PixPdqConfig,
} from '@/lib/identity/external';
import { selectIdentityResolver } from '@/lib/pipeline/stages';

/**
 * Wave B — external EMPI made REAL. The PIX/PDQ (HL7v2) and PIXm/PDQm (FHIR)
 * adapters build real queries and parse real responses against a FAKE MPI; the
 * live endpoint is CI-pending so an unwired resolver fails closed; external
 * results respect the possible-match HELD semantics (a low-confidence external
 * match is HELD, not auto-linked); the resolver kind is selectable.
 */
afterEach(() => {
  setIdentityResolverKind(null);
});

// ── Config used across the wired-path tests ──────────────────────────────────
const ENTERPRISE_OID = '1.2.840.enterprise';
const PEER_OID = '1.2.840.emr';

const hl7Config: PixPdqConfig = {
  endpoint: 'mllp://mpi.example:2575',
  assigningAuthorityOid: ENTERPRISE_OID,
  sendingApplication: 'ACE',
  sendingFacility: 'ACE_FAC',
  receivingApplication: 'ENTERPRISE_MPI',
  receivingFacility: 'HIE',
};

const fhirConfig: PixmPdqmConfig = {
  fhirBaseUrl: 'https://fhir.example/r4',
  assigningAuthoritySystem: ENTERPRISE_OID,
  auth: { kind: 'none' },
};

// ── A deterministic, message-shaped fake HL7v2 MPI ───────────────────────────
//
// It genuinely parses the ER7 request (message type + QPD) and emits an ER7 RSP,
// so the resolver's build+parse logic is exercised end to end, not short-circuited.
function fakeHl7v2Mpi(): Hl7v2Transport {
  return async (er7Request: string): Promise<string> => {
    const msg = parseEr7(er7Request);
    const msh = msg.segments.find((s) => s[0] === 'MSH');
    const qpd = msg.segments.find((s) => s[0] === 'QPD');
    const msgType = msh?.[8] ?? '';
    const ctrlId = msh?.[9] ?? '';
    const mshOut = `MSH|^~\\&|ENTERPRISE_MPI|HIE|ACE|ACE_FAC|||RSP^K23|${ctrlId}|P|2.5.1`;
    const msa = `MSA|AA|${ctrlId}`;

    if (msgType.startsWith('QBP^Q23')) {
      // PIX cross-reference: read the queried CX id from QPD-3.
      const cx = (qpd?.[3] ?? '').split('^')[0];
      if (cx === 'MRN-KNOWN') {
        const pid = `PID|||ENT-1001^^^&${ENTERPRISE_OID}&ISO~MRN-KNOWN^^^&${PEER_OID}&ISO`;
        return [mshOut, msa, 'QAK|Q1|OK', pid].join('\r');
      }
      if (cx === 'MRN-AMBIGUOUS') {
        // Two enterprise ids => ambiguous => must be HELD.
        const pid = `PID|||ENT-1001^^^&${ENTERPRISE_OID}&ISO~ENT-2002^^^&${ENTERPRISE_OID}&ISO`;
        return [mshOut, msa, 'QAK|Q1|OK', pid].join('\r');
      }
      return [mshOut, msa, 'QAK|Q1|NF'].join('\r');
    }

    if (msgType.startsWith('QBP^Q22')) {
      // PDQ demographics: read the @field^value params from QPD-3.
      const params = (qpd?.[3] ?? '').split('~');
      const family = params.find((p) => p.startsWith('@PID.5.1.1'))?.split('^')[1] ?? '';
      if (family === 'CONFIDENT') {
        const pid = `PID|||ENT-3003^^^&${ENTERPRISE_OID}&ISO||CONFIDENT^ALICE||19700101|F`;
        return [mshOut, msa, 'QAK|Q1|OK', pid, 'QRI|0.98^^HL7'].join('\r');
      }
      if (family === 'WEAK') {
        const pid = `PID|||ENT-4004^^^&${ENTERPRISE_OID}&ISO||WEAK^BOB||19800202|M`;
        return [mshOut, msa, 'QAK|Q1|OK', pid, 'QRI|0.72^^HL7'].join('\r');
      }
      if (family === 'PEERONLY') {
        // High demographic score but the ONLY id is peer-domain (no enterprise
        // id). Must NOT fabricate an enterprise anchor => HELD (E9).
        const pid = `PID|||MRN-LOCAL^^^&${PEER_OID}&ISO||PEERONLY^EVE||19750303|F`;
        return [mshOut, msa, 'QAK|Q1|OK', pid, 'QRI|0.99^^HL7'].join('\r');
      }
      return [mshOut, msa, 'QAK|Q1|NF'].join('\r');
    }

    return [mshOut, msa, 'QAK|Q1|AE'].join('\r');
  };
}

// ── A deterministic fake FHIR MPI (PIXm Parameters + PDQm Bundle) ─────────────
function fakeFhirMpi(): FhirTransport {
  return async (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith('/Patient/$ihe-pix')) {
      const source = url.searchParams.get('sourceIdentifier') ?? '';
      const value = source.split('|')[1] ?? '';
      if (value === 'p-known') {
        return {
          status: 200,
          body: {
            resourceType: 'Parameters',
            parameter: [
              { name: 'targetIdentifier', valueIdentifier: { system: ENTERPRISE_OID, value: 'ENT-9001' } },
              { name: 'targetIdentifier', valueIdentifier: { system: PEER_OID, value: 'p-known' } },
            ],
          },
        };
      }
      if (value === 'p-error') {
        return { status: 422, body: { resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'invalid' }] } };
      }
      return { status: 200, body: { resourceType: 'Parameters', parameter: [] } };
    }

    if (url.pathname.endsWith('/Patient')) {
      const family = url.searchParams.get('family') ?? '';
      if (family === 'Confident') {
        return {
          status: 200,
          body: {
            resourceType: 'Bundle',
            type: 'searchset',
            entry: [
              {
                search: { score: 0.97 },
                resource: {
                  resourceType: 'Patient',
                  identifier: [{ system: ENTERPRISE_OID, value: 'ENT-7007' }],
                  name: [{ family: 'Confident', given: ['Carol'] }],
                  birthDate: '1965-05-05',
                  gender: 'female',
                },
              },
            ],
          },
        };
      }
      if (family === 'Weak') {
        return {
          status: 200,
          body: {
            resourceType: 'Bundle',
            type: 'searchset',
            entry: [
              {
                search: { score: 0.7 },
                resource: {
                  resourceType: 'Patient',
                  identifier: [{ system: ENTERPRISE_OID, value: 'ENT-8008' }],
                  name: [{ family: 'Weak', given: ['Dan'] }],
                  birthDate: '1990-09-09',
                  gender: 'male',
                },
              },
            ],
          },
        };
      }
      if (family === 'Peeronly') {
        // High score, but the sole identifier is peer-domain (no enterprise id).
        return {
          status: 200,
          body: {
            resourceType: 'Bundle',
            type: 'searchset',
            entry: [
              {
                search: { score: 0.99 },
                resource: {
                  resourceType: 'Patient',
                  identifier: [{ system: PEER_OID, value: 'p-local-99' }],
                  name: [{ family: 'Peeronly', given: ['Eve'] }],
                  birthDate: '1975-03-03',
                  gender: 'female',
                },
              },
            ],
          },
        };
      }
      return { status: 200, body: { resourceType: 'Bundle', type: 'searchset', entry: [] } };
    }

    return { status: 404, body: { resourceType: 'OperationOutcome' } };
  };
}

// ── PIX (HL7v2) real build + parse ───────────────────────────────────────────
describe('PIX/PDQ (HL7v2) builds real queries and parses real responses', () => {
  it('builds a QBP^Q23 PIX query carrying the source CX id', () => {
    const er7 = buildPixQuery(
      { sourcePatientId: 'MRN-KNOWN', sourceAssigningAuthority: PEER_OID },
      hl7Config,
      'CTRL1',
    );
    const msg = parseEr7(er7);
    expect(msg.segments[0][0]).toBe('MSH');
    expect(msg.segments[0][8]).toMatch(/^QBP\^Q23/);
    const qpd = msg.segments.find((s) => s[0] === 'QPD');
    expect(qpd?.[3]).toContain('MRN-KNOWN');
    expect(er7).toContain('RCP');
  });

  it('PIX cross-reference resolves to the enterprise id against the fake MPI', async () => {
    const resolver = createPixPdqResolver(hl7Config, fakeHl7v2Mpi());
    const res = await resolver.crossReference({ sourcePatientId: 'MRN-KNOWN', sourceAssigningAuthority: PEER_OID });
    expect(res.status).toBe('resolved');
    expect(res.enterpriseId).toBe('ENT-1001');
    expect(res.enterpriseAssigningAuthority).toBe(ENTERPRISE_OID);
    expect(res.crossReferences.some((x) => x.value === 'MRN-KNOWN')).toBe(true);
    // The enterprise id is the anchored member id.
    const disposition = decideCrossReference(res);
    expect(disposition.outcome).toBe('linked');
    expect(disposition.memberId).toBe('ENT-1001');
  });

  it('PDQ demographics query returns a scored candidate against the fake MPI', async () => {
    const resolver = createPixPdqResolver(hl7Config, fakeHl7v2Mpi());
    const res = await resolver.demographicQuery({ traits: { family: 'CONFIDENT', given: 'ALICE', birthDate: '1970-01-01' } });
    expect(res.candidates).toHaveLength(1);
    expect(res.candidates[0].enterpriseId).toBe('ENT-3003');
    expect(res.candidates[0].confidence).toBe(98);
    expect(res.candidates[0].traits.family).toBe('CONFIDENT');
    expect(res.candidates[0].traits.birthDate).toBe('1970-01-01');
  });

  it('E9: a high-confidence PDQ candidate with only a peer-domain id is HELD, not anchored to the peer id', async () => {
    const resolver = createPixPdqResolver(hl7Config, fakeHl7v2Mpi());
    const res = await resolver.demographicQuery({ traits: { family: 'PEERONLY', given: 'EVE', birthDate: '1975-03-03' } });
    expect(res.candidates).toHaveLength(1);
    // The candidate survives (so it counts toward ambiguity) but carries NO
    // enterprise anchor — the peer id is never promoted to enterpriseId.
    expect(res.candidates[0].enterpriseId).toBe('');
    expect(res.candidates[0].confidence).toBe(99);
    const disposition = decideDemographic(res);
    expect(disposition.outcome).toBe('held');
    expect(disposition.memberId).toBe('');
  });

  it('builds a QBP^Q22 PDQ query with @field^value demographic params', () => {
    const er7 = buildPdqQuery({ traits: { family: 'SMITH', birthDate: '1980-02-02' } }, hl7Config, 'CTRL2');
    const qpd = parseEr7(er7).segments.find((s) => s[0] === 'QPD');
    expect(qpd?.[3]).toContain('@PID.5.1.1^SMITH');
    expect(qpd?.[3]).toContain('@PID.7.1^19800202');
  });
});

// ── PIXm/PDQm (FHIR) real build + parse ──────────────────────────────────────
describe('PIXm/PDQm (FHIR) builds real requests and parses real responses', () => {
  it('builds a PIXm $ihe-pix GET with sourceIdentifier + targetSystem', () => {
    const req = buildPixmRequest(
      { sourcePatientId: 'p-known', sourceAssigningAuthority: PEER_OID, targetAssigningAuthorities: [ENTERPRISE_OID] },
      fhirConfig,
    );
    expect(req.method).toBe('GET');
    expect(req.url).toContain('/Patient/$ihe-pix?');
    expect(req.url).toContain(`sourceIdentifier=${encodeURIComponent(`${PEER_OID}|p-known`)}`);
    expect(req.url).toContain('targetSystem=');
  });

  it('PIXm cross-reference resolves to the enterprise id against the fake FHIR MPI', async () => {
    const resolver = createPixmPdqmResolver(fhirConfig, fakeFhirMpi());
    const res = await resolver.crossReference({ sourcePatientId: 'p-known', sourceAssigningAuthority: PEER_OID });
    expect(res.status).toBe('resolved');
    expect(res.enterpriseId).toBe('ENT-9001');
    expect(decideCrossReference(res).memberId).toBe('ENT-9001');
  });

  it('builds a PDQm Patient search GET with family/birthdate params', () => {
    const req = buildPdqmRequest({ traits: { family: 'Confident', birthDate: '1965-05-05' } }, fhirConfig);
    expect(req.url).toContain('/Patient?');
    expect(req.url).toContain('family=Confident');
    expect(req.url).toContain('birthdate=1965-05-05');
  });

  it('PDQm demographics search parses a scored Bundle candidate', async () => {
    const resolver = createPixmPdqmResolver(fhirConfig, fakeFhirMpi());
    const res = await resolver.demographicQuery({ traits: { family: 'Confident' } });
    expect(res.candidates).toHaveLength(1);
    expect(res.candidates[0].enterpriseId).toBe('ENT-7007');
    expect(res.candidates[0].confidence).toBe(97);
  });

  it('E9: a high-confidence PDQm candidate with only a peer-domain identifier is HELD, not anchored to the peer id', async () => {
    const resolver = createPixmPdqmResolver(fhirConfig, fakeFhirMpi());
    const res = await resolver.demographicQuery({ traits: { family: 'Peeronly' } });
    expect(res.candidates).toHaveLength(1);
    expect(res.candidates[0].enterpriseId).toBe('');
    expect(res.candidates[0].confidence).toBe(99);
    const disposition = decideDemographic(res);
    expect(disposition.outcome).toBe('held');
    expect(disposition.memberId).toBe('');
  });
});

// ── Fail-closed without a live MPI ───────────────────────────────────────────
describe('external adapters fail closed without a live MPI', () => {
  it('PIX cross-reference throws NotConfigured with config but no transport', async () => {
    const resolver = createPixPdqResolver(hl7Config); // config present, transport absent
    await expect(resolver.crossReference({ sourcePatientId: 'x', sourceAssigningAuthority: PEER_OID })).rejects.toBeInstanceOf(
      ExternalEmpiNotConfiguredError,
    );
  });

  it('PDQ demographics throws NotConfigured with neither config nor transport', async () => {
    const resolver = createPixPdqResolver();
    await expect(resolver.demographicQuery({ traits: { family: 'X' } })).rejects.toBeInstanceOf(
      ExternalEmpiNotConfiguredError,
    );
  });

  it('PIXm throws NotConfigured with config but no transport', async () => {
    const resolver = createPixmPdqmResolver(fhirConfig);
    await expect(resolver.crossReference({ sourcePatientId: 'x', sourceAssigningAuthority: PEER_OID })).rejects.toBeInstanceOf(
      ExternalEmpiNotConfiguredError,
    );
  });

  it('PDQm throws NotConfigured with a wired transport but incomplete config', async () => {
    const resolver = createPixmPdqmResolver({ fhirBaseUrl: '', assigningAuthoritySystem: '', auth: { kind: 'none' } }, fakeFhirMpi());
    await expect(resolver.demographicQuery({ traits: { family: 'X' } })).rejects.toBeInstanceOf(
      ExternalEmpiNotConfiguredError,
    );
  });
});

// ── HELD semantics on external results (never auto-link a weak match) ─────────
describe('a low-confidence external match is HELD, not auto-linked', () => {
  it('an ambiguous PIX cross-reference (two enterprise ids) is HELD', async () => {
    const resolver = createPixPdqResolver(hl7Config, fakeHl7v2Mpi());
    const res = await resolver.crossReference({ sourcePatientId: 'MRN-AMBIGUOUS', sourceAssigningAuthority: PEER_OID });
    expect(res.status).toBe('ambiguous');
    const disposition = decideCrossReference(res);
    expect(disposition.outcome).toBe('held');
    expect(disposition.memberId).toBe('');
    expect(disposition.reasonCode).toBe('identity-possible-match');
  });

  it('a not-found PIX cross-reference is HELD, never a default identity (E9)', async () => {
    const resolver = createPixPdqResolver(hl7Config, fakeHl7v2Mpi());
    const res = await resolver.crossReference({ sourcePatientId: 'MRN-UNKNOWN', sourceAssigningAuthority: PEER_OID });
    expect(res.enterpriseId).toBe('');
    const disposition = decideCrossReference(res);
    expect(disposition.outcome).toBe('held');
    expect(disposition.memberId).toBe('');
  });

  it('a weak PDQ candidate (score in the possible-match band) is HELD', async () => {
    const resolver = createPixPdqResolver(hl7Config, fakeHl7v2Mpi());
    const res = await resolver.demographicQuery({ traits: { family: 'WEAK' } });
    expect(res.candidates[0].confidence).toBe(72);
    const disposition = decideDemographic(res);
    expect(disposition.outcome).toBe('held');
    expect(disposition.memberId).toBe('');
  });

  it('a confident, dominant PDQ candidate auto-links to its enterprise id', async () => {
    const resolver = createPixPdqResolver(hl7Config, fakeHl7v2Mpi());
    const res = await resolver.demographicQuery({ traits: { family: 'CONFIDENT' } });
    const disposition = decideDemographic(res);
    expect(disposition.outcome).toBe('linked');
    expect(disposition.memberId).toBe('ENT-3003');
  });

  it('a weak PDQm (FHIR) candidate is HELD; a strong one links', async () => {
    const resolver = createPixmPdqmResolver(fhirConfig, fakeFhirMpi());
    const weak = await resolver.demographicQuery({ traits: { family: 'Weak' } });
    expect(decideDemographic(weak).outcome).toBe('held');
    const strong = await resolver.demographicQuery({ traits: { family: 'Confident' } });
    expect(decideDemographic(strong).outcome).toBe('linked');
    expect(decideDemographic(strong).memberId).toBe('ENT-7007');
  });

  it('an empty PDQm Bundle is HELD (never mints a default identity)', async () => {
    const resolver = createPixmPdqmResolver(fhirConfig, fakeFhirMpi());
    const res = await resolver.demographicQuery({ traits: { family: 'Nobody' } });
    expect(res.candidates).toHaveLength(0);
    expect(decideDemographic(res).outcome).toBe('held');
  });
});

// ── Resolver-kind selection ──────────────────────────────────────────────────
describe('resolver-kind selection (internal default, external kinds selectable)', () => {
  it('registers exactly the three kinds with internal default', () => {
    expect([...IDENTITY_RESOLVER_KINDS]).toEqual(['internal', 'external-pixpdq', 'external-pixm-pdqm']);
    expect(identityResolverKind()).toBe('internal');
  });

  it('internal resolver resolves an id; external kinds fail closed at the sync seam', () => {
    expect(selectIdentityResolver()('src-1', { feed: 'demo' })).toMatch(/^mem-/);
    setIdentityResolverKind('external-pixpdq');
    expect(identityResolverKind()).toBe('external-pixpdq');
    expect(() => selectIdentityResolver()('src-1', { feed: 'demo' })).toThrow(ExternalEmpiNotConfiguredError);
    setIdentityResolverKind('external-pixm-pdqm');
    expect(() => selectIdentityResolver()('src-1')).toThrow(ExternalEmpiNotConfiguredError);
  });

  it('externalIdentityResolverFor maps external kinds to a resolver, internal to null', () => {
    expect(externalIdentityResolverFor('internal')).toBeNull();
    expect(typeof externalIdentityResolverFor('external-pixpdq')).toBe('function');
    expect(typeof externalIdentityResolverFor('external-pixm-pdqm')).toBe('function');
  });
});
