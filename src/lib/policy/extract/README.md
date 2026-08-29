# Policy Document Extractor (`lib/policy/extract`)

Turns a policy **document** into adapter-ready `RawPolicyRecord`s with byte/char-anchored
provenance. This is the runtime fill for the "future importer" slot the ingestion layer
(`lib/policy/ingest`) documents — the offline `tools/seed/parse_policies.py` does the same job at
build time to produce the seed.

## Where it sits

```
document text ──[extract/]──▶ RawPolicyRecord ──[ingest/ adapters]──▶ NormalizedPolicy ──[policyLibrary]──▶ evaluate()
```

The extractor **never** builds a `NormalizedPolicy`. It stops at the adapter front door, so the
three adapters (`aetnaCpb`, `uhcPaList`, `genericPaList`) remain the single source of truth for
normalization. A document-sourced policy therefore evaluates identically to a seed-sourced one.

## Modules

- `types.ts` — `TextSource` (the canonical text a document reduces to; every provenance span
  indexes into it) and result types.
- `readers.ts` — the bytes→text seam. One **real** reader ships: plain / pre-extracted text
  (`plainTextReader`). PDF, XLSX, and OCR are **seams**: a real wrapper or a test fake is injected
  via `makeReader`; an unwired format raises `ReaderNotWiredError` rather than silently returning
  nothing. Real format readers (each needs a parser dependency) are the next unit.
- `codes.ts` — CPT / HCPCS Level II / ICD-10-CM recognition with noise guards. A bare five-digit
  CPT is shape-identical to a ZIP, so it is accepted **only** inside a code region; `isCodeOnlyLine`
  gates that — a code line must be codes plus separators and nothing else, so prose that merely
  mentions a number can never read as a code table.
- `segment.ts` — deterministic structural segmentation: CPB number/title/indications/code buckets,
  and PA-list categories, each tied to a source offset.
- `fields.ts` — assembles the two `RawPolicyRecord` shapes and attaches provenance per code and
  indication; emits warnings (never silent drops) for empty/ambiguous regions.
- `provenance.ts` — `makeSpan`/`makeProvenance`/`verifyAnchor`. The falsifiable check: the source
  sliced at a span must equal the recorded value. A wrong span fails — that is what makes it
  evidence, not decoration.
- `index.ts` — `detectDocKind`, `extractDocument`, and `extractAndIngest` (runs records through the
  real adapters). Wired into `policyLibrary.ingestDocuments`.

## Guarantees (enforced by `tests/policy/extract.*.test.ts`)

- Never hallucinates a code (adversarial corpus: ZIPs, form numbers, phone/table/page numbers,
  line-broken codes, unicode traps → nothing extracted).
- Gold fixtures are authored by hand, independent of the extractor's own output (anti-tautology).
- Every emitted provenance span verifies against the source.
- Extracted records round-trip through the real adapters **and** `policyEngine.evaluate`.

## Scope boundary

Deterministic parsing only — no model/LLM calls (which is why there is no PHI surface here). Real
PDF/XLSX/OCR readers and a human-review-of-extraction UI are the next units; both build on these
seams and this provenance without reworking them.
