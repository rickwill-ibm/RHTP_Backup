# FAKE_FIDELITY — `credentialing` (C-REVQUAL)

What this module really does, and what it does not. Written so that "reviewer qualification is
enforced" is a sentence someone can check rather than take on trust.

## What is REAL, in every mode

These are the parts that make the claim honest. They are not seeded and not mocked.

1. **The binding.** The check runs at `agentRuntime/engine.signal()` — the resolution path itself —
   not only at a route. Before this, `isQualifiedHumanDecision` was never called on the engine's
   path at all: `signal()` handed `decidedBy` straight to `decide()`, so `''`, `'system'` and even
   `'autonomy:autonomous'` resolved a human-gated adverse proposal, and `agents/demo/index.ts`
   reached it over HTTP with the literal `'demo-reviewer'`. Binding a route alone would have covered
   one of eight paths.

   **What the engine check does and does not verify**, stated precisely because the first draft of
   this line overstated it. It verifies that a proof exists, that this module minted it, that it
   names the decider the record will carry, and that its SCOPE covers this determination's class and
   need domain. It does **not** re-derive the licence verdict — that was computed when the proof was
   minted, against the `asOfMs` the minter supplied. A caller that mints a proof at the wrong instant
   gets a proof that says so, and the ledger records the instant; nothing at the engine second-guesses
   it.

2. **The refusal.** Fail-closed on absent identity, unknown reviewer, stale record, absent licence,
   expired-at-decision, restricted, wrong jurisdiction, unattested need domain, prior involvement,
   unknown supervisory chain, and absent State determination. Production with no registered source
   **throws**.
3. **Non-constructibility, in BOTH halves.** `QualifiedReviewer` carries an unexported brand symbol,
   so a caller literal does not type-check. That half is compile-time only: the brand is a
   `declare const` and at runtime a proof is an ordinary frozen object, which an `as` cast, a spread
   of a real proof, or a future JSON boundary would satisfy. So the minting module also keeps a
   private `WeakSet` and `assertSignalDecider` calls `isMintedProof` — membership cannot be forged by
   a cast, a spread or a parse. Both halves are pinned by tests.
4. **As-at pinning.** The verdict records `asOfMs`, `sourceId` and `sourceAsOfMs`, so a record
   re-read years later shows what was true at the decision — not what a later re-evaluation computes.
5. **The determination class and need domain as inputs.** An administrative denial does not require
   a clinical peer; a behavioral-health determination is not satisfied by a medical attestation.

## What is SEEDED, and must be replaced before pilot

The data. `seedDirectory.ts` is a synthetic directory of ten reviewers, and its timestamps are
OFFSETS re-based onto the decision time by `materializeSeed` — so the seed says the same thing in
2026 and in 2030. It previously used absolute dates anchored to 2026-06-01, which meant every
qualified reviewer's licence expired on **2027-06-01** and every record went stale on **2027-06-06**,
on every route that passes `now()`. The demo would have failed closed on a calendar date, with a 403
blaming the reviewer's licence and nothing in the diff to point at. In seeded mode every verdict
carries `sourceId: 'seeded-credentialing-directory'`, literally — a ledger row that says so is
honest, and nothing rewrites it to something more impressive.

**The seeded source does NOT do any of the following, and a pilot must:**

- **No primary-source verification.** Licences are not checked against a state licensing board. The
  seed asserts them.
- **No exclusion or sanction screening.** No OIG LEIE, no SAM.gov, no state Medicaid exclusion list.
  42 CFR 455.436 requires exclusion checks **monthly**; a valid licence and an active exclusion are
  independent facts and a reviewer can hold both. `CredentialRecord` now carries `excluded` and
  `exclusionCheckedAtMs`, and `assertReviewerQualified` refuses `reviewer-excluded` when a source
  says so — but **the seeded source never sets them**, so in every mode this platform ships today,
  exclusion is UNSCREENED, which is not the same as clear. The slot exists so a pilot wiring a real
  screening feed changes one source, not the type, the refusal union, the seed and every test.
- **No re-credentialing cycle.** `MAX_CREDENTIAL_AGE_MS` (400 days) is a deliberately generous outer
  bound that makes staleness visible; it is not a credentialing cycle. NCQA runs on 36 months, and a
  real programme sets this from its own policy.
- **No mid-session revocation.** A licence suspended between sign-in and decision is not re-checked,
  and there is no negative-cache TTL.
- **No NY UR-agent certification check.** NY PHL Article 49 requires the utilization-review agent
  itself to be certified. Out of scope here entirely.
- **No delegated-entity model.** 42 CFR 438.230: if the credentialing source is a delegated vendor,
  the MCO remains fully accountable, and the record should carry the delegate id and agreement
  reference. Registered, not built.

## What is ATTESTED rather than verified — by design, not by omission

`ExpertiseAttestation` records that a **named attester** stated this reviewer has appropriate
expertise for a need domain, under a **named standard**, on a date. The platform does not conclude
it.

This is deliberate and it is the honest shape. The first design computed a match from the reviewer's
NPPES taxonomy code, and that proxy fails in both directions: the seed's own Psychiatry code
(`2084P0800X`) family-matches Neurology (`2084N0400X`) — a pass that is not a behavioral-health
peer — while an LTSS personal-care-hours reduction fails a taxonomy match against the RN care
manager who is exactly the right reviewer. NPPES is a self-reported enumeration attribute; a
credentialing conclusion cannot rest on it. So the ledger says who attested and under which standard,
and a reader can audit the attester.

## What the CLIENT still influences, stated plainly

A rejection is treated as a **clinical** determination by default and can only be reduced to
administrative by declaring an enumerated `denialBasis` (`eligibility`, `timeliness`,
`benefit-exhaustion`), which is validated server-side against a closed set and recorded in the audit
row. Anything unrecognised is clinical. This replaced a version in which the clinical bar was decided
by `isAdverseCoverageAction(body.actionType)` — free text from the request — so posting
`actionType: 'pa-determination'` matched no adverse token, fell through to administrative, and an
unlicensed reviewer could record a behavioral-health denial. The client no longer chooses whether the
bar applies; it can only assert, on the record, which administrative basis it is claiming.

## Known gaps registered against this module

- **G-047** — the deemed-adverse contradiction: a 42 CFR 438.404(c)(5) clock-expiry adverse
  determination **has no reviewer**, and this gate must not be satisfied by inventing one.
- **G-048** — no disparate-impact view by reviewer, and no metric for the share of adverse
  determinations by attestation source. The latter is the first number a state auditor asks for.
- **G-049** — parity: if behavioral-health denials end up requiring a harder-to-satisfy reviewer
  predicate than medical ones, this control is itself an NQTL under 42 CFR 438 Subpart K.
