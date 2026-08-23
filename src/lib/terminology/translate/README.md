# $translate crosswalk data - provenance

`data/crosswalks.json` is the **seeded** cross-map the `$translate` engine
(`crosswalkTranslate.ts`) reads. It is **synthetic / sample data, NOT the full
licensed crosswalk.**

## What the seed represents

Each entry is one ConceptMap-style crosswalk between two governed code systems:

| crosswalk | source → target | asset / version | represents |
| --- | --- | --- | --- |
| `icd10cm-to-cms-hcc-v28` | ICD-10-CM → HCC | `cms-hcc-v28` / `V28` | diagnosis → CMS-HCC risk group |
| `cms-hcc-v28-to-icd10cm` | HCC → ICD-10-CM | `cms-hcc-v28` / `V28` | exemplar diagnoses in a group |
| `snomedct-to-icd10cm-us20260301` | SNOMED-CT → ICD-10-CM | `snomed-ct-us-20260301` / `US20260301` | NLM US-Edition SNOMED→ICD map |
| `icd10cm-to-snomedct-fy2026` | ICD-10-CM → SNOMED-CT | `icd-10-cm-fy2026` / `FY2026` | reverse NLM map |

Each crosswalk declares its own `assetId` + `version`, so a translated target is
auditable back to the versioned map that produced it. The versions are
**illustrative stubs** (`stub: true`) pending the real terminology server.

## Invariants (enforced by `tests/terminology/translate.test.ts`)

- **No fabricated maps.** A source code with no seeded entry returns **NO-MAP**
  (empty `targets`), never a guessed target. A system pair with no seeded
  crosswalk returns `crosswalk: null`.
- **Provenance.** A matched translation carries the crosswalk asset id + version.
- **Fail-closed live path.** `selectCrosswalkTranslator()` reads the SAME
  `terminology` dataMode seam; in `production` it returns the live translator,
  which throws `TerminologyServiceNotConfiguredError` (never the seed as live).

## Real integration

Replace the seed read with a FHIR ConceptMap `$translate` call against the
configured terminology server / VSAC / CMS HCC crosswalk. The seam id does not
change; only the production translator's body does.
