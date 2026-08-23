# Classification data - provenance

Two **seeded** data files back the classification engine (`hccClassify.ts`). Both
are **synthetic / sample data, NOT the full licensed CMS crosswalk or the complete
risk-model definitions.**

## `data/hcc-crosswalk.json` - diagnosis → HCC group

Maps ICD-10-CM diagnoses to their CMS-HCC group under a **specific, versioned
model** (`model`: `CMS-HCC` / `cms-hcc-v28` / `V28`). A classification carries that
model reference **and** the registry currency verdict of the model version, so a
grouping made against a superseded model version is visible (`binding.current`).

- `E11.9` → `HCC38`, `I50.9` → `HCC226`, `N18.6` → `HCC329` (stub demo mappings).
- An **unmapped** diagnosis returns `group: null` (never a fabricated group).

## `data/risk-families.json` - the risk-family taxonomy

CMS-HCC is **one of several** risk-adjustment families. This file enumerates them
as data so no code hard-codes "HCC = the only model":

| family | program | active asset |
| --- | --- | --- |
| CMS-HCC | Medicare Advantage (Part C) | `cms-hcc-v28` |
| RxHCC | Medicare Part D | `rxhcc-v08` |
| HHS-HCC | Commercial ACA (Marketplace) | `hhs-hcc-2026` |
| CDPS | Medicaid | `cdps-6.5` |

Version + currency metadata for each `activeAssetId` lives in
`registry/data/terminology-assets.json` (the registry is the single source of
truth for versions).

## Invariants (enforced by `tests/terminology/classify.test.ts`)

- **Data-driven + versioned.** Classification reads the crosswalk seed and stamps
  the model asset + version + registry currency (deterministic via injected `asOf`).
- **No fabricated group** for an unmapped diagnosis.
- **HCC is one of several** - the taxonomy enumerates four families.
- **Fail-closed live path.** `selectHccClassifier()` reads the SAME `terminology`
  seam; in `production` the live classifier throws
  `TerminologyServiceNotConfiguredError`.

## Real integration

Replace the crosswalk seed read with a live CMS HCC grouping service / licensed
crosswalk. The risk-family taxonomy stays reference data; only the code→group
content and the production classifier's body change.
