/**
 * Seam dispositions — the reviewer-qualification (authz/credentialing) family.
 *
 * Split out of `seamDispositions.ts` the way the WPCO agent tranche already is: that file is at its
 * 400-line cap and the ratchet forbids growing it, so a new family gets its own module and is spread
 * into the manifest. One entry per seam, same shape, same gate.
 */
import type { SeamDispositionEntry } from './seamDispositions';

/**
 * EXACT-KEY Record, not Partial — same reason `seamDispositions.agents.ts` gives: the manifest is
 * annotated `Readonly<Record<DataModeSeam, SeamDispositionEntry>>`, and TypeScript only proves that
 * annotation complete if each spread names its keys. A Partial leaves every key possibly-undefined
 * and the completeness check silently stops meaning anything.
 */
export const AUTHZ_SEAM_DISPOSITIONS: Readonly<Record<'credentialing', SeamDispositionEntry>> =
  Object.freeze({
    credentialing: {
      seamId: 'credentialing',
      disposition: 'fail-closed-stub',
      productionResolverRef: 'lib/authz/credentialing/source.ts → getCredentialingSource()',
      notConfiguredError: 'CredentialingNotConfiguredError',
      note:
        'The credentialing system of record behind 42 CFR 438.210(b)(3) reviewer ' +
        'qualification. DELIBERATELY NOT providerIdentity: NPPES answers "does this ' +
        'provider exist and what type are they" and carries no licence, expiry, board ' +
        'certification, sanction or exclusion — overloading it would produce a ' +
        'production gate that checks a taxonomy code and calls it credentialing. ' +
        'mock/seeded → the in-repo seeded reviewer directory, which deliberately seeds ' +
        'ONE reviewer per refusal code so the gate can be shown refusing rather than ' +
        'only allowing; production with nothing wired throws ' +
        'CredentialingNotConfiguredError. Expertise is ATTESTED by a named attester ' +
        'under a named standard, never computed from a taxonomy match — see ' +
        'lib/authz/credentialing/FAKE_FIDELITY.md for what the seed does not do.',
    },
  } as const);
