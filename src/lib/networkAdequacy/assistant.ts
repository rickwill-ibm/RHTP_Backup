/**
 * Network Adequacy interactive assistant (increment NA-2).
 *
 * The analyst copilot, deterministic-first: it parses a payer/state analyst's
 * natural-language request into a typed intent and answers **from the engine**,
 * so it works offline (no API key) and every number is grounded and reproducible.
 * An optional LLM layer (flag-gated) can rephrase / narrate on top -- but the
 * facts always come from here.
 */
import { computeMetrics, computeGaps, validateCell, recommendAugmentation } from './adequacyEngine';
import type { AdequacyInput, Lob } from './types';
import type { AdequacyMetric, Gap, ValidationResult, AugmentCandidate } from './types';

export type AssistantIntentKind =
  'baseline' | 'prioritize' | 'deep-dive' | 'compare' | 'augment' | 'validate' | 'help';

export interface AssistantScope {
  state?: string;
  county?: string;
  specialty?: string;
  lob?: Lob;
}

export interface AssistantIntent {
  kind: AssistantIntentKind;
  scope: AssistantScope;
}

export interface AssistantResponse {
  intent: AssistantIntentKind;
  scope: AssistantScope;
  text: string;
  metrics?: AdequacyMetric[];
  gaps?: Gap[];
  validation?: ValidationResult;
  augmentation?: AugmentCandidate;
  /** Drives the dashboard/heatmap (storyboard behavior). */
  visualizationUpdates?: {
    focusState?: string;
    focusCounties?: string[];
    specialty?: string;
    lob?: Lob;
  };
  suggestions: string[];
}

const SPECIALTIES = ['Pediatrics', 'Primary Care', 'Mental Health', 'Cardiology', 'OB/GYN'];
const SPECIALTY_ALIASES: Record<string, string> = {
  peds: 'Pediatrics',
  pediatric: 'Pediatrics',
  pediatrics: 'Pediatrics',
  'primary care': 'Primary Care',
  pcp: 'Primary Care',
  behavioral: 'Mental Health',
  'mental health': 'Mental Health',
  psychiatry: 'Mental Health',
  cardiology: 'Cardiology',
  cardiac: 'Cardiology',
  'ob/gyn': 'OB/GYN',
  obgyn: 'OB/GYN',
  'ob gyn': 'OB/GYN',
};

function detectSpecialty(q: string): string | undefined {
  const lq = q.toLowerCase();
  for (const [alias, canonical] of Object.entries(SPECIALTY_ALIASES)) {
    if (lq.includes(alias)) return canonical;
  }
  return SPECIALTIES.find((s) => lq.includes(s.toLowerCase()));
}

function detectLob(q: string): Lob | undefined {
  const lq = q.toLowerCase();
  if (lq.includes('medicaid')) return 'Medicaid';
  if (lq.includes('medicare')) return 'Medicare';
  if (lq.includes('commercial')) return 'Commercial';
  return undefined;
}

function detectState(q: string, input: AdequacyInput, defaultState?: string): string | undefined {
  const lq = q.toLowerCase();
  if (lq.includes('maria') || lq.includes('south dakota') || /\bsd\b/.test(lq)) return 'SD';
  if (lq.includes('georgia') || /\bga\b/.test(lq)) return 'GA';
  return defaultState;
}

function detectCounty(q: string, input: AdequacyInput): string | undefined {
  const lq = q.toLowerCase();
  return input.geo.map((g) => g.name).find((c) => lq.includes(c.toLowerCase()));
}

/** Parse a free-text analyst request into a typed intent + scope. */
export function parseIntent(
  query: string,
  input: AdequacyInput,
  ctx?: { defaultState?: string }
): AssistantIntent {
  const lq = query.toLowerCase();
  const scope: AssistantScope = {
    state: detectState(query, input, ctx?.defaultState),
    county: detectCounty(query, input),
    specialty: detectSpecialty(query),
    lob: detectLob(query),
  };
  let kind: AssistantIntentKind = 'baseline';
  if (/valid|complian|meet|pass|fail|certif|audit/.test(lq)) kind = 'validate';
  else if (/augment|recommend|add provider|improve|remediat|fix/.test(lq)) kind = 'augment';
  else if (/prioriti|worst|top|biggest|gap|challeng|risk/.test(lq)) kind = 'prioritize';
  else if (/compare|vs\.?|versus|target/.test(lq)) kind = 'compare';
  else if (scope.county || /deep|explore|detail|drill|dive/.test(lq)) kind = 'deep-dive';
  else if (/help|what can you|how do/.test(lq)) kind = 'help';
  else if (/baseline|overview|summary|show|state-?level/.test(lq)) kind = 'baseline';
  return { kind, scope };
}

function pct(n: number): string {
  return `${n}%`;
}
function label(scope: AssistantScope): string {
  return (
    [scope.specialty, scope.lob, scope.county, scope.state].filter(Boolean).join(' · ') ||
    'all cells'
  );
}

/** Run the assistant deterministically over the engine. */
export function runAssistant(
  query: string,
  input: AdequacyInput,
  ctx?: { defaultState?: string }
): AssistantResponse {
  const { kind, scope } = parseIntent(query, input, ctx);
  const base = { intent: kind, scope } as const;

  if (kind === 'help') {
    return {
      ...base,
      text: 'I can help you analyze and validate provider network adequacy. Try: "show the Medicaid pediatric baseline for Maria--s state", "prioritize the worst behavioral-health gaps in SD", "validate Oglala Lakota pediatrics Medicaid against CMS standards", or "recommend augmentation for Fulton mental health Medicaid".',
      suggestions: [
        'Show the baseline for SD Medicaid Pediatrics',
        'Prioritize the worst gaps in South Dakota',
        'Validate Oglala Lakota Pediatrics Medicaid',
      ],
    };
  }

  if (kind === 'prioritize') {
    const gaps = computeGaps(input, {
      state: scope.state,
      specialty: scope.specialty,
      lob: scope.lob,
    }).slice(0, 5);
    const lines = gaps.map(
      (g, i) =>
        `${i + 1}. ${g.county}, ${g.state} -- ${g.specialty}/${g.lob}: ${pct(g.currentPct)} (target ${pct(g.requiredPct)}, ${g.severity}, ~${g.affectedPopulation.toLocaleString()} affected, +${g.shortfallProviders} providers needed)`
    );
    return {
      ...base,
      gaps,
      text: gaps.length
        ? `Top ${gaps.length} adequacy gaps for ${label(scope)}:\n` + lines.join('\n')
        : `No gaps found for ${label(scope)} -- all cells meet target.`,
      visualizationUpdates: {
        focusState: scope.state,
        focusCounties: gaps.map((g) => g.county),
        specialty: scope.specialty,
        lob: scope.lob,
      },
      suggestions: gaps.length
        ? [
            `Validate ${gaps[0].county} ${gaps[0].specialty} ${gaps[0].lob}`,
            `Recommend augmentation for ${gaps[0].county} ${gaps[0].specialty} ${gaps[0].lob}`,
          ]
        : ['Show the baseline'],
    };
  }

  if (kind === 'validate') {
    // validate a specific cell if fully scoped; else validate the worst gap in scope
    let county = scope.county;
    let specialty = scope.specialty;
    let lob = scope.lob;
    if (!(county && specialty && lob)) {
      const worst = computeGaps(input, { state: scope.state, specialty, lob })[0];
      if (worst) {
        county = county ?? worst.county;
        specialty = specialty ?? worst.specialty;
        lob = lob ?? worst.lob;
      }
    }
    if (!(county && specialty && lob)) {
      return {
        ...base,
        text: 'Tell me the county, specialty, and line of business to validate (e.g. "validate Todd primary care Medicaid").',
        suggestions: ['Prioritize the worst gaps'],
      };
    }
    const v = validateCell(input, { county, specialty, lob });
    if (!v)
      return { ...base, text: `No data for ${county} · ${specialty} · ${lob}.`, suggestions: [] };
    const checkLines = v.checks.map(
      (c) => `  ${c.pass ? 'OK' : 'FAIL'} ${c.standard}: ${c.detail}`
    );
    return {
      ...base,
      validation: v,
      text:
        `Compliance validation -- ${county}, ${specialty}/${lob}: ${v.compliant ? 'COMPLIANT OK' : 'NON-COMPLIANT FAIL'}\n` +
        checkLines.join('\n'),
      visualizationUpdates: { focusState: scope.state, focusCounties: [county], specialty, lob },
      suggestions: v.compliant
        ? ['Prioritize other gaps']
        : [`Recommend augmentation for ${county} ${specialty} ${lob}`],
    };
  }

  if (kind === 'augment') {
    let county = scope.county;
    let specialty = scope.specialty;
    let lob = scope.lob;
    if (!(county && specialty && lob)) {
      const worst = computeGaps(input, { state: scope.state, specialty, lob })[0];
      if (worst) {
        county = county ?? worst.county;
        specialty = specialty ?? worst.specialty;
        lob = lob ?? worst.lob;
      }
    }
    if (!(county && specialty && lob)) {
      return {
        ...base,
        text: 'Tell me the cell to augment (county + specialty + LOB).',
        suggestions: ['Prioritize the worst gaps'],
      };
    }
    const a = recommendAugmentation(input, { county, specialty, lob });
    if (!a)
      return { ...base, text: `No data for ${county} · ${specialty} · ${lob}.`, suggestions: [] };
    return {
      ...base,
      augmentation: a,
      text: `Augmentation recommendation -- ${a.rationale} (est. lift +${a.adequacyLiftPct} pts). Human review required before contracting.`,
      visualizationUpdates: { focusState: scope.state, focusCounties: [county], specialty, lob },
      suggestions: [`Validate ${county} ${specialty} ${lob} after augmentation`],
    };
  }

  if (kind === 'deep-dive' && scope.county) {
    const metrics = computeMetrics(input, {
      county: scope.county,
      specialty: scope.specialty,
      lob: scope.lob,
    });
    const lines = metrics.map(
      (m) =>
        `  ${m.specialty}/${m.lob}: ${pct(m.adequacyPct)}${m.gapStatus ? ' (GAP)' : ''} · nearest ${m.nearestDistanceMiles ?? '--'}mi · ${m.providerCount} in-county providers`
    );
    const geo = input.geo.find((g) => g.name === scope.county);
    return {
      ...base,
      metrics,
      text:
        `${scope.county}, ${geo?.state ?? ''} (${geo?.countyType ?? ''}) -- adequacy detail:\n` +
        lines.join('\n'),
      visualizationUpdates: {
        focusState: geo?.state,
        focusCounties: [scope.county],
        specialty: scope.specialty,
        lob: scope.lob,
      },
      suggestions: [
        `Validate ${scope.county} ${metrics.find((m) => m.gapStatus)?.specialty ?? ''} ${metrics.find((m) => m.gapStatus)?.lob ?? ''}`.trim(),
      ],
    };
  }

  if (kind === 'compare') {
    const metrics = computeMetrics(input, {
      state: scope.state,
      specialty: scope.specialty,
      lob: scope.lob,
    });
    const avg = metrics.length
      ? Math.round(metrics.reduce((s, m) => s + m.adequacyPct, 0) / metrics.length)
      : 0;
    const target = metrics[0]?.targetPct ?? 85;
    return {
      ...base,
      metrics,
      text: `For ${label(scope)}: average adequacy ${pct(avg)} vs target ${pct(target)} across ${metrics.length} cells; ${metrics.filter((m) => m.gapStatus).length} below target.`,
      visualizationUpdates: { focusState: scope.state, specialty: scope.specialty, lob: scope.lob },
      suggestions: ['Prioritize the gaps'],
    };
  }

  // baseline (default)
  const metrics = computeMetrics(input, {
    state: scope.state,
    specialty: scope.specialty,
    lob: scope.lob,
  });
  const gaps = metrics.filter((m) => m.gapStatus);
  const avg = metrics.length
    ? Math.round(metrics.reduce((s, m) => s + m.adequacyPct, 0) / metrics.length)
    : 0;
  return {
    ...base,
    intent: 'baseline',
    metrics,
    text: `Baseline for ${label(scope)}: ${metrics.length} cells, average adequacy ${pct(avg)}, ${gaps.length} below target${gaps.length ? ` (worst: ${gaps.sort((a, b) => a.adequacyPct - b.adequacyPct)[0].county} ${gaps[0].specialty}/${gaps[0].lob} at ${pct(gaps[0].adequacyPct)})` : ''}.`,
    visualizationUpdates: {
      focusState: scope.state,
      focusCounties: gaps.map((g) => g.county),
      specialty: scope.specialty,
      lob: scope.lob,
    },
    suggestions: ['Prioritize the worst gaps', 'Validate the worst cell'],
  };
}
