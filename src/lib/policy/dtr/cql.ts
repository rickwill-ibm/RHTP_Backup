/**
 * Deterministic CQL generation for the CODED criteria — the computable-evaluation layer.
 *
 * Given the coverage value sets + numeric thresholds a reviewer has curated (procedure ∈ set,
 * diagnosis ∈ set, BMI > threshold, age ≥ min), emit a CQL library that a DTR/CRD engine evaluates
 * against the patient's FHIR record. This handles the code/threshold logic deterministically; the
 * AI coding-map produces the value sets + thresholds it consumes (and any prose criteria that are
 * not reducible to codes remain documentation-gated). Pure string generation; no dependency.
 */
export interface CqlBmiRule {
  /** Qualifies alone at or above this BMI (e.g. 40). */
  threshold: number;
  /** Optional band that qualifies only WITH a comorbidity (e.g. { lower: 35, upper: 40 }). */
  bandWithComorbidity?: { lower: number; upper: number };
}

export interface CqlCriteriaInput {
  libraryName: string;
  version?: string;
  /** ValueSet canonical of qualifying comorbidity diagnoses (for the BMI band rule). */
  comorbidityValueSetUrl?: string;
  bmi?: CqlBmiRule;
  /** Minimum age in years (e.g. 18). */
  minAge?: number;
}

const LOINC_BMI = '39156-5';

function sanitizeIdentifier(name: string): string {
  const camel = name
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
  return /^[A-Za-z]/.test(camel) ? camel : `Lib${camel}`;
}

/**
 * Generate a CQL library string. Emits a `MeetsCodedCriteria` roll-up over exactly the rules given
 * — nothing is invented. When no BMI/age rules are supplied it still produces a valid library whose
 * roll-up is documentation-gated (returns null), so the caller/UI states the criteria aren't fully
 * computable rather than silently passing.
 */
export function buildCql(input: CqlCriteriaInput): string {
  const name = sanitizeIdentifier(input.libraryName);
  const version = input.version ?? '0.1.0';
  const lines: string[] = [
    `library ${name} version '${version}'`,
    `using FHIR version '4.0.1'`,
    `include FHIRHelpers version '4.0.1'`,
    ``,
    `// Deterministically generated from the curated coded criteria. Draft — reviewer signs off.`,
    `codesystem "LOINC": 'http://loinc.org'`,
  ];

  const band = input.bmi?.bandWithComorbidity;
  const bandUsable = !!band && !!input.comorbidityValueSetUrl && band.lower < band.upper;
  if (bandUsable) {
    lines.push(`valueset "Qualifying Comorbidities": '${input.comorbidityValueSetUrl}'`);
  }
  lines.push(``, `context Patient`, ``);

  const rollup: string[] = [];

  if (input.minAge !== undefined) {
    lines.push(`define "Age": AgeInYears()`);
    lines.push(`define "MeetsAge": "Age" >= ${input.minAge}`, ``);
    rollup.push(`"MeetsAge"`);
  }

  if (input.bmi) {
    lines.push(
      `define "MostRecentBMI":`,
      `  Last([Observation: Code '${LOINC_BMI}' from "LOINC"] O`,
      `       where O.status in { 'final', 'amended' } sort by effective)`,
      `define "BMIValue": ("MostRecentBMI".value as FHIR.Quantity).value`
    );
    const parts: string[] = [`"BMIValue" >= ${input.bmi.threshold}`];
    if (band && bandUsable) {
      lines.push(
        `define "HasQualifyingComorbidity":`,
        `  exists ([Condition] C where C.code in "Qualifying Comorbidities"`,
        `          and C.clinicalStatus ~ 'active')`
      );
      parts.push(
        `(("BMIValue" >= ${band.lower} and "BMIValue" < ${band.upper}) and "HasQualifyingComorbidity")`
      );
    } else if (band && !input.comorbidityValueSetUrl) {
      // Visible, not silent: the narrower band is dropped because no comorbidity value set was given.
      lines.push(
        `// BMI ${band.lower}-${band.upper} + comorbidity band NOT computable: comorbidity value set missing (documentation-gated)`
      );
    } else if (band) {
      lines.push(
        `// BMI ${band.lower}-${band.upper} band dropped: invalid bounds (lower >= upper)`
      );
    }
    lines.push(`define "MeetsObesity": ${parts.join(' or ')}`, ``);
    rollup.push(`"MeetsObesity"`);
  }

  // The roll-up: null (documentation-gated) when there are no computable rules, so the caller never
  // reports a bare "true" for criteria that were not actually reduced to codes.
  lines.push(
    `// null = not fully computable from coded data → documentation-gated`,
    rollup.length > 0
      ? `define "MeetsCodedCriteria": ${rollup.join(' and ')}`
      : `define "MeetsCodedCriteria": null`
  );

  return lines.join('\n') + '\n';
}
