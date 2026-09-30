// CONTRACT: C-REVQUAL
/**
 * Seeded credentialing directory — the mock/seeded backing for the `credentialing` seam.
 *
 * DATA, not logic. Synthetic reviewers; no real people. Every NPI here is check-digit valid under
 * the NPPES 80840 Luhn (`identity/provider/npi.ts`) — the programme has already been bitten once by
 * a fixture NPI that was not.
 *
 * WHY THERE IS A REVIEWER PER REFUSAL REASON. `getDataMode` defaults every seam to `'mock'`, so a
 * seeded credentialing source that only ever contains qualified reviewers makes ALLOW the single
 * reachable behaviour of the new gate: no demo, no CI run and no pilot before cutover would ever
 * observe it refuse. E14 would see a wired path, E13 a tested module, and neither sees a gate that
 * has never said no. A governance control you cannot show refusing is a control you cannot claim, so
 * the directory below seeds one reviewer for each refusal the gate can issue, and the demo can walk
 * any of them on camera.
 *
 * Timestamps are expressed relative to a fixed EPOCH ANCHOR rather than `Date.now()`, so this file
 * is deterministic and the seeded expiries do not silently become "expired" as the calendar moves.
 */
import type { CredentialRecord } from './types';

/**
 * The seed's reference "now" — 2026-06-01T00:00:00Z.
 *
 * Every timestamp below is written as an OFFSET from this anchor, and `materializeSeed` re-bases
 * those offsets onto whatever `asOfMs` a lookup supplies. So the anchor is a writing convenience,
 * not a fixed point in the calendar: a 2030 decision sees the same relative picture a 2026 one does,
 * and the deliberate refusal fixtures (`/expired`, `/stale`) go on refusing forever.
 *
 * Tests may still pass `SEED_EPOCH_MS` as `asOfMs`, which makes it a no-op re-base and keeps their
 * arithmetic readable.
 */
export const SEED_EPOCH_MS = Date.UTC(2026, 5, 1);
const DAY = 24 * 60 * 60 * 1000;

/**
 * Re-base a seeded record's timestamps from the writing anchor onto the decision time.
 *
 * WHAT THIS FIXES. The records were absolute: `Practitioner/dev`'s licence expired at
 * `SEED_EPOCH_MS + 365 days` = 2027-06-01, and its file was refreshed at `SEED_EPOCH_MS - 30 days`,
 * which crosses `MAX_CREDENTIAL_AGE_MS` on 2027-06-06. The routes pass `now()`, not the anchor, so
 * from those dates every clinical determination would have refused `licence-expired-at-decision` and
 * then every determination `credential-record-stale` — the demo failing closed on a calendar date,
 * blaming the reviewer's licence, with nothing in the diff to point at. Offsets remove the date.
 */
export function materializeSeed(rec: CredentialRecord, asOfMs: number): CredentialRecord {
  const shift = asOfMs - SEED_EPOCH_MS;
  if (shift === 0) return rec;
  return {
    ...rec,
    sourceAsOfMs: rec.sourceAsOfMs + shift,
    licences: rec.licences.map((l) => ({ ...l, expiresAtMs: l.expiresAtMs + shift })),
    expertiseAttestations: rec.expertiseAttestations.map((a) => ({
      ...a,
      attestedAtMs: a.attestedAtMs + shift,
    })),
  };
}

const federalAttestation = (
  needDomain: CredentialRecord['expertiseAttestations'][number]['needDomain'],
  attestedBy: string,
  ref: string
) => ({
  needDomain,
  attestedBy,
  attestationRef: ref,
  standardApplied: 'federal:42CFR438.210(b)(3)',
  attestedAtMs: SEED_EPOCH_MS - 120 * DAY,
});

/**
 * The seeded reviewers.
 *
 * `sourceId` is literally `seeded-credentialing-directory` on every row, and the seam does not
 * overwrite it. A ledger row that says that is honest; one that said `credentialing-system-of-record`
 * because a constant was reused would be the "intact badge over a hash that omitted fields" failure
 * wearing a new noun.
 */
export const SEED_CREDENTIAL_RECORDS: readonly CredentialRecord[] = Object.freeze([
  {
    // The happy path: a board-certified physician reviewer, the case everyone pictures.
    // The reviewers who make the design's actual point are `/bh-peer` and `/ltss-cm` below — they
    // hold NO NPI, deliberately, because the most common initial-determination decider in Medicaid
    // managed care does not bill and has none, and an NPI-anchored design would have excluded
    // exactly those people. (This comment previously claimed THIS record had no NPI. It has one,
    // two lines down. A comment asserting the opposite of the data beside it is a defect here.)
    reviewerRef: 'Practitioner/dev',
    display: 'Dr. Alex Rivera, UM Reviewer',
    npi: '1730154782',
    licences: [
      {
        type: 'MD',
        jurisdiction: 'NY',
        number: 'NY-MD-000001',
        restricted: false,
        expiresAtMs: SEED_EPOCH_MS + 365 * DAY,
      },
    ],
    boardCertifications: [
      {
        board: 'ABIM',
        specialty: 'Internal Medicine',
        certified: true,
        eligible: true,
        yearsInSpecialty: 12,
      },
    ],
    taxonomy: '207R00000X',
    expertiseAttestations: [
      federalAttestation('medical', 'Credentialing Committee', 'ATT-MED-0001'),
    ],
    sourceAsOfMs: SEED_EPOCH_MS - 30 * DAY,
    sourceId: 'seeded-credentialing-directory',
  },
  {
    // A behavioral-health peer who is NOT a physician. The regulation names behavioral health
    // explicitly, and reading it as "physician" is the error this programme just retracted.
    reviewerRef: 'Practitioner/bh-peer',
    display: 'Jordan Ellis, LCSW — BH Reviewer',
    licences: [
      {
        type: 'LCSW',
        jurisdiction: 'NY',
        number: 'NY-LCSW-000044',
        restricted: false,
        expiresAtMs: SEED_EPOCH_MS + 200 * DAY,
      },
    ],
    boardCertifications: [],
    expertiseAttestations: [
      federalAttestation('behavioral-health', 'Behavioral Health Medical Director', 'ATT-BH-0007'),
    ],
    sourceAsOfMs: SEED_EPOCH_MS - 10 * DAY,
    sourceId: 'seeded-credentialing-directory',
  },
  {
    // An LTSS reviewer: an RN care manager. A taxonomy match against the SERVICE (home-health aide)
    // would fail this person, who is exactly the right reviewer for a personal-care-hours reduction.
    reviewerRef: 'Practitioner/ltss-cm',
    display: 'Robin Okafor, RN — LTSS Care Manager',
    licences: [
      {
        type: 'RN',
        jurisdiction: 'NY',
        number: 'NY-RN-000912',
        restricted: false,
        expiresAtMs: SEED_EPOCH_MS + 300 * DAY,
      },
    ],
    boardCertifications: [],
    expertiseAttestations: [federalAttestation('ltss', 'Plan LTSS Clinical Lead', 'ATT-LTSS-0003')],
    sourceAsOfMs: SEED_EPOCH_MS - 5 * DAY,
    sourceId: 'seeded-credentialing-directory',
  },
  {
    // A second qualified reviewer. `Practitioner/rev-1` is the identity `approvalAuthority`'s own
    // documentation uses and the recovery routes exercise; a plan has more than one reviewer, and a
    // directory with exactly one makes every test look like the same person.
    reviewerRef: 'Practitioner/rev-1',
    display: 'Dr. Sam Okonkwo, UM Reviewer',
    npi: '1987654328',
    licences: [
      {
        type: 'MD',
        jurisdiction: 'NY',
        number: 'NY-MD-000002',
        restricted: false,
        expiresAtMs: SEED_EPOCH_MS + 365 * DAY,
      },
    ],
    boardCertifications: [
      {
        board: 'ABIM',
        specialty: 'Internal Medicine',
        certified: true,
        eligible: true,
        yearsInSpecialty: 9,
      },
    ],
    taxonomy: '207R00000X',
    expertiseAttestations: [
      federalAttestation('medical', 'Credentialing Committee', 'ATT-MED-0002'),
      federalAttestation('behavioral-health', 'Behavioral Health Medical Director', 'ATT-BH-0002'),
    ],
    sourceAsOfMs: SEED_EPOCH_MS - 15 * DAY,
    sourceId: 'seeded-credentialing-directory',
  },
  // ── Below: one reviewer per refusal code, so every refusal is demonstrable ──────────────────
  {
    /** REFUSAL: licence-expired-at-decision. */
    reviewerRef: 'Practitioner/expired',
    display: 'Sam Nguyen, MD (licence lapsed)',
    licences: [
      {
        type: 'MD',
        jurisdiction: 'NY',
        number: 'NY-MD-000777',
        restricted: false,
        expiresAtMs: SEED_EPOCH_MS - 1 * DAY,
      },
    ],
    boardCertifications: [],
    expertiseAttestations: [
      federalAttestation('medical', 'Credentialing Committee', 'ATT-MED-0099'),
    ],
    sourceAsOfMs: SEED_EPOCH_MS - 20 * DAY,
    sourceId: 'seeded-credentialing-directory',
  },
  {
    /** REFUSAL: licence-restricted. A valid, unexpired licence under discipline is still a refusal. */
    reviewerRef: 'Practitioner/restricted',
    display: 'Casey Lam, MD (licence restricted)',
    licences: [
      {
        type: 'MD',
        jurisdiction: 'NY',
        number: 'NY-MD-000888',
        restricted: true,
        expiresAtMs: SEED_EPOCH_MS + 365 * DAY,
      },
    ],
    boardCertifications: [],
    expertiseAttestations: [
      federalAttestation('medical', 'Credentialing Committee', 'ATT-MED-0098'),
    ],
    sourceAsOfMs: SEED_EPOCH_MS - 20 * DAY,
    sourceId: 'seeded-credentialing-directory',
  },
  {
    /** REFUSAL: licence-jurisdiction-mismatch. Licensed, current, wrong state. */
    reviewerRef: 'Practitioner/out-of-state',
    display: 'Avery Stone, MD (CA licence only)',
    licences: [
      {
        type: 'MD',
        jurisdiction: 'CA',
        number: 'CA-MD-000123',
        restricted: false,
        expiresAtMs: SEED_EPOCH_MS + 365 * DAY,
      },
    ],
    boardCertifications: [],
    expertiseAttestations: [
      federalAttestation('medical', 'Credentialing Committee', 'ATT-MED-0097'),
    ],
    sourceAsOfMs: SEED_EPOCH_MS - 20 * DAY,
    sourceId: 'seeded-credentialing-directory',
  },
  {
    /** REFUSAL: expertise-not-attested. Impeccably licensed, attested for the WRONG need domain. */
    reviewerRef: 'Practitioner/no-bh-attestation',
    display: 'Morgan Diaz, MD (medical only)',
    licences: [
      {
        type: 'MD',
        jurisdiction: 'NY',
        number: 'NY-MD-000555',
        restricted: false,
        expiresAtMs: SEED_EPOCH_MS + 365 * DAY,
      },
    ],
    boardCertifications: [
      {
        board: 'ABIM',
        specialty: 'Internal Medicine',
        certified: true,
        eligible: true,
        yearsInSpecialty: 8,
      },
    ],
    expertiseAttestations: [
      federalAttestation('medical', 'Credentialing Committee', 'ATT-MED-0055'),
    ],
    sourceAsOfMs: SEED_EPOCH_MS - 20 * DAY,
    sourceId: 'seeded-credentialing-directory',
  },
  {
    /** REFUSAL: credential-record-stale. Everything valid; the SOURCE has not refreshed in 500 days. */
    reviewerRef: 'Practitioner/stale',
    display: 'Riley Chen, MD (credential file stale)',
    licences: [
      {
        type: 'MD',
        jurisdiction: 'NY',
        number: 'NY-MD-000666',
        restricted: false,
        expiresAtMs: SEED_EPOCH_MS + 365 * DAY,
      },
    ],
    boardCertifications: [],
    expertiseAttestations: [
      federalAttestation('medical', 'Credentialing Committee', 'ATT-MED-0066'),
    ],
    sourceAsOfMs: SEED_EPOCH_MS - 500 * DAY,
    sourceId: 'seeded-credentialing-directory',
  },
  {
    /** REFUSAL: licence-absent. In the directory, holds no licence at all (an admin, say). */
    reviewerRef: 'Practitioner/unlicensed',
    display: 'Pat Alvarez, UM Coordinator',
    licences: [],
    boardCertifications: [],
    expertiseAttestations: [],
    sourceAsOfMs: SEED_EPOCH_MS - 10 * DAY,
    sourceId: 'seeded-credentialing-directory',
  },
]);

/** Keyed index: reviewerRef -> record. */
export const SEED_CREDENTIAL_INDEX: ReadonlyMap<string, CredentialRecord> = new Map(
  SEED_CREDENTIAL_RECORDS.map((r) => [r.reviewerRef, r])
);
