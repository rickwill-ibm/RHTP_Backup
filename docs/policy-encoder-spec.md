# Clinical Policy Encoder — specification (v2, pressure-tested)

**Status.** Finalized after two adversarial rounds (a FHIR/Da Vinci conformance + IR-completeness
lens, and a patient-safety / false-positive red-team), both grounded in the canonical corpus
(Horizon bariatric, Elevance CG-SURG-83, Aetna CPB 0157). Every change below traces to a corpus
line that broke the v1 draft. This is the design authority for the build; the safety invariants in
§1 are binding and gate-tested.

**Problem.** The extractor captures the *text* of medical-necessity criteria but not their *clinical
structure*. The generator then turns every criterion into an identical yes/no checkbox. Quantitative
thresholds (age, BMI, duration, labs), conditional pathways (adult vs adolescent, diabetes), value
sets (comorbidity lists, acceptable Dx), exclusions, time windows, and procedure-specific rules are
all flattened away. This is a systematic gap that affects **every** real policy.

**Fix.** Insert a pure **encoding layer** between extraction and generation. It recognizes clinical
patterns *from the document's own words* (no invented criteria) and emits a typed, gated
**PolicyLogic** IR that drives the DTR Questionnaire (typed items, `enableWhen` /
`enableWhenExpression`, `answerOption`, `answerValueSet`, CQL prepopulation), the CRD coverage rule
(covered / not-covered / conditional, doc-needed), and the PAS QuestionnaireResponse.

---

## 1. Safety invariants (binding — each has a gate test)

These are the spine. They are enforced as invariants, not guidelines; each maps to a fixture in §6.

1. **Fail closed.** The CRD coverage decision defaults to `not-covered` when no pathway is
   satisfied — **independently of whether any "not medically necessary" sentence parsed.** OCR ate
   Horizon's gate (`necessaryfor`, `Ill`); the default must not depend on catching it.
   *Test:* all pathways unsatisfied ⇒ `not-covered`.
2. **No cross-payer contamination.** Every threshold, operator, role, value set, time window, and
   population definition is namespaced to one `guidelineId`. Nothing is canonicalized across
   documents ("morbid obesity = 40", the VBG rule, adolescent definitions, elapsed-time).
   *Test:* CPT 43842 yields covered (Elevance) / not-covered (Horizon) / conditional (Aetna).
3. **Verbatim operators.** `>` ≠ `≥`; `between X and Y` records explicit inclusive/exclusive flags
   for **both** endpoints; any comparator that cannot be recovered with high confidence degrades to
   free-text + human review — never a guessed operator. No cross-occurrence normalization.
   *Test:* boundary fixtures at 39.9 / 40.0 / 40.1 for every threshold.
4. **Polarity inheritance.** Every list item inherits the polarity of its heading. A list under any
   negation / experimental cue can **never** contribute to an inclusion `all-of` / `any` group.
   OCR repair (E0) runs **before** every negation/cue match; negation matching is stem/fuzzy
   (`investigation*`, `experiment*`, concatenations like `necessaryfor`).
   *Test:* Horizon §IV investigational A–F list never becomes a requirement.
5. **Connector integrity.** No mixed `and/or … unless … and …` sentence is coerced to a single
   logic operator. The adolescent under-18 exception ("skeletal growth **and** a life-threatening
   comorbidity") must emit `all-of`; ambiguous compound connectors fail to human review.
   *Test:* skeletally-mature 15-yo with no life-threatening comorbidity ⇒ **not eligible**.
6. **Population-gate integrity.** Lower-threshold / variant pathways (diabetes BMI>30; Asian
   ancestry ±2.5) carry an enforced `PopulationPredicate`. A variant that changes a value modifies
   the threshold; it is never detached or universalized.
   *Test:* non-diabetic BMI 31 ⇒ not eligible; non-Asian BMI 38 ⇒ not eligible under the base rule.
7. **Prose suppressor.** Criteria may originate **only** from the policy's clinical-indications
   section. Numbers in Background / Discussion / Policy-Guidelines / citations (e.g., Elevance's
   narrative Asian-BMI discussion) are non-binding. Every encoded value carries `sourceSection`
   and is rejected if sourced outside indications.
   *Test:* Elevance narrative BMI 27.5 never becomes a criterion.
8. **Manual review is a first-class outcome.** "may request further consideration / contact Medical
   Director / separately reviewed" ⇒ `Pathway.role = 'manual-review'`, never a synthesized
   auto-approval pathway, and never filled by borrowing another payer's criteria.
   *Test:* Elevance under-18 ⇒ manual-review pathway, no criteria tree.
9. **No silent degradation.** Anything the encoder cannot confidently parse stays a byte-anchored
   free-text criterion + review flag. Nothing is dropped or invented. Structural re-labeling and
   cross-ref resolution **fail closed** (see §2, E0/E8).
   *Test (negative fixtures):* unparsed spans present as free-text, never absent.
10. **Round-trip.** Every encoded `measure` re-renders to text and diffs against its source span;
    a mismatch degrades to review. This is a merge gate.

---

## 2. Architecture

```
ingest → extractCriteriaPolicy (text, nested CriterionNode)          [exists]
      → E0a glyph repair (reversible, span-preserving)               [harden existing]
      → E0b structural re-label (recorded as inferred provenance)    [NEW, fail-closed]
      → E8  cross-reference resolver (PREREQUISITE pass)             [NEW, before pathways]
      → ENCODE: CriterionNode → EncodedCriterion (E1..E7, E9)        [NEW]
      → PolicyLogic IR (pathways, procedures, exclusions, valueSets) [NEW]
         ├─► DTR: FHIR Questionnaire (typed items, enableWhen / enableWhenExpression,
         │        answerOption / answerValueSet) + CQL Library (initialExpression, cqf-library)
         ├─► CRD: CoverageRule[] (per-code coverageCode + basis, fail-closed default)
         └─► PAS: QuestionnaireResponse shape
```

**Two ordering corrections from the pressure-test (F12/F4):**
- **E0 is split by trust level.** *E0a glyph repair* (`Ill→III`, `BM/→BMI`, operator glyphs
  `≥ ≤ ²`) is reversible and span-preserving. *E0b structural re-labeling* (assigning B/C/D to four
  positional `A.` siblings) is **inference**, recorded as `labelSource:'inferred-by-position'`,
  never as extracted fact. **Label de-duplication is forbidden** — colliding sibling labels are a
  disambiguation problem that raises a review flag, not a merge.
- **E8 runs as a prerequisite pass** immediately after E0, before any pathway assembly. A cross-ref
  whose target is missing or non-unique after E0 repair **fails closed** to a flagged free-text
  criterion; generation refuses to compile a dangling/empty pathway.

**Framework rule preserved.** Every encoded value is a *parse of text present in the document*.
No criterion, code, threshold, value set, or population definition is invented.

---

## 3. The IR (data model — v2)

The v1 IR was too flat. The corpus needs a real boolean tree, compound measures, multi-axis time
windows, contextual measures, procedure keying by context, value-set polarity, and population
constructs. Shape:

```ts
// ---- Boolean structure (F4/F12): the core rule is AND-over-OR-over-AND ----
type BoolExpr =
  | { op: 'and' | 'or'; nodes: BoolExpr[] }
  | { op: 'not'; node: BoolExpr }
  | { op: 'leaf'; criterionId: string };     // references an EncodedCriterion

// ---- Measures (F2/F8): scalar, compound, contextual, sustained ----
interface Measure {
  kind: 'scalar' | 'compound';
  field?: string;                            // age | bmi | systolicBP | ...
  operator?: '>=' | '<=' | '>' | '<' | 'between' | '=' | '!=';
  value?: number; value2?: number;
  inclusiveLow?: boolean; inclusiveHigh?: boolean;   // explicit endpoint flags (F3/F6)
  unit?: string;
  subMeasures?: Measure[];                    // compound (BP systolic/diastolic)
  logic?: 'any' | 'all';                      // inter-component (F2/F10)
  therapyQualifier?: { drugClassCount: number; distinctClasses: boolean };  // "despite 3 agents"
  context?: { anchor: 'first-surgical-visit' | 'order' | 'any'; encounterType?: string }; // F8
  sustainedOver?: { duration: number; unit: string };  // "BMI>35 for most recent 2 years" (F8)
  thresholdVariant?: ThresholdVariant;        // population-shifted thresholds (F9), applied atomically
}

interface ThresholdVariant {                  // Asian-ancestry ±2.5 (F9) — coordinated, atomic
  population: PopulationPredicate;
  substitutions: { field: string; value: number; value2?: number }[];  // shifts ALL affected thresholds
  derivation: 'asked';                        // NEVER CQL-derived from US Core race; attested only
}

// ---- Time windows (F7/F11): independent co-present axes ----
interface TimeWindow {
  cumulative?: { min: number; unit: string };         // "cumulative total of 6 months"
  longestConsecutive?: { min: number; unit: string }; // "one program ≥3 consecutive months"
  count?: { min: number; unit: 'sessions' };          // "≥12 sessions"
  lookback?: { within: number; unit: string; relativeTo: 'surgery' | 'order' | 'firstVisit';
               inclusive: boolean };
}

interface PopulationPredicate {               // adult | adolescent | asian-ancestry | diabetic ...
  concept: string; sourceText: string; derivation: 'asked' | 'derived';
  definition?: { kind: 'chronological-age' | 'bone-age' | 'skeletal-growth' | 'condition';
                 sourceText: string };        // encode the STATED construct, per payer (F17)
}

interface CodedOption {
  code?: string; system?: string; display: string; sourceText: string;
  followUp?: EncodedCriterion[];              // OSA→"failed 3–6mo CPAP"; compiles to enableWhen-gated items (F3)
}

interface CodedValueSet {
  id: string; concept: string; open: boolean;           // "including but not limited to" ⇒ open
  polarity: 'inclusion' | 'exclusion';                  // F13 — Z68.20–.34 deny vs Z68.35–.45 support
  purpose: 'eligibility' | 'coverage-deny' | 'documentation';
  options: CodedOption[];
  humanReadableBand?: string;                            // "40 or greater" — asserted vs code range (F13)
}

interface EncodedCriterion {
  id: string; label: string; sourceText: string; sourceSpan: [number, number];
  sourceSection: string;                      // F7 — indications | background | discussion | ...
  labelSource: 'extracted' | 'ocr-repaired' | 'inferred-by-position';   // F1
  kind: 'measure' | 'boolean' | 'choice' | 'attestation' | 'exclusion' | 'reference' | 'freetext';
  measure?: Measure;
  choice?: { valueSetId: string; min?: number; max?: number };   // "one or more of" ⇒ min:1
  timeWindow?: TimeWindow;
  population?: PopulationPredicate;
  negate?: boolean;                           // exclusion / "not medically necessary if ..."
  crossRefs?: { rawLabel: string; resolved?: string; status: 'resolved' | 'unresolved-fail-closed' }[];
  reviewFlag?: { reason: string };            // low-confidence ⇒ human review (never dropped)
  children?: EncodedCriterion[];
}

// ---- Procedures (F5/F6/F11/F15) ----
type CoverageCode = 'covered' | 'not-covered' | 'conditional' | 'no-auth-needed' | 'auth-needed';
type CoverageBasis = 'benefit-exclusion' | 'criteria-not-met' | 'experimental-investigational'
                   | 'conditional-on-criteria';

interface ProcedureRule {
  code: string; system: 'CPT' | 'HCPCS' | 'ICD10PCS';
  contextQualifier?: string;                  // "[when specified as Billroth II]" — part of the key (F5)
  coverageCode: CoverageCode;                 // CRD-conformant value set (F6)
  basis?: CoverageBasis;                       // orthogonal reason (experimental ≠ not-covered)
  criteria?: BoolExpr;                         // conditional coverage predicate
  parameterCondition?: Measure;                // intra-procedure split (roux limb ≤150cm) (F15)
  sequencing?: { stage: number; dependsOn?: string; authTiming: 'defer-to-service' | 'concurrent' };  // F11
  globalPeriodDays?: number;                   // "adjustments within 90 days ... global service"
  sourceText: string; sourceSpan: [number, number];
}

interface Pathway {
  id: string; role: 'eligibility' | 'manual-review';   // F10 — escalation-only pathways carry no tree
  population?: PopulationPredicate;
  logic?: BoolExpr;                            // the pathway's eligibility tree (null for manual-review)
  routingInstruction?: string;                 // verbatim, for manual-review (F10/F12)
  valueSets: CodedValueSet[];                  // SCOPED per pathway — no global concept pool (F10)
}

interface PolicyLogic {
  service: string; guidelineId: string; sourceSectionMap: Record<string, string>;
  pathways: Pathway[];
  procedures: ProcedureRule[]; defaultProcedureRole: CoverageCode;  // fail-closed default (F5/§1.1)
  exclusions: EncodedCriterion[];
  documentation: DocRequirement[];
  provenance: FieldProvenance[];
  rolePrecedence: string[];                    // conditional > benefit-exclusion > experimental > not-met (F12)
}
```

**Key IR changes vs v1** (each maps to a finding): `BoolExpr` tree (F4); compound/contextual/
sustained `Measure` + explicit endpoint flags (F2/F3/F6/F8); atomic `ThresholdVariant` (F9);
multi-axis `TimeWindow` (F7/F11); `CodedOption.followUp` (F3); `CodedValueSet.polarity`+`purpose`+
`open` (F13); `ProcedureRule` keyed by `(code, contextQualifier)` with `coverageCode`+`basis`+
`sequencing`+`parameterCondition` and a `defaultProcedureRole` (F5/F6/F11/F15); `Pathway.role`
incl. `manual-review` with per-pathway `valueSets` (F10); `sourceSection` + `labelSource` +
fail-closed `crossRefs` on every criterion (F1/F7/F9); an explicit `rolePrecedence` lattice (F12).

---

## 4. Encoders (the pattern set)

Each encoder recognizes patterns from the document's own words; low-confidence ⇒ review flag, never
a guess. Cross-payer cues are grounded in the corpus; **no cue result crosses `guidelineId`**.

**E0a — glyph repair (reversible).** `Ill→III`, `I1.D→II.D`, `BM/→BMI`, `kglrn2→kg/m²`,
`{BMI→(BMI`, operator glyphs `≥ ≤ ² kg·m⁻²`, concatenations `necessaryfor→necessary for`. A
whitelisted glyph/operator class distinct from digits; **never** alters a clinical number. Raw span
preserved. Runs before every downstream cue/negation match (§1.4).

**E0b — structural re-label (inference, fail-closed).** Assigns positional labels to colliding
siblings (four `A.` → A/B/C/D) recorded as `labelSource:'inferred-by-position'`. De-duplication
forbidden. Colliding labels + an unresolved sub-selector (Horizon's two `i.` blocks, no `ii`) raise
a review flag rather than a guess. Assert: distinct top-level sections detected == enumerator resets.

**E8 — cross-reference resolver (prerequisite pass).** Resolves internal label paths ("II.D.2 either
i or ii") against E0's canonical paths and **inlines** the referenced criteria into the pathway,
**preserving** (a) the parent population gate, (b) sub-selector semantics ("either i or ii" ⇒
`choice{min:1}`), (c) provenance of the source node. Unresolved/ambiguous ⇒ fail-closed free-text +
review (F4/F5). External guideline ids recorded, not fetched.

**E1 — measure / threshold** *(highest leverage)*. Cues: `at least|≥|no less than|minimum` /
`greater than|>|exceeding` / `less than|below|<` / `between X and Y` / `X to <Y`, + a unit. Emits
`Measure` with **verbatim** operator and explicit `inclusiveLow/High` (unknown ⇒ review, §1.3).
Compound clinical measures (BP `>140 systolic and/or 90 diastolic despite 3 agents`) ⇒
`kind:'compound'` with `subMeasures` (`logic:'any'`) + `therapyQualifier` (F2/F10). Encounter-anchored
("at first surgeon visit") ⇒ `context.anchor`; sustained ("for most recent 2 years") ⇒
`sustainedOver` (F8). Prose/discussion numbers suppressed (§1.7). Age is always a `measure` (CQL
prepopulated), never a boolean (F7). FHIR: `integer`/`decimal` item + `initialExpression` prepop +
comparison in CQL.

**E2 — age gate + adolescent pathway.** Adult pathway (`age≥18` measure) + a **separate** adolescent
handling. The adolescent branch is **not** a threshold modifier — it is its own `Pathway` (Aetna:
BMI>40 only, no 35+comorbidity option) with the payer's **stated** maturity construct
(chronological / bone-age 13♀/15♂ / skeletal-growth radiograph), sex-bound where stated (F9/F17).
Where the document handles under-18 only by escalation (Elevance "contact a Medical Director"),
emit `Pathway.role='manual-review'` with the routing text — no synthesized criteria (§1.8). The
Horizon under-18 exception ("skeletal growth **and** a life-threatening comorbidity") is `all-of`
with its own (open) comorbidity list, scoped to that pathway (§1.5, F10).

**E3 — conditional / branch (`enableWhen` / `BoolExpr`).** Distinguishes an *alternative* (OR) from a
*gate* (if-then). Diabetes pathway (Horizon III, "BMI>30") carries an enforced `PopulationPredicate`
(diabetic) — never universalized (§1.6, F4). Compound eligibility becomes a `BoolExpr` tree, not a
flat logic flag.

**E4 — value-set / one-of-N.** "one or more of / at least one of" ⇒ `choice{min:1}` **gated under its
parent branch** (never detached). "including but not limited to" ⇒ `open` (UI offers Other+specify).
Never `logic:'all'` for a comorbidity set (§1). Options with embedded gates (OSA→CPAP duration;
HTN→BP measure; depression→pre-op clearance) keep the nested E1 criterion as `CodedOption.followUp`
(F3/F9). Value sets are scoped per pathway; Z68 code ranges asserted against the human-readable BMI
band on the same line, `polarity` set from the heading (F13).

**E5 — time-window / duration.** Emits the multi-axis `TimeWindow`: `cumulative` AND
`longestConsecutive` when both appear (Horizon "6 months cumulative … one program ≥3 consecutive"),
`count{sessions}` independent of calendar duration (Aetna "≥12 sessions"), explicit `lookback` with
`relativeTo` + endpoint inclusivity (F7/F11). Dropping either the cumulative or the consecutive axis
is a defect.

**E6 — exclusion / not-medically-necessary.** Fires on stem/fuzzy negation **after** E0 repair
(`investigation*`, `experiment*`, `not…medically necessary`, concatenations). Any list under a
negation/experimental heading is forced to `coverageCode∈{not-covered}` with the right `basis`, and
**can never** contribute to an inclusion group (§1.4, F2). Cross-criteria exclusion ("not MN unless
II or III met") becomes the **fail-closed default** (§1.1), not dependent on catching the sentence
(F14). VBG is per-payer: not-covered (Horizon) vs `conditional` with its own risk-comorbidity list
(Aetna) — kept separate from the obesity-comorbidity set (F3).

**E7 — special-population modifier.** Asian-ancestry ±2.5 ⇒ `ThresholdVariant` shifting **all**
affected thresholds atomically (40→37.5 **and** 35→32.5), gated by an **asked** population item —
never CQL-derived from the US Core race extension (fairness-sensitive invented inference, §1.6/F9).
Base + variant both retained.

**E8** — see prerequisite pass above.

**E9 — procedure-applicability.** `ProcedureRule[]` keyed by `(code, contextQualifier)`; a
`defaultProcedureRole = not-covered` when the policy states an open "all other … not medically
necessary" clause (F5). `coverageCode` + `basis` (experimental preserved, F6). Staged procedures ⇒
two rules with `sequencing` (stage-2 `defer-to-service`), not a single approval (F11). Intra-procedure
splits (roux limb ≤150cm covered / >150cm investigational) ⇒ `parameterCondition` (F15). Role writes
obey the `rolePrecedence` lattice so E6/E9 order cannot change output (`conditional` >
`benefit-exclusion` > `experimental` > `criteria-not-met`) (F12).

---

## 5. FHIR / Da Vinci mapping (corrected)

| IR element | DTR Questionnaire | CRD | CQL / SDC |
|---|---|---|---|
| scalar measure (age/BMI) | integer/decimal item | — | `initialExpression` prepop + compare |
| compound measure (BP+agents) | US Core BP **component** Observation + count item | — | CQL over Observation/MedicationRequest |
| `BoolExpr` pathway root | item group + `enableWhenExpression` (CQL) | — | AND/OR/NOT tree |
| single-antecedent gate | literal `enableWhen` | — | — |
| choice / one-of-N (leaf) | `choice` + `answerValueSet` | — | any-of |
| choice with follow-ups | `answerOption` codings + sibling items `enableWhen(answerCoding)` | — | — |
| time window | date/quantity items (one per axis) | doc-needed timing | date math vs anchor |
| exclusion / procedure | hard-stop / not-shown | `coverageCode` + `basis` in coverage-information | — |
| threshold variant | asked population item | — | threshold parameter (asked, not race-derived) |
| documentation | attachment item | `doc-needed` / `doc-purpose` | — |

**Conformance corrections (F3/F4/F14):** compound eligibility maps to
`sdc-questionnaire-enableWhenExpression` (CQL), **not** flat `enableWhen`; prepopulation uses
`sdc-questionnaire-initialExpression` (not `cqf-expression`); the Questionnaire links its CQL via
`cqf-library` and `questionnairePackage` ships the named `Library` resources. `answerValueSet` is
permitted **only** for leaf option sets with no follow-ups; options carrying nested criteria compile
to enumerated `answerOption` + `enableWhen`-gated siblings. CQL emission is **mandatory** (resolves
§8-Q1). The blanket "SDC-conformant" claim is replaced by a per-row checklist tied to specific IG
StructureDefinitions, verified in the target-contract gate.

---

## 6. Test strategy (the corpus is the gate)

Canonical fixtures: **Horizon** (RTF), **Elevance CG-SURG-83** (PDF), **Aetna CPB 0157** (text),
now promoted to repo test fixtures. Golden assertions include every §1 invariant plus:

- **Age/adolescent:** adult `age≥18` measure per policy; adolescent path per payer's stated construct;
  Elevance under-18 ⇒ `manual-review` (no tree); skeletally-mature 15-yo, no life-threatening
  comorbidity ⇒ **not eligible** (§1.5).
- **BMI:** `≥40 OR (35–40 with ≥1 comorbidity)` as `BoolExpr` over measures; boundary fixtures
  39.9 / 40.0 / 40.1; `>` vs `≥` preserved per occurrence; Aetna Asian variant shifts both thresholds
  atomically and only under the asked population.
- **Compound:** refractory-HTN encodes systolic-OR-diastolic **AND** `agents≥3`; dropping the
  therapy qualifier is a fail.
- **Comorbidity VS:** 15 Horizon options as an open, `min:1`, per-pathway value set; OSA/HTN/depression
  carry nested follow-ups; never `all-of`.
- **Time windows:** Horizon cumulative-6mo **and** longest-consecutive-3mo **and** 1yr lookback all
  present; Aetna 12-sessions-within-2yr as `count` + `lookback` (12 sessions / 3 months ⇒ pass;
  5 non-consecutive months ⇒ fail).
- **Exclusions / procedures:** VBG covered/not-covered/conditional per payer (§1.2); Horizon §IV
  investigational A–F never a requirement (§1.4); Elevance "all other … not-MN" ⇒ `defaultProcedureRole
  = not-covered`; roux >150cm ⇒ `conditional` via `parameterCondition`; two-stage ⇒ stage-2 deferred.
- **Coverage default:** all pathways unsatisfied ⇒ `not-covered` (§1.1), even with the NMN sentence
  removed from the fixture.
- **Cross-ref:** Horizon diabetes pathway resolves II.D.* into an inline gated pathway preserving the
  diabetic gate and "either i or ii" as `choice{min:1}`; a corrupted label ⇒ fail-closed review.
- **Prose suppressor:** Elevance narrative Asian-BMI 27.5 never becomes a criterion (§1.7).
- **Round-trip / degradation:** each measure re-renders and diffs its span; unparsed spans present as
  free-text + review, never dropped or invented.

Plus the adversarial lens kit (precision-not-recall, guards-fail-closed, order-independence,
target-contract/FHIR conformance, round-trip, no-silent-degradation, degenerate inputs).

---

## 7. Build sequence (phased, dependency-corrected)

1. **E0a + E0b + E8** — glyph repair, fail-closed structural re-label, cross-ref resolver as a
   prerequisite pass. (Corrects F1/F4/F12: cross-refs and labels must be sound before pathways.)
2. **E1** — measure encoder (verbatim operators, compound, context, sustained). Foundational.
3. **E2 + E3** — age/adolescent pathways (incl. manual-review role) + conditional `BoolExpr` branch
   (diabetes population gate).
4. **E4** — value-set / one-of-N (per-pathway, polarity, open sets, nested follow-ups).
5. **E6 + E9** — exclusions + procedure applicability → CRD coverage roles, with the fail-closed
   default and the `rolePrecedence` lattice.
6. **E5** — time windows (multi-axis) / staging.
7. **E7** — population variants (atomic threshold table, asked derivation).
8. **Generator / mapper rework** — emit typed/gated FHIR Questionnaire + CQL from the IR; carry
   `enableWhen` / `enableWhenExpression` / `answerOption` / `answerValueSet` / `format` through
   `questionnairePackage` (fixes today's lossy mapper); CRD rules from `ProcedureRule[]` with the
   fail-closed default.

Each phase is pure, mirror-gated in `/root/xbuild` (tsc + vitest + prettier + eslint), and asserted
against all three fixtures before it lands.

---

## 8. Resolved open questions

- **CQL: emit it.** Prepopulation and compound gating are non-conformant without CQL
  (`initialExpression` / `enableWhenExpression` + `cqf-library` + `Library` resources). Mandatory
  (F4/F14). Literal `enableWhen` remains for single-antecedent gates only.
- **Measure-detection aggressiveness:** bounded by the prose suppressor (§1.7, indications-only) and
  round-trip gate (§1.10); low confidence degrades to review, never a guess.
- **Value-set identity:** generate local `ValueSet`s, and **bind** to standard code systems where the
  document names them (Z68 BMI, ICD-10) — always carrying `polarity`/`purpose` so deny families are
  never confused with eligibility families (F13).
- **Adolescent definitions:** encoded **verbatim** per payer (chronological / bone-age / skeletal
  growth); never normalized to a single number (F17).
- **Human-review boundary:** any ambiguous compound connector, unrecoverable operator/unit, colliding
  label, unresolved cross-ref, or out-of-indications source ⇒ human review. Review is a first-class
  output, not a failure.
