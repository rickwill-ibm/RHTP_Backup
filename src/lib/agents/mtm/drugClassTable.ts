/**
 * Drug Class Table — resolves RxCUI → { atcLevel4, allergyClasses }.
 *
 * Provides a deterministic, offline-capable pharmacological class index.
 * Used by:
 *   - duplicateTherapyChecker (atcLevel4 → ATC Level-4 duplicate detection)
 *   - allergyChecker (allergyClasses → class-level allergy matching)
 *   - BFF drug-lookup route (augment DrugLookupResult with atcLevel4)
 *
 * The table covers the most clinically significant drug classes.
 * When a drug is not in the table the RxClass BFF call is attempted;
 * if that also fails the checks are skipped (no false positives).
 */
import classTable from './data/drug-class-table.json';

interface DrugClassEntry {
  name: string;
  atcLevel4: string;
  pharmacologicalClass: string;
  allergyClasses: string[];
}

interface ClassTableData {
  drugs: Record<string, DrugClassEntry>;
  allergyClassMap: Record<string, string[]>;
}

const TABLE = classTable as ClassTableData;

// Index drugs by rxcui key (key IS the rxcui in the JSON)
const DRUG_INDEX = new Map<string, DrugClassEntry>(
  Object.entries(TABLE.drugs).map(([k, v]) => [k, v])
);

// Also index by lowercased drug name for name-based fallback
const NAME_INDEX = new Map<string, DrugClassEntry>(
  Object.entries(TABLE.drugs).map(([, v]) => [v.name.toLowerCase(), v])
);

export interface DrugClassInfo {
  atcLevel4: string;
  pharmacologicalClass: string;
  allergyClasses: string[];
}

/**
 * Extract primary ingredient from pack-style RxNorm names.
 * "{4 (amoxicillin 500 MG Oral Capsule) / ...}" → "amoxicillin 500 MG Oral Capsule"
 * Regular names are returned unchanged.
 */
export function extractIngredient(name: string): string {
  const m = name.match(/^\{\s*\d+\s*\(([^)]+)\)/);
  return m ? m[1].trim() : name;
}

function toInfo(entry: DrugClassEntry): DrugClassInfo {
  return {
    atcLevel4: entry.atcLevel4,
    pharmacologicalClass: entry.pharmacologicalClass,
    allergyClasses: entry.allergyClasses,
  };
}

/**
 * Look up pharmacological class by RxCUI, then by name.
 * Also handles pack-style names (extracts primary ingredient before matching).
 * Returns null when not found — callers skip checks rather than false-positive.
 */
export function lookupDrugClass(rxcui: string, nameHint?: string): DrugClassInfo | null {
  const byId = DRUG_INDEX.get(rxcui);
  if (byId) return toInfo(byId);

  if (nameHint) {
    // Try the name as given
    const clean = extractIngredient(nameHint).toLowerCase().trim();
    const byName = NAME_INDEX.get(clean);
    if (byName) return toInfo(byName);

    // Partial first-word match (e.g. "amoxicillin 500 mg oral capsule" → key "amoxicillin ...")
    for (const [key, entry] of NAME_INDEX) {
      const firstWord = key.split(' ')[0];
      if (firstWord.length >= 4 && clean.startsWith(firstWord)) {
        return toInfo(entry);
      }
    }

    // Original name without extraction — handles when pack extraction already done upstream
    const origLower = nameHint.toLowerCase().trim();
    const byOrig = NAME_INDEX.get(origLower);
    if (byOrig) return toInfo(byOrig);

    for (const [key, entry] of NAME_INDEX) {
      const firstWord = key.split(' ')[0];
      if (firstWord.length >= 4 && origLower.startsWith(firstWord)) {
        return toInfo(entry);
      }
    }
  }

  return null;
}

/**
 * Resolve allergy classes from a raw substance name.
 * Used by allergyChecker to normalise AllergyIntolerance.code.text into
 * the standardised allergyClasses[] array.
 */
export function resolveAllergyClasses(substanceName: string): string[] {
  const lower = substanceName.toLowerCase().trim();
  const direct = TABLE.allergyClassMap[lower];
  if (direct) return direct;

  // Partial match (e.g. "Penicillin VK" → "penicillin")
  for (const [key, classes] of Object.entries(TABLE.allergyClassMap)) {
    if (lower.includes(key)) return classes;
  }

  return [];
}
