# DTR Logic Tree — Requirement vs. Patient Evidence

**Plan for redesigning the DTR Match screen to show the policy's logic tree (same format as the clinical reviewer's Review Policy Logic screen) side by side with the matching evidence pulled from the patient's record — Date of Service and performing provider included — to reduce manual review burden for the ordering provider.**

Prepared for: PA-Standalone-SmartApp / CMS-0057-F Prior Authorization demo
Status: **Plan — not yet implemented**

---

## 1. The Gap This Closes

Today's DTR screen (`DtrTreeView.tsx`, nav step 3) shows one card per criteria group with a met/gap badge and, when met, a `leaf`: a code, a label, and a single opaque evidence string like `"Documented 2026-07-28"` or `"37.1 kg/m2 (2026-07-28)"`. That's it. There is no visible statement of *what the policy actually requires* on that screen — no rule text, no source excerpt from the payer's policy document — even though that information now exists (built for the Review Policy Logic screen in the last round of work) and would let the ordering provider verify a match at a glance instead of trusting an opaque badge.

Three concrete gaps, all traced to specific code:

1. **The policy requirement never reaches this screen.** `fhir-evaluator.mjs`'s `evaluateCriterion()` destructures `description` and the plain-language rule off the `criterion` object but never includes them in what it returns — only `id, title, required, status, leaf/candidateCodes`. Even if it did, `dtrService.ts`'s "Normalise" step (lines 90–102) explicitly strips the response down to `{id, title, status, leaf, candidateCodes, uploadedEvidence}` before it reaches the UI. Two places would need to stop discarding this data.
2. **Evidence is a flattened string, not structured data.** `DtrLeaf` (`pa-types.ts`) is `{code, label, evidence: string, source}`. The `evidence` string is built once, server-side, by `extractEvidence()` and can never be redisplayed as separate "Date of Service" / "Performing Provider" fields — that information, when available, is baked into one sentence instead of being carried as its own fields.
3. **A real, silent bug**: `fhir-evaluator.mjs` line 119 sets `source: resources === resources ? "emr" : "pa"` — comparing a variable to itself, which is *always* `true`. Every matched criterion is labeled `"emr"` even when the actual match came from the payer Patient Access fallback query a few lines above. This directly undermines the "pull relevant information from the patient's record accurately" goal — the source badge shown today cannot be trusted. This should be fixed as part of this work regardless of anything else, since it's actively wrong today.

---

## 2. What the Screen Should Look Like

Two columns per criteria group — **Policy Requirement** on the left (the same rule-in-plain-terms + source-excerpt format built for `PolicyReviewView.tsx`), **Patient Record Match** on the right (structured evidence, not a single sentence):

```
Group 2 · Body Mass Index (BMI) ≥ 35                                          [MET]
┌─────────────────────────────────────┬──────────────────────────────────────┐
│ POLICY REQUIREMENT                   │ PATIENT RECORD MATCH                  │
│                                       │                                       │
│ Rule: Observation.code = 39156-5     │ ● Body mass index (BMI) [Ratio]        │
│ (LOINC), value >= 35                 │   37.1 kg/m2                          │
│                                       │                                       │
│ Source: "...documented BMI of 35     │   Date of Service:  Jul 28, 2026      │
│ kg/m2 or greater within the past     │   Performing Provider: Dr. Jacob P.   │
│ 12 months..."                        │   Aagaard, MD                         │
│                                       │   Encounter: Consultation (ambulatory)│
│                                       │   [EMR]                                │
└─────────────────────────────────────┴──────────────────────────────────────┘
```

For a **gap** group, the right column shows what it shows today (candidate codes, upload button) — the left column still shows the requirement, which is new and useful even for gaps: the provider can read the actual rule instead of just a code list, before deciding whether to fetch documentation or challenge the gap.

---

## 3. Data That Already Exists vs. Data That Needs New Plumbing

Grounded in the actual Rachel Green seed bundle (`infra/seed/rachel-green-emr.bundle.json`), not assumptions:

| Resource | Has `recorder`/`performer`? | Has `.encounter` link? | What that means |
|---|---|---|---|
| `condition-rachel-obesity` (E66.01) | Yes — `recorder: {reference: "Practitioner/practitioner-aagaard"}` | No | Provider resolvable; DOS falls back to `recordedDate` |
| `condition-rachel-bmi-qualifier` | No | No | Neither enrichment available — this is a **real, honest gap**, not every resource in this system carries provenance |
| `obs-rachel-bmi` | No | Yes — `encounter: {reference: "Encounter/encounter-rachel-current"}` | Encounter resolves to a real `Practitioner/practitioner-aagaard` **with an inline `display: "Dr. Jacob P. Aagaard MD"`** on the participant, and a `period.start: "2026-07-30"` usable as DOS |
| `obs-rachel-weight`, `obs-rachel-height` | No | No | Same gap as bmi-qualifier |

So enrichment will be **available where the underlying resource supports it, and honestly absent where it doesn't** — this plan does not propose fabricating a provider or date when the resource has none. The Encounter resource conveniently already includes an inline `display` string on its `participant.individual` reference, so for encounter-linked observations, showing the provider name costs a lookup on an already-fetched resource, not a second network round-trip. For `recorder`-only resources (like the obesity Condition), resolving the name requires one additional `fhirRead(Practitioner, id)` call — the helper already exists in `fhir-client.mjs`, just isn't called anywhere for this today.

---

## 4. Automating to Reduce Administrative Burden

Concrete, code-grounded opportunities — not aspirational:

- **Pick the clinically relevant match, not just the first one returned.** `evaluateCriterion()` takes `resources[0]` from whatever order the FHIR server happens to return. `fhir-client.mjs` already exports `mostRecentFirst(resources)` — sorts by effective/recorded/onset date descending — but it is **never called anywhere in the codebase**. Wiring it in means the evaluator surfaces the *most recent* qualifying evidence automatically, which is usually what a reviewer actually wants (e.g., the latest BMI reading, not an old one), without them having to go check.
- **Fix the source-labeling bug (§1.3).** A trustworthy EMR-vs-Patient-Access badge is itself a burden-reducer — right now a provider can't tell from the badge alone whether evidence came from the EMR or from payer data without digging in themselves.
- **Surface every qualifying resource for multi-match groups, not just one.** "Qualifying Comorbidity" accepts any one of several codes — if a patient has two documented comorbidities that both qualify, today's UI only ever shows the first. Showing all of them (still counts as one met group) means the reviewer sees the full picture without having to cross-reference the chart themselves.
- **Resolve and cache provider names once per encounter/practitioner per request**, not once per group — several groups may reference the same encounter or provider; a simple in-request cache avoids redundant `fhirRead` calls.
- **Distinguish "Date of Service" from "date recorded."** `extractEvidence()` today just grabs whichever date field exists first (`effectiveDateTime ?? recordedDate ?? onsetDateTime ?? authoredOn`) and calls it "Documented." A DOS pulled from a linked Encounter's `period.start` is a materially different (and often more clinically correct) piece of information than "date this was entered in the chart" — worth labeling distinctly rather than conflating them.

What this does **not** attempt: matching against resource types the evaluator doesn't query today (`Procedure`, `MedicationRequest` — supported by the extraction schema but not exercised by any seed data yet), or auto-resolving a provider when the underlying FHIR resource genuinely has no provenance data. Those are real gaps in the underlying data model, not something a smarter UI can paper over.

---

## 5. Data Model Changes

### 5.1 `DtrLeaf` (`pa-types.ts`) — extend, don't replace

```ts
export interface DtrLeaf {
  code: string;
  label: string;
  evidence: string;               // kept for backward compatibility / fallback display
  source: "emr" | "pa" | "upload" | null;
  resourceType?: string;          // "Condition" | "Observation" | ...
  dateOfService?: string;         // from linked Encounter.period.start, when available
  recordedDate?: string;          // the resource's own date field, when DOS isn't available
  performerName?: string;         // resolved from participant.individual.display or a Practitioner fhirRead
  performerReference?: string;    // e.g. "Practitioner/practitioner-aagaard" — for a future "view provider" link
  encounterReference?: string;
}
```

### 5.2 `DtrGroup` — carry the requirement alongside the match

```ts
export interface DtrGroup {
  // ...existing fields unchanged...
  required?: boolean;             // already computed server-side, just not sent today
  description?: string;           // plain-English requirement text from the PolicyDefinition
  sourceExcerpt?: string;         // the same verbatim policy quote shown on the review screen
  fhirRuleSummary?: string;       // e.g. "Observation.code = 39156-5 (LOINC), value >= 35" — same plain-terms translation used in PolicyReviewView's ReviewGroupCard
  additionalMatches?: DtrLeaf[];  // other qualifying resources beyond the primary leaf, for multi-match groups (§4)
}
```

### 5.3 Backend (`fhir-evaluator.mjs`)

- `evaluateCriterion()` return values gain `required`, `description`, `sourceExcerpt`, and a `fhirRuleSummary` string built the same way the frontend review screen already renders one (`resourceType.searchParam IN {codes} (system)`), so both screens read identically without duplicating formatting logic in two places — likely worth extracting into a small shared helper (`formatFhirRule(fhirQuery)`) usable from both the review UI and here.
- Replace `resources[0]` with `mostRecentFirst(resources)[0]`, and pass the rest through as `additionalMatches` when there's more than one.
- Fix `source: resources === resources ? "emr" : "pa"` → track which base (EMR vs. payer) actually produced the result and use that.
- Add a small enrichment step after a match is found: resolve `dateOfService` (from `.encounter` if the matched resource has one, via a lookup on the already-available Encounter — or a `fhirRead` if it wasn't already fetched) and `performerName` (from the Encounter's `participant.individual.display` if present, else a `fhirRead` on `recorder`/`performer`/`asserter`, whichever the resource type carries).

### 5.4 Frontend (`dtrService.ts`)

- Stop stripping fields in the "Normalise" step — pass through everything §5.1/§5.2 add, with the same graceful-degradation the type changes already allow (all new fields optional, so a policy ingested before this feature, or a resource with no provenance, just omits them and the UI shows what it has).

---

## 6. Frontend Changes (`DtrTreeView.tsx`)

`GroupCard` is restructured into the two-column layout in §2:

- **Left column** (new): reuses the exact rendering approach already built for `ReviewGroupCard` in `PolicyReviewView.tsx` — rule in plain terms, quoted source excerpt (or the same "no source excerpt extracted" amber note when absent, for policies ingested before that field existed). Genuinely the same component logic, just without the review-specific flag/approve controls — worth factoring the rule-and-excerpt block out into a small shared `PolicyRuleSummary` component both screens import, rather than copy-pasting the JSX.
- **Right column** (evidence, restructured): code + label stay as today; the evidence string is replaced by a small structured list — Date of Service, Performing Provider (when resolved), Encounter type (when available), and the existing EMR/Patient Access/Uploaded source badge (now trustworthy per §5.3). Falls back to today's single evidence sentence when the structured fields aren't available (e.g., resources with no encounter/recorder), so nothing regresses for data that doesn't support the richer display.
- **Multi-match groups**: when `additionalMatches` is present, a small "+2 more matching records" disclosure under the primary leaf, expandable to show the rest in the same structured format.
- Gap groups keep today's candidate-code list and upload button on the right, and now additionally show the left-column requirement — a real improvement for gaps specifically, since today a gap only shows codes with zero explanation of the underlying rule.

---

## 7. Phasing

**Phase 1 (closes the core gap — left/right layout with real data):**
- Fix the source-labeling bug (§1.3) — small, correctness-only, do regardless of the rest
- Wire in `mostRecentFirst` for match selection (already exists, just unused)
- Pipe `description`/`sourceExcerpt`/`fhirRuleSummary` through `/evaluate` → `dtrService.ts` → left column
- DOS/performer enrichment for resources that already carry `.encounter` or `recorder` (both real seed resources today)
- Two-column `GroupCard` redesign, shared `PolicyRuleSummary` component

**Phase 2 (once Phase 1 is in use):**
- Multi-match display (`additionalMatches`)
- Broader resource-type support (`Procedure`, `MedicationRequest`) if/when a policy or seed patient actually needs one
- Provider qualification/NPI display (already present on the seeded `Practitioner` resource, just unused) if a "who is this provider" tooltip turns out to matter
- Near-miss surfacing — e.g. a comorbidity code close to (but not on) the candidate list, flagged for a human to judge rather than silently treated as a gap

---

## 8. Verification Plan

1. Confirm the source-labeling fix: force a match to come from the payer-fallback path only (patient data present in payer FHIR but not EMR) and confirm the badge reads "Patient Access," not "EMR."
2. Confirm `mostRecentFirst` ordering: seed two qualifying Observations with different dates for the same criterion, confirm the more recent one is chosen as the primary leaf.
3. Confirm DOS/performer enrichment renders correctly for `obs-rachel-bmi` (encounter-linked — expect DOS from `Encounter.period.start`, provider from the participant's inline `display`) and for `condition-rachel-obesity` (recorder-only — expect DOS to fall back to `recordedDate`, provider resolved via a `Practitioner` lookup).
4. Confirm graceful degradation for `condition-rachel-bmi-qualifier` / the weight/height Observations (no recorder, no encounter) — right column should show today's plain evidence string, no broken UI, no fabricated fields.
5. Confirm the left column matches the review screen's rendering for the same policy — same rule text, same source excerpt — for an approved policy that has `sourceExcerpt` populated, and shows the same "not extracted" fallback for the pre-existing bariatric policy that predates that field.
6. Scoped `tsc --noEmit` (or full-project, as done for the last two rounds) + `node --check` on all changed backend files.

---

## 9. Open Questions

1. **How far does "automate the administrative burden" go?** This plan focuses on *showing* richer, auto-pulled evidence so a reviewer doesn't have to dig for it themselves. Does "automate" also mean: auto-attaching the resolved evidence to the PA submission packet without a manual confirmation step, or should a human still explicitly confirm each match before submission (current flow: DTR just needs `allMet` to unlock "Continue to Submit")?
2. **Multi-match groups** — when a patient has several qualifying resources for one criterion, should DTR pick one automatically (as proposed, via most-recent) and merely disclose the rest, or should the provider be asked to pick which one supports the request?
3. **Near-miss handling** — is surfacing "close but not matching" codes (Phase 2) actually wanted, or would that add noise? Worth deciding once Phase 1 is in use and it's clearer how often gaps are "no evidence at all" vs. "evidence exists but doesn't quite qualify."

---

*This is a plan only — nothing described above has been implemented. Let me know which parts to build, and whether the open questions above have answers or should default as suggested.*
