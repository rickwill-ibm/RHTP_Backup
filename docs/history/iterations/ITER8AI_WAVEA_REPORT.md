# Iteration 8A-i Wave A Report: F3 golden-record survivorship + cross-reference

Role: Identity specialist (framework B2), disjoint tree. Framework v1.1.
Working tree: /home/claude/baseline (live, committed to production repo).

## Scope delivered

Closes register item F3 (CRITICAL): no golden-record survivorship, no
cross-reference / link-unlink, id-only records minting a new member per feed and
fragmenting the same person across feeds.

### 1. Cross-reference table (src/lib/identity/crossReference/)

A member <-> source-id cross-reference that closes identity fragmentation.

- `xref.ts`: the pure, synchronous cross-reference engine. Two append-only fact
  sets (links: sourceId -> members; merges: mergedMemberId -> survivor). `lookup`
  resolves a source id at read time, mapping every linked member through the merge
  chain to its ultimate survivor. One distinct survivor -> linked; two or more
  distinct unmerged survivors -> ambiguous (E9); none -> unlinked. Shared
  `resolveLookup` defines the fragmentation + E9 semantics once.
- `memoryCrossReferenceStore.ts`: async facade over the engine (mock/seeded
  default, demo stays green).
- `pgCrossReferenceStore.ts`: pg-mem / pg-backed durable store. Append-only
  `identity_xref` fact table, inline DDL, same resolve semantics via
  `resolveLookup`. No UPDATE / DELETE path (DP-7 replayable history).
- `events.ts`: C2 envelope builders. link -> `identity.xref-linked`, unlink ->
  `identity.xref-unlinked`, merge -> `member.merged`, unmerge -> `member.unmerged`
  (the exact constants src/lib/graph/replay.ts recognizes). All memberId-
  partitioned, deterministic under injected now/rng.
- `index.ts`: the `crossReference` seam selector. mock/seeded -> in-memory store;
  production with no registered factory throws `CrossReferenceStoreNotConfiguredError`
  (fail-closed-stub). E1 disposition declared.

Operations link / unlink / lookup / merge / unmerge each EMIT events so graph
projectors rekey by REPLAY (never in-place key rewrite), reusing the DP-7 pattern
the graph already has.

### 2. Golden-record survivorship (src/lib/identity/survivorship/)

Source-ranked survivorship rules AS DATA plus a golden-record builder.

- `data/survivorship-rules.json`: per-field source ranking, pure data.
- `rules.ts`: loads + validates the ruleset (rules as data, no code); a caller can
  pass its own ruleset.
- `goldenRecord.ts`: `buildGoldenRecord(facts, {rules, now})` derives the golden
  view WITH per-field provenance (which source won each field, at what rank, and
  why). The golden record is a PROJECTION: source-attributed facts are the stored
  source of truth, the golden view is derived, so rules can change without data
  loss. Deterministic (injected clock).

Per field: walk the ranking top-first, first asserting source wins (most-recent
tiebreak within a source), else recency-fallback so an unranked source still
surfaces rather than being dropped.

### 3. Fragmentation fix wired into resolveIdentity (src/lib/identity/empiResolver.ts)

`resolveEmpi` gained an optional synchronous `xref` reader. An id-only record whose
source id is already linked resolves to the EXISTING member (no per-feed mint); a
genuinely new source id mints AND returns a link intent; a demographic match also
returns a link intent. An ambiguous xref resolves to HELD (E9), never a wrong
member. `createXrefEmpiResolver(xref, source?)` is the wired IdentityResolver: it
records link intents into the index (emitting events) and throws HeldIdentityError
on ambiguity so the record routes to human review. All changes are additive and
backward-compatible (xref optional; the default `empiResolver` is unchanged).

### 4. Tests (tests/identity/{survivorship,crossReference}.test.ts): 19 new

- Fragmentation proof: the same source id across two feeds LINKS to one member,
  not two; a genuinely new source id still mints a distinct member.
- E9: an ambiguous source id (two distinct unmerged members) resolves to HELD and
  the wired resolver throws HeldIdentityError; it never returns a wrong member.
  Merging the two members resolves the ambiguity to the survivor.
- Survivorship picks the ranked source per field with provenance; rank beats
  recency across sources; recency breaks ties within a source; unranked source
  surfaces via recency-fallback; derivedAt deterministic.
- Golden-record-is-projection: re-deriving under different rules changes the golden
  view from the SAME, unmutated facts (no data loss).
- link/unlink round-trip; merge emits `member.merged` and the graph rekeys the
  subsumed subgraph onto the survivor by REPLAY; unmerge emits `member.unmerged`
  and reverses it; pg-mem store mirrors resolve + merge + ambiguity semantics.
- E1 seam fails closed in production.

## Shared-file partitions (append-only, my block only)

- `src/lib/config/dataMode.ts`: appended `crossReference` to DATA_MODE_SEAMS.
- `src/lib/config/seamDispositions.ts`: appended the `crossReference`
  fail-closed-stub disposition entry.
- `tests/governance/seamFailClosed.test.ts`: appended the `crossReference` prober +
  cleanup (required so the mechanical fail-closed gate stays green for the new seam).
- `src/lib/identity/index.ts`: created the shared identity barrel with a Wave A
  export block (structured for waves B/C to append).

Did not touch src/lib/identity/external/ (wave B) or src/lib/identity/provider/
(wave C).

## Verification (composite DoD)

- tsc: 0 errors (`tsc --noEmit`).
- Full suite: 1196 passed, 1 expected-fail, 91 skipped, 0 failures (baseline was
  1139 green). Wave A adds 19 tests.
- Size / ratchet: PASS, no new violations; every new file <= 400 lines (largest is
  pgCrossReferenceStore.ts at 131).
- E1 governance: new `crossReference` seam declared fail-closed-stub with a prober;
  the mechanical seamFailClosed gate is green.
- E9: an ambiguous link resolves to HELD, proven not to fail open to a wrong member.

## Residual / notes for Wave D

- The synchronous xref index is the projection the identity resolver reads; the
  durable pg store persists the same facts and is verified via pg-mem. Live pg
  wiring is a composition-root concern (fail-closed until registered), consistent
  with the idempotency / dead-letter seams.
- Pipeline integration point: whoever composes the pipeline resolver in production
  should build the xref index (rebuilt from the store/events) and use
  `createXrefEmpiResolver` so the fragmentation fix is live end-to-end.
