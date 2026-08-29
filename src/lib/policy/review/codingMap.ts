/**
 * Coding-map seam — turns extracted policy content into the coding contribution the encoding-review
 * screen curates: proposed coverage ROLES for procedure codes, MAPPED diagnosis codes, DEFECT/
 * ambiguity flags, and documentation-gated items.
 *
 * Two implementations behind one interface (mirrors `goldenThread/dtr/generator.ts` and `server/
 * ocr.ts`): a DETERMINISTIC fallback that ships today (it cannot invent ICD codes, so it only routes
 * the reviewer to assign roles), and an AI provider gated by env config (endpoint + key) that does
 * the real terminology mapping + defect detection. Selection falls back to deterministic whenever
 * the AI path is not configured, so offline/mock runs never break. Both produce a DRAFT a human
 * signs off — never an auto-applied determination.
 */
import type { PolicyReview } from '@/lib/policy/policyReview';
import type { CodingMapContribution } from '@/lib/policy/review/fromPolicyReview';

export interface CodingMapProvider {
  id: 'deterministic' | 'ai';
  propose(review: PolicyReview): CodingMapContribution;
}

/**
 * Deterministic fallback. It has no terminology model, so it does NOT invent diagnosis codes or
 * coverage decisions; it simply flags every extracted procedure code for a reviewer to assign a
 * coverage role — honest attention-routing rather than a fabricated mapping.
 */
export const deterministicCodingMap: CodingMapProvider = {
  id: 'deterministic',
  propose(review: PolicyReview): CodingMapContribution {
    const flags: Record<string, { severity: 'verify'; message: string }> = {};
    for (const c of review.guidelineCodes ?? []) {
      flags[c.code] = {
        severity: 'verify',
        message: 'Assign coverage role (covered / not-covered / investigational)',
      };
    }
    return { flags };
  },
};

export interface AiCodingConfig {
  endpoint?: string;
  hasKey: boolean;
  configured: boolean;
}

/** Read the AI coding-map config from env (no secrets logged). Reuses the AI_DTR key by default.
 *  Typed as a loose env map (not NodeJS.ProcessEnv) so tests can pass a partial `{}` and so it
 *  never couples to a project's stricter ProcessEnv typing. */
export function aiCodingConfigFromEnv(
  env: Record<string, string | undefined> = process.env
): AiCodingConfig {
  const endpoint = env.AI_CODING_ENDPOINT || env.AI_DTR_ENDPOINT || undefined;
  const hasKey = !!env.ANTHROPIC_API_KEY;
  return { endpoint, hasKey, configured: !!endpoint && hasKey };
}

export class CodingMapNotConfiguredError extends Error {
  constructor() {
    super(
      'AI coding-map is enabled but not configured (missing AI_CODING_ENDPOINT / ANTHROPIC_API_KEY).'
    );
    this.name = 'CodingMapNotConfiguredError';
  }
}

/**
 * AI coding-map. When configured it POSTs the extracted criteria + codes to the coding endpoint and
 * returns proposed roles, ICD-10 diagnosis codes, defect/ambiguity flags, and gated items — all
 * reviewer-validated. The live call needs an endpoint + key and cannot run offline, so it throws
 * {@link CodingMapNotConfiguredError} until configured; selection never routes here unless configured.
 */
export const aiCodingMap: CodingMapProvider = {
  id: 'ai',
  propose(): CodingMapContribution {
    throw new CodingMapNotConfiguredError();
  },
};

export interface CodingMapSelection {
  provider: CodingMapProvider;
  reason: string;
}

/** Pick the coding-map provider: AI only when it is configured; deterministic otherwise. */
export function selectCodingMap(
  config: AiCodingConfig = aiCodingConfigFromEnv()
): CodingMapSelection {
  if (config.configured) return { provider: aiCodingMap, reason: 'AI coding-map configured' };
  return {
    provider: deterministicCodingMap,
    reason: 'AI coding-map not configured — deterministic fallback',
  };
}
