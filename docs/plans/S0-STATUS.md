# S0 — Foundation: build status & gate handoff

**Built autonomously, verified in an isolated cloud project mirroring this repo's config
(strict tsc + vitest, node env, `@/*`→`src/*`, prettier).** Nothing was committed or pushed —
this is staged in the working tree for you to run the canonical gate and push.

## What landed
Runtime (new, under `src/lib/policy/`):
- `anchor/verify.ts` — the multi-span byte-match anchoring spine (`verifyAnchor`, `makeSpan`,
  `hashText`, offset map). Fail-closed, no fuzzy fallback.
- `audit/ledger.ts` — append-only, content-addressed, hash-chained, tamper-evident ledger.
- `audit/modelClient.ts` — the single audited path to any model; PHI un-constructable at the
  type level + DLP block at runtime + fail-closed if the ledger can't record.
- `promote/loadPromoted.ts` — the single promotion choke point + per-scope `AutonomyPolicy`
  (pinned to HITL; denials capped at HITL).
- `pipeline/contracts.ts` — S0 type shapes (types-only; rides the E14/E13 types-only exemption).

Tests (new, under `tests/policy/`): `anchor.test.ts` (12), `ledger.test.ts` (6),
`modelClient.test.ts` (5), `loadPromoted.test.ts` (8), `phiReach.negative.ts` (compile-time
PHI guard, checked by tsc). **31 runtime tests + the compile-time guard, all green in cloud.**

## Gates pre-satisfied (so your canonical gate should pass)
- **Types (tsc strict):** green, incl. the compile-time PHI-reachability negative test.
- **Unit (vitest):** 31/31 green.
- **Test-link (E13):** each runtime module is imported by a test (linked); `contracts.ts` is
  types-only (auto-exempt via the exemption landed earlier today).
- **Wiring (E14):** the 4 runtime modules are intentionally unwired (foundation) and added to
  `docs/build-provenance/wiring-baseline.json`; they drop out of the baseline when a later
  phase wires them.
- **Size/ratchet:** every file well under the 400-line cap.
- **Prettier:** formatted to `.prettierrc`.

## To land it (your machine)
```bash
bash scripts/ci-gates.sh push        # or your normal pre-push gate
git add src/lib/policy/anchor src/lib/policy/audit src/lib/policy/promote \
        src/lib/policy/pipeline/contracts.ts tests/policy docs/build-provenance/wiring-baseline.json \
        docs/plans/S0-STATUS.md
git commit -m "feat(policy): S0 foundation — anchoring spine, audited model client + PHI guard, hash-chained ledger, loadPromoted choke point"
git push
```

## Framework note
Built under the framework: probe-first (mirrored your real config), guardrails shipped as
executable negative tests, DoD (tests + size + wiring baseline). The one deferred step is the
**authoritative gate + push**, which only your machine can run — hence the cloud verification
above so it isn't unverified.

## In flight / next
- An **adversarial red-team on this S0 code** (4 parallel agents) is running; any confirmed
  defects will be fixed and re-verified, and this file updated, before you're back.
- **Next phase S1** (loader + OCR-hardened anchoring) builds on this spine.

---

## Update — red-team complete (S0 hardened)

A 4-agent adversarial red-team ran over the S0 code: **16 findings, 14 confirmed** with concrete
failing inputs. **All 14 fixed, each with a regression test.** Suite is now **38/38 green + tsc
strict clean** (was 31). Notable fixes:
- **loadPromoted**: an unknown/undefined policy level fell OPEN past the denial HITL cap → now
  fails closed to most-restrictive; non-string citation returns a structured refusal, not a throw.
- **modelClient**: DLP missed unformatted SSNs / member refs / smuggled structured PHI → broadened
  patterns, DLP now scans the whole serialized input, input is reconstructed to text-only before
  the backend, and a pre-call intent record means no model call without an audit record.
- **ledger**: truncation was undetectable and `undefined` bodies collided → canonical injective
  hashing (rejects non-JSON-safe bodies), defensive deep-copy `entries()`, and a head checkpoint
  that detects truncation/rollback.
- **anchor**: empty (zero-length) spans verified vacuously and duplicate docIds silently shadowed →
  both now fail closed; `offsetToLineCol` rejects out-of-range offsets.

## S1 note (added)
The S1 loader will expose a pluggable **CaptureProvider** seam. The **builtin OCR is mandatory**
(processes Horizon/Elevance/Aetna out of the box, offline — e.g. tesseract.js — no vendor needed);
**ibm-datacap**, **watsonx.ai**, and **generic-http** are optional config-selected adapters. Each
adapter emits our `CanonicalDoc` + byte-anchors so the S0 spine verifies them identically.

---

## Update — S1 core built (dependency-free)

Continued autonomously into S1. Landed and verified (offline cloud project, mirrored config):
- `loader/capture.ts` — the **CaptureProvider** seam: mandatory offline **builtin** (text + HTML →
  `CanonicalDoc`, source-byte hash for OCR-stability) + typed **ibm-datacap / watsonx / generic-http**
  adapter seams (select but stay unwired until configured).
- `provenance/registry.ts` — Guardrail-5 resolver: unregistered ⇒ **blocked**, sample/placeholder
  content downgrades, an "authoritative" registry claim contradicted by sample content is quarantined.
- Tests incl. the **loader ↔ S0 spine round-trip** (an anchor minted from a loaded doc verifies).

**Suite now 50/50 green + tsc strict clean.** Both new runtime modules added to the wiring-baseline.

**S1 remainder (next):** tabular (CSV/XLSX) + scanned-PDF loaders; wire the **mandatory builtin OCR**
(offline engine, e.g. tesseract.js — adds a dependency) and the vendor adapters; offset-preserving
HTML/PDF block maps. These need a dependency addition to package.json, so they wait for your gate.


---

## Update — S1 remainder COMPLETE (PDF, scanned, XLSX) + shared normalizer

Landed and **gate-green in the real repo** (types, E13, E14, unit, provenance all PASS; 141/141 tests).
Built via a parallel design coalition (3 architects + synthesis judge, tree-of-thought) and a
parallel adversarial red-team (3 lenses authoring adversarial tests concurrently).

New / changed under `src/lib/policy/loader/`:
- `normalize.ts` (new) — the single `canonicalizeText` trust boundary (NFC + line/space folding,
  idempotent by construction) every loader ends through; `assertCanonical` / `assertNonEmpty` guards.
- `pdf.ts` (new) — pure-JS `classifyPdf` (offline zlib operator scan; needs no dependency) routes
  text-layer vs scanned; `PdfTextEngine` seam + deterministic geometry reconstruction; junk/empty
  text layer reroutes to the OCR handoff.
- `rasterize.ts` (new) — `RasterizeProvider` seam (native canvas optional) feeding the S1 `OcrEngine`.
- `xlsx.ts` (new) — `WorkbookReader` seam + deterministic sheet->text transform (UTC date-serial
  math, no locale/TZ).
- `capture.ts` (retrofit) — fatal UTF-8 decode, all paths route through the normalizer, `builtin@0.3`
  (offset migration; mixed-version anchors fail closed via `verifyAnchor`).

Tests (new): `normalize.test.ts` (25), `xlsx.test.ts` (29), `pdf.test.ts` (31) — adversarial.
**Gate green WITHOUT optional deps** (fakes + string-cast lazy imports), so `pdfjs-dist` / `xlsx` /
`@napi-rs/canvas` never enter the mandatory install path.

Red-team: normalize + pdf lenses found zero defects; the xlsx lens flagged one **named residual** —
the `' | '` cell delimiter is non-injective (a cell containing `' | '` reads like two cells). Byte-match
integrity is intact (verifyAnchor matches text, not cells; no false verification), documented in-code;
cell-precise provenance is a future per-cell-block enhancement.

Dependency note: the earlier "tesseract.js in dependencies" concern was **verified a non-issue** — none
of tesseract.js / pdfjs-dist / xlsx / @napi-rs/canvas are in `package.json` or the lockfile. Adding them
to `optionalDependencies` is a future feature-enable (to run real engines vs the offline fakes), not a fix.

## Next — S2..S5 (extraction pipeline) building as one block
Gold sets + annotation tooling (S2), segmenter (S3), extractor + schemas (S4), validator + calibration +
SLO gate (S5), against the frozen `pipeline/contracts.ts` shapes. Same discipline: design coalition ->
build -> parallel red-team -> verified bundle for the authoritative gate.
