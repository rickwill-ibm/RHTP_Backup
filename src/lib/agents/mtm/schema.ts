/**
 * MTM Agent — boundary parse functions.
 *
 * Every external API response (RxNorm, FDA NDC, RxNav Interactions)
 * is parsed through one of these functions exactly once, at the BFF boundary.
 * Interior code receives the parsed TypeScript type — never raw JSON.
 *
 * CONTRACT: BFF routes MUST call parseXxx() before returning to the client.
 * No external validation library — uses plain TypeScript type narrowing.
 */

// ── RxNorm Drugs (/REST/drugs) ───────────────────────────────────────────────

export interface ParsedRxNormConcept {
  rxcui: string;
  name: string;
  tty: string;
}

export interface ParsedRxNormDrugs {
  drugGroup: {
    name?: string;
    conceptGroup?: Array<{
      tty: string;
      conceptProperties?: ParsedRxNormConcept[];
    }>;
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function getString(obj: Record<string, unknown>, key: string): string {
  return typeof obj[key] === 'string' ? (obj[key] as string) : '';
}

export function parseRxNormDrugs(raw: unknown): ParsedRxNormDrugs | null {
  if (!isObject(raw)) return null;
  const dg = raw['drugGroup'];
  if (!isObject(dg)) return null;

  const conceptGroup: ParsedRxNormDrugs['drugGroup']['conceptGroup'] = [];
  const rawGroups = dg['conceptGroup'];
  if (Array.isArray(rawGroups)) {
    for (const g of rawGroups) {
      if (!isObject(g)) continue;
      const tty = getString(g, 'tty');
      const props: ParsedRxNormConcept[] = [];
      if (Array.isArray(g['conceptProperties'])) {
        for (const p of g['conceptProperties']) {
          if (!isObject(p)) continue;
          props.push({
            rxcui: getString(p, 'rxcui'),
            name: getString(p, 'name'),
            tty: getString(p, 'tty'),
          });
        }
      }
      conceptGroup.push({ tty, conceptProperties: props });
    }
  }

  return { drugGroup: { name: getString(dg, 'name'), conceptGroup } };
}

// ── RxNorm Related (brand → generic) (/REST/rxcui/{id}/related) ──────────────

export interface ParsedRxNormRelated {
  relatedGroup: {
    rxcui: string;
    conceptGroup?: Array<{
      tty: string;
      conceptProperties?: ParsedRxNormConcept[];
    }>;
  };
}

export function parseRxNormRelated(raw: unknown): ParsedRxNormRelated | null {
  if (!isObject(raw)) return null;
  const rg = raw['relatedGroup'];
  if (!isObject(rg)) return null;

  const conceptGroup: ParsedRxNormRelated['relatedGroup']['conceptGroup'] = [];
  const rawGroups = rg['conceptGroup'];
  if (Array.isArray(rawGroups)) {
    for (const g of rawGroups) {
      if (!isObject(g)) continue;
      const tty = getString(g, 'tty');
      const props: ParsedRxNormConcept[] = [];
      if (Array.isArray(g['conceptProperties'])) {
        for (const p of g['conceptProperties']) {
          if (!isObject(p)) continue;
          props.push({
            rxcui: getString(p, 'rxcui'),
            name: getString(p, 'name'),
            tty: getString(p, 'tty'),
          });
        }
      }
      conceptGroup.push({ tty, conceptProperties: props });
    }
  }

  return { relatedGroup: { rxcui: getString(rg, 'rxcui'), conceptGroup } };
}

// ── FDA NDC (/drug/ndc.json) ─────────────────────────────────────────────────

export interface ParsedFdaNdcResult {
  product_ndc: string;
  labeler_name: string;
  packaging: Array<{ description?: string }>;
}

export interface ParsedFdaNdcResponse {
  results: ParsedFdaNdcResult[];
}

export function parseFdaNdcResponse(raw: unknown): ParsedFdaNdcResponse {
  if (!isObject(raw) || !Array.isArray(raw['results'])) return { results: [] };
  const results: ParsedFdaNdcResult[] = [];
  for (const item of raw['results']) {
    if (!isObject(item)) continue;
    const packaging: ParsedFdaNdcResult['packaging'] = [];
    if (Array.isArray(item['packaging'])) {
      for (const pkg of item['packaging']) {
        if (isObject(pkg))
          packaging.push({
            description: typeof pkg['description'] === 'string' ? pkg['description'] : undefined,
          });
      }
    }
    results.push({
      product_ndc: getString(item, 'product_ndc'),
      labeler_name: getString(item, 'labeler_name'),
      packaging,
    });
  }
  return { results };
}

// ── RxNav Interaction (/REST/interaction/list) ────────────────────────────────

export interface ParsedInteractionConcept {
  minConceptItem: { rxcui: string; name: string };
}

export interface ParsedInteractionPair {
  interactionConcept: [ParsedInteractionConcept, ParsedInteractionConcept];
  severity: string;
  description: string;
}

export interface ParsedRxNavInteraction {
  fullInteractionTypeGroup: Array<{
    sourceName: string;
    fullInteractionType?: Array<{
      interactionPair?: ParsedInteractionPair[];
    }>;
  }>;
}

export function parseRxNavInteraction(raw: unknown): ParsedRxNavInteraction {
  if (!isObject(raw)) return { fullInteractionTypeGroup: [] };
  const groups = raw['fullInteractionTypeGroup'];
  if (!Array.isArray(groups)) return { fullInteractionTypeGroup: [] };

  const out: ParsedRxNavInteraction['fullInteractionTypeGroup'] = [];
  for (const grp of groups) {
    if (!isObject(grp)) continue;
    const sourceName = getString(grp, 'sourceName');
    const fullInteractionType: ParsedRxNavInteraction['fullInteractionTypeGroup'][0]['fullInteractionType'] =
      [];

    if (Array.isArray(grp['fullInteractionType'])) {
      for (const fit of grp['fullInteractionType']) {
        if (!isObject(fit)) continue;
        const pairs: ParsedInteractionPair[] = [];

        if (Array.isArray(fit['interactionPair'])) {
          for (const pair of fit['interactionPair']) {
            if (!isObject(pair)) continue;
            const concepts = pair['interactionConcept'];
            if (!Array.isArray(concepts) || concepts.length < 2) continue;
            const c1 = concepts[0];
            const c2 = concepts[1];
            if (!isObject(c1) || !isObject(c2)) continue;
            const m1 = isObject(c1['minConceptItem'])
              ? (c1['minConceptItem'] as Record<string, unknown>)
              : {};
            const m2 = isObject(c2['minConceptItem'])
              ? (c2['minConceptItem'] as Record<string, unknown>)
              : {};
            pairs.push({
              interactionConcept: [
                { minConceptItem: { rxcui: getString(m1, 'rxcui'), name: getString(m1, 'name') } },
                { minConceptItem: { rxcui: getString(m2, 'rxcui'), name: getString(m2, 'name') } },
              ],
              severity: getString(pair, 'severity') || 'moderate',
              description: getString(pair, 'description'),
            });
          }
        }
        fullInteractionType.push({ interactionPair: pairs });
      }
    }
    out.push({ sourceName, fullInteractionType });
  }
  return { fullInteractionTypeGroup: out };
}
