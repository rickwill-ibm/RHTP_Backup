import { afterEach, describe, expect, it } from 'vitest';
import {
  createPixPdqResolver,
  createPixmPdqmResolver,
  ExternalEmpiNotConfiguredError,
  externalIdentityResolverFor,
  identityResolverKind,
  IDENTITY_RESOLVER_KINDS,
  pixPdqResolver,
  pixmPdqmResolver,
  setIdentityResolverKind,
  type PixmPdqmConfig,
  type PixPdqConfig,
} from '@/lib/identity/external';
import { selectIdentityResolver } from '@/lib/pipeline/stages';
import { setSessionDataMode, clearSessionDataModes } from '@/lib/config/dataMode';

/**
 * External EMPI/MPI identity seam (Iteration 4): the two protocol families
 * (PIX/PDQ HL7v2 + PIXm/PDQm FHIR) are selectable and fail loud with a helpful
 * NotConfigured message; the internal resolver stays the default.
 */
afterEach(() => {
  setIdentityResolverKind(null);
  clearSessionDataModes();
});

describe('external resolver kinds are selectable', () => {
  it('registers exactly the three kinds, internal default', () => {
    expect([...IDENTITY_RESOLVER_KINDS]).toEqual(['internal', 'external-pixpdq', 'external-pixm-pdqm']);
    expect(identityResolverKind()).toBe('internal');
  });

  it('externalIdentityResolverFor maps external kinds to a resolver, internal to null', () => {
    expect(externalIdentityResolverFor('internal')).toBeNull();
    expect(typeof externalIdentityResolverFor('external-pixpdq')).toBe('function');
    expect(typeof externalIdentityResolverFor('external-pixm-pdqm')).toBe('function');
  });

  it('setIdentityResolverKind rejects an invalid kind', () => {
    // @ts-expect-error invalid kind on purpose
    expect(() => setIdentityResolverKind('bogus')).toThrow(TypeError);
  });
});

describe('selectIdentityResolver honors the resolver kind', () => {
  it('internal (default) resolves an id without throwing', () => {
    const resolver = selectIdentityResolver();
    expect(resolver('src-1', { feed: 'demo' })).toMatch(/^mem-/);
  });

  it('external-pixpdq resolves to a stub that throws NotConfigured', () => {
    setIdentityResolverKind('external-pixpdq');
    const resolver = selectIdentityResolver();
    expect(() => resolver('src-1', { feed: 'demo' })).toThrow(ExternalEmpiNotConfiguredError);
  });

  it('external-pixm-pdqm resolves to a stub that throws NotConfigured', () => {
    setIdentityResolverKind('external-pixm-pdqm');
    const resolver = selectIdentityResolver();
    expect(() => resolver('src-1', { feed: 'demo' })).toThrow(ExternalEmpiNotConfiguredError);
  });

  it('an external kind wins even when identity dataMode is production', () => {
    setSessionDataMode('identity', 'production');
    setIdentityResolverKind('external-pixpdq');
    expect(() => selectIdentityResolver()('src-1')).toThrow(ExternalEmpiNotConfiguredError);
  });
});

describe('PIX/PDQ (HL7v2) stub fails loud with a helpful message', () => {
  it('crossReference names the HL7v2 config needed', async () => {
    await expect(pixPdqResolver.crossReference({ sourcePatientId: 'MRN1', sourceAssigningAuthority: '1.2.3' })).rejects.toThrow(
      /PIX\/PDQ.*PIXPDQ_ENDPOINT.*ASSIGNING_AUTHORITY_OID.*SENDING_APP.*RECEIVING_FACILITY/,
    );
    expect(pixPdqResolver.protocol).toBe('PIX/PDQ');
  });

  it('demographicQuery throws even with a partial config', async () => {
    const partial: PixPdqConfig = {
      endpoint: 'mllp://host:2575',
      assigningAuthorityOid: '',
      sendingApplication: 'APP',
      sendingFacility: 'FAC',
      receivingApplication: 'MGR',
      receivingFacility: 'HIE',
    };
    const resolver = createPixPdqResolver(partial);
    await expect(resolver.demographicQuery({ traits: { family: 'X' } })).rejects.toBeInstanceOf(
      ExternalEmpiNotConfiguredError,
    );
  });
});

describe('PIXm/PDQm (FHIR) stub fails loud with a helpful message', () => {
  it('crossReference names the FHIR config needed', async () => {
    await expect(pixmPdqmResolver.crossReference({ sourcePatientId: 'p1', sourceAssigningAuthority: 'urn:x' })).rejects.toThrow(
      /PIXm\/PDQm.*PIXM_FHIR_BASE_URL.*ASSIGNING_AUTHORITY_SYSTEM.*PIXM_AUTH_KIND/,
    );
    expect(pixmPdqmResolver.protocol).toBe('PIXm/PDQm');
  });

  it('demographicQuery throws with a complete-looking-but-unwired config too (stub, not live)', async () => {
    const config: PixmPdqmConfig = {
      fhirBaseUrl: 'https://fhir.example/r4',
      assigningAuthoritySystem: 'urn:oid:1.2.3',
      auth: { kind: 'none' },
    };
    const resolver = createPixmPdqmResolver(config);
    await expect(resolver.demographicQuery({ traits: { family: 'Y', birthDate: '1970-01-01' } })).rejects.toBeInstanceOf(
      ExternalEmpiNotConfiguredError,
    );
  });
});
