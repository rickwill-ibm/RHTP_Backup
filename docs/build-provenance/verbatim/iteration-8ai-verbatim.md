# Iteration 8A-i — verbatim agent prompts (exactly as sent, composed per v1.1)

Iteration-level master prompt inherited by all: `coalition/inputs/iteration8ai_context.md`. Every per-agent prompt below is COMPOSED per the v1.1 Prompt Composition Standard (ROLE / INHERITS / CONTEXT MANIFEST / SCOPE / DoD / OUTPUT / STYLE) and captured verbatim at send-time (E10). Wave D appended at iteration close.

---

## Agent: 8A-i probe (harness/scope)
```
Harness probe for Iteration 8A-i in /home/claude/baseline. Do exactly: (1) Bash `cd /home/claude/baseline && node -e "const{newDb}=require('pg-mem');newDb();console.log('pgmem-ok')"`; (2) list the existing identity module: `ls src/lib/identity && ls src/lib/identity/external 2>/dev/null`; (3) find where the I4 external EMPI stubs + candidate source live: `rg -l "ExternalEmpiNotConfigured|pixPdq|pixmPdqm|mockIdentitySource|EmpiCandidateSource" src/lib/identity`; (4) find raw provider refs deferred to I8A: `rg -c "deferred-I8A|providerResolution" src/lib | head`; (5) Write /home/claude/baseline/.iter8aiprobe with "ok". Reply under 45 words: pgmem ok, identity module contents, the external-EMPI stub files, whether deferred-I8A provider refs exist y/n.
```

## Agent: 8A-i wave A — survivorship + cross-reference (F3)
```
ROLE: Identity specialist (framework B2), disjoint tree. Framework v1.1.
INHERITS: /home/claude/coalition/inputs/iteration8ai_context.md (F3 spec + pinned namespace + shared-file partitions).
CONTEXT MANIFEST: read the brief; src/lib/identity/{empiResolver,identitySource,resolveIdentity,mpiTypes}.ts; src/lib/graph merge/unmerge rekey (rg "merge|unmerge|rekey" src/lib/graph); src/lib/config/dataMode.ts + seamDispositions.ts; src/lib/clock.ts; the outbox event shape (src/lib/outbox). You OWN src/lib/identity/survivorship/ and src/lib/identity/crossReference/ and tests/identity/{survivorship,crossReference}.test.ts. Do NOT touch src/lib/identity/external/ (wave B) or src/lib/identity/provider/ (wave C). In shared files (seamDispositions.ts, dataMode.ts, identity/index.ts) append ONLY your own clearly-commented block.
Working tree /home/claude/baseline; live, committed to production repo.

SCOPE (F3 golden-record survivorship + cross-reference, close the fragmentation):
1. src/lib/identity/crossReference/ - a member<->source-id cross-reference table (pg-mem backed for tests; seam via getDataMode). Operations: link(sourceId, memberId), unlink, lookup(sourceId)->memberId, merge(memberA, memberB), unmerge. link/merge/unmerge EMIT events (C2 envelope, memberId-partitioned) so graph projectors rekey by REPLAY (never in-place key rewrite - reuse the DP-7 pattern the graph already has). Declare a crossReference seam in seamDispositions.ts (fail-closed-stub in production until pg wired, real logic + pg-mem for tests).
2. src/lib/identity/survivorship/ - source-ranked survivorship rules AS DATA (data/survivorship-rules.json: per-field source ranking), a golden-record BUILDER that takes source-attributed facts + the rules and derives the golden view WITH per-field provenance (which source won each field). The golden record is a PROJECTION - store source-attributed facts, derive the golden view - so rules can change without data loss. Deterministic (inject clock).
3. WIRE the fragmentation fix: extend resolveIdentity so an id-only record whose source id is already linked in the xref resolves to the EXISTING member (not a new mint); a genuinely new source id still mints, and records the xref link. This is the F3 core fix.
4. Tests (tests/identity/survivorship.test.ts + crossReference.test.ts): same person across TWO feeds LINKS to one member not two (the fragmentation proof); survivorship picks the ranked source per field with provenance; changing the rules changes the golden view without losing source facts; merge emits a rekey event and unmerge reverses; link/unlink round-trip.

DoD: composite DoD; specifically prove the fragmentation fix (two feeds -> one member), survivorship-as-projection, and E1 seam declared. E9: an ambiguous link must NOT fail open to a wrong member.
OUTPUT: write /home/claude/baseline/ITER8AI_WAVEA_REPORT.md; reply ONLY: xref+survivorship built y/n, fragmentation-fixed y/n, golden-record-is-projection y/n, new seam declared y/n, new test count, verification status (tsc/vitest/size).
STYLE: no em dash followed by a space; no double spaces.
```

## Agent: 8A-i wave B — external EMPI real logic (PIX/PDQ + PIXm/PDQm)
```
ROLE: Identity/interoperability specialist (B2), disjoint tree. Framework v1.1.
INHERITS: /home/claude/coalition/inputs/iteration8ai_context.md.
CONTEXT MANIFEST: read the brief; src/lib/identity/external/ (the I4 stubs: types.ts, pixPdqResolver.ts, pixmPdqmResolver.ts, index.ts, README.md) - you make these REAL; src/lib/identity/empiResolver.ts + resolveIdentity.ts (how the resolver-kind is selected); src/lib/config/dataMode.ts + seamDispositions.ts; the possible-match HELD semantics (rg "HELD|held|possible-match" src/lib/identity). You OWN src/lib/identity/external/ and tests/identity/externalEmpi.test.ts. Do NOT touch src/lib/identity/survivorship, crossReference (wave A), or provider (wave C). Shared files: append only your clearly-commented block.
Working tree /home/claude/baseline; live.

SCOPE (make external EMPI real):
1. PIX/PDQ (HL7v2): in pixPdqResolver.ts implement REAL query construction + response parsing - PIX query (QBP^Q23 patient-identifier cross-reference) returning the enterprise/global id; PDQ (QBP^Q22 demographics query) returning candidate demographics. Build the message + parse the response against a FAKE MPI you write for tests (message-shaped, deterministic). Live endpoint (host, assigning-authority OID, sending/receiving app+facility) is CI-pending: fail-closed (throw ExternalEmpiNotConfiguredError) when not configured, but the query/parse LOGIC is real and tested against the fake.
2. PIXm/PDQm (FHIR): in pixmPdqmResolver.ts implement REAL logic - PIXm $ihe-pix operation (identifier cross-reference) and PDQm Patient search (demographics); construct the FHIR request + parse the Bundle/Parameters response against a fake FHIR MPI. Same fail-closed-without-config rule.
3. The enterprise/global id returned by an external resolver becomes the anchored member id; external results STILL respect possible-match HELD semantics (a low-confidence external match is HELD, not auto-linked) and feed the survivorship/xref (wave A) - reference its link() if available, else note the integration point.
4. resolver-kind selectable internal | external-pixpdq | external-pixm-pdqm via the identity seam; internal stays default. Keep/confirm the seamDispositions entries.
5. Tests (tests/identity/externalEmpi.test.ts): PIX query builds + parses to an enterprise id (fake MPI); PDQ demographics query; PIXm/PDQm FHIR equivalents; each throws NotConfigured without live config; a low-confidence external match is HELD not auto-linked; resolver-kind selection works.

DoD: composite DoD; prove real query/parse logic (not a stub), fail-closed without live MPI, HELD semantics on external results. E9: no fail-open (an unresolved external query fails closed/HELD, never returns a default identity).
OUTPUT: write /home/claude/baseline/ITER8AI_WAVEB_REPORT.md; reply ONLY: PIX/PDQ real y/n, PIXm/PDQm real y/n, fail-closed-without-MPI y/n, HELD-on-external y/n, new test count, verification status.
STYLE: no em dash followed by a space; no double spaces.
```

## Agent: 8A-i wave C — provider identity NPI/NPPES (F5)
```
ROLE: Provider-identity specialist (B2), disjoint tree. Framework v1.1.
INHERITS: /home/claude/coalition/inputs/iteration8ai_context.md (F5 spec).
CONTEXT MANIFEST: read the brief; the raw provider refs deferred to I8A (rg -n "deferred-I8A|providerResolution" src/lib - primarily src/lib/pipeline/adapters/referral.ts, and provider refs in claims/care-team/medication mappings); src/lib/config/dataMode.ts + seamDispositions.ts; src/lib/graph/mapping (how nodes are declared) + the node-type pattern; src/lib/clock.ts. You OWN src/lib/identity/provider/ and its graph node + tests/identity/providerIdentity.test.ts. Do NOT touch survivorship/crossReference (wave A) or external/ (wave B). Shared files: append only your clearly-commented block.
Working tree /home/claude/baseline; live.

SCOPE (F5 provider identity via NPI/NPPES):
1. src/lib/identity/provider/ - NPI validation (the NPPES Luhn check-digit algorithm with the 80840 prefix; reject invalid NPIs) + a provider identity resolver: given an NPI (or a raw provider ref carrying one), resolve to a ProviderIdentity (NPI-anchored, with name/taxonomy/org when available). Real NPPES registry lookup is behind a fail-closed seam (providerIdentity seam: mock/seeded = a seeded provider directory data file, production = NppesNotConfiguredError until the live NPPES API is wired). Declare providerIdentity in seamDispositions.ts.
2. A ProviderIdentity graph node type (NPI-anchored) + the mapping so a resolved provider projects as a ProviderIdentity node; the referral/claims/care-team provider refs that were raw+deferred now RESOLVE to and link to this node (update the referral mapping's raw ref to resolve via the provider resolver where an NPI is present; keep raw+flagged only when no NPI). Reuse existing Member/Encounter node types for edges (e.g. performed-by, prescribed-by).
3. Deterministic; feature-first; <=400 lines/file; README.
4. Tests (tests/identity/providerIdentity.test.ts): valid NPI passes, invalid NPI (bad check digit) rejected; a provider ref with an NPI resolves to a ProviderIdentity (seeded dir); production without NPPES config throws NotConfigured; a referral provider ref now projects a ProviderIdentity node instead of a raw string.

DoD: composite DoD; prove NPI validation, provider resolution to a node, fail-closed without NPPES. E9: an unresolvable provider must NOT fail open to a fabricated identity - keep raw+flagged or throw, never invent an NPI.
OUTPUT: write /home/claude/baseline/ITER8AI_WAVEC_REPORT.md; reply ONLY: NPI-validation y/n, provider-resolves-to-node y/n, fail-closed-without-NPPES y/n, deferred-I8A-refs-now-resolve y/n, new test count, verification status.
STYLE: no em dash followed by a space; no double spaces.
```

---
Note: these are the COMPLETE composed prompts as sent (not condensed). Compare their block structure to the Iteration-7 wave-A/B/C hand-authored prompts (verbatim/iteration-7-verbatim.md) to see the v1.1 composition standard applied: ROLE and CONTEXT MANIFEST are now explicit separable blocks, the DoD is referenced not re-typed, and the reads list is a bounded manifest rather than inline prose.

---

## Agent: 8A-i wave D — convergence + red-team panel (COMPOSED v1.1; captured verbatim at send-time per E10)
```
ROLE: Convergence engineer (B3) + red-team panel host (R1 domain-fidelity = healthcare identity/interoperability: IHE PIX/PDQ + PIXm/PDQm, EMPI golden-record survivorship, NPPES/NPI; R2 negative-space; R3 stub-legitimacy on the new external identity seams). Framework v1.2.
INHERITS: /home/claude/coalition/inputs/iteration8ai_context.md (Wave D scope + composite DoD).
CONTEXT MANIFEST: working tree /home/claude/baseline (live, committed to the production repo). Read the 3 wave reports (ITER8AI_WAVEA/B/C_REPORT.md); the new identity modules src/lib/identity/{survivorship,crossReference,external,provider}/; src/lib/config/{dataMode,seamDispositions}.ts (new seams: crossReference, providerIdentity, and the identity resolver-kind internal|external-pixpdq|external-pixm-pdqm); the HELD / possible-match semantics (rg "HELD|held|possible-match" src/lib/identity); the DP-7 merge/unmerge replay-rekey in src/lib/graph; verification/GAP_AND_STUB_RISK_REGISTER.md (F3, F5 owned here). You MAY edit any file to fix findings; add NO new domains.
SCOPE:
1) CONVERGENCE to DRY: reconcile the shared files the three waves each appended to (seamDispositions.ts, dataMode.ts, identity/index.ts) - no duplicated seam entries, no divergent exports; confirm the per-wave test partitions (survivorship / crossReference / externalEmpi / providerIdentity) all run; registries consistent; determinism (clock injected) intact.
2) E9 FAIL-OPEN SWEEP (standing check) on the IDENTITY PATH specifically: an ambiguous or low-confidence match must fail to HELD, never to a wrong-person link or a fabricated identity; an unresolved external EMPI query must throw NotConfigured / hold, never return a default identity; an unresolvable provider must stay raw+flagged, never invent an NPI. rg the fail-open shapes across src/lib/identity; each hit justified inline or fixed fail-closed NOW.
3) RED-TEAM PANEL (mandatory; every persona MUST produce findings - "looks fine" is a failed review):
   - R1 domain-fidelity (identity/interoperability): are the PIX/PDQ QBP^Q23 / QBP^Q22 messages + the PIXm/PDQm FHIR ($ihe-pix / Patient search) query+parse real and standard-faithful? Is survivorship a true golden-record PROJECTION (source-attributed facts stored, golden view derived, per-field provenance, rules changeable without data loss)? Is merge/unmerge rekey-by-replay, not in-place? Is NPI validation the real NPPES Luhn + 80840 prefix check? Assigning-authority / OID handling on external enterprise ids?
   - R2 negative-space: what production identity capability is entirely ABSENT (link/unlink audit trail, unmerge reversal completeness, cross-reference under concurrent writers, external assigning-authority conflicts, survivorship tie-breaks, held-review resolution surface)? Produce a missing-list, not a pass.
   - R3 stub-legitimacy: grade every new seam/stub (crossReference pg, external MPI, NPPES) Acceptable / Risky / Unacceptable; any that could masquerade as real or fail open is Unacceptable - fix now.
4) Fix all Unacceptable this wave. Update verification/GAP_AND_STUB_RISK_REGISTER.md: add an "Iteration 8A-i" section; close or advance F3 and F5 with any residual; add new findings with dispositions.
DoD (composite gate v1.2): tsc 0; full suite green (the orchestrator re-runs it authoritatively); size/ratchet PASS; no fail-open shapes (E9); seams declared fail-closed (E1); convergence DRY; every red-team persona produced findings; zero new Unacceptable left open; F3/F5 dispositioned in the register.
OUTPUT: write /home/claude/baseline/ITER8AI_WAVED_REPORT.md (convergence actions; E9 sweep result; R1/R2/R3 finding tables with dispositions; F3/F5 disposition; final verification). Reply ONLY: convergence DRY y/n, E9 result (clean or fixed-N), R1/R2/R3 finding counts, Unacceptable fixed y/n, F3 disposition, F5 disposition, tsc+suite+size status.
STYLE: no em dash followed by a space; no double spaces.
```
NOTE (outcome appended after run): captured at send-time; the orchestrator re-runs the authoritative gate independently after this agent returns (E5 - trust artifacts + own gate, not the agent's self-report).
