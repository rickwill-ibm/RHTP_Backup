/**
 * ValueSet expansion provider — concept URI → enumerated codings (Phase 1: inline/offline).
 *
 * The resolver ({@link ../registry}) proposes a canonical ValueSet URI; this layer turns that URI
 * into the actual codings a conformant DTR item binds to. Two implementations behind one interface,
 * exactly like `codingMap.ts`:
 *   - `inlineExpansionProvider` — serves the PRE-EXPANDED curated corpus (`valueSets.ts`), deterministic,
 *     offline, no key. This is the default and the only provider the golden corpus asserts against.
 *   - `vsacExpansionProvider` (in `./vsac`) — the gated network `$expand`, inert until configured.
 *
 * Routing rule: CPT and every `urn:rhtp:*` value set STAY INLINE even when VSAC is configured (VSAC
 * cannot $expand CPT — AMA licensing; and the RHTP value sets are authored, not VSAC-hosted). So the
 * whole curated corpus resolves inline today; VSAC only ever sees a future non-RHTP canonical URI.
 */
import { VS_BY_URL } from '@/lib/policy/dtr/conformance/valueSets';
import { vsacExpansionProvider, VsacNotConfiguredError } from './vsac';

export interface ExpandedCoding {
  system: string;
  code: string;
  display?: string;
}
export interface ExpandedValueSet {
  url: string;
  codings: ExpandedCoding[];
}

export interface ValueSetExpansionProvider {
  id: 'inline' | 'vsac';
  /** Async-shaped so the network VSAC path fits; the inline path resolves synchronously then wraps. */
  expand(uri: string): Promise<ExpandedValueSet | undefined>;
}

export { VsacNotConfiguredError };

/** A ValueSet that must never leave the inline provider: RHTP-authored sets and anything CPT-bearing. */
export function isInlineOnlyUri(uri: string): boolean {
  return uri.startsWith('urn:rhtp:');
}

/** The inline, offline provider: expands the curated corpus; `undefined` for an unknown URI. */
export const inlineExpansionProvider: ValueSetExpansionProvider = {
  id: 'inline',
  async expand(uri) {
    const vs = VS_BY_URL[uri];
    if (!vs) return undefined;
    return {
      url: vs.url,
      codings: vs.concepts.map((c) => ({ system: c.system, code: c.code, display: c.display })),
    };
  },
};

export interface VsacConfig {
  endpoint?: string;
  hasKey: boolean;
  configured: boolean;
}

/** Read VSAC config from env (no secrets logged). Loose env map so tests can pass a partial `{}`. */
export function vsacConfigFromEnv(
  env: Record<string, string | undefined> = process.env
): VsacConfig {
  const endpoint = env.VSAC_ENDPOINT || undefined;
  const hasKey = !!env.VSAC_API_KEY;
  return { endpoint, hasKey, configured: !!endpoint && hasKey };
}

export interface ExpansionSelection {
  provider: ValueSetExpansionProvider;
  reason: string;
}

/**
 * A routing provider used only when VSAC is configured: inline for `urn:rhtp:*` / CPT-bearing sets,
 * VSAC for everything else. Keeps the CPT-never-VSAC and RHTP-inline invariants in one place.
 */
function routingProvider(): ValueSetExpansionProvider {
  return {
    id: 'vsac',
    async expand(uri) {
      return isInlineOnlyUri(uri)
        ? inlineExpansionProvider.expand(uri)
        : vsacExpansionProvider.expand(uri);
    },
  };
}

/**
 * Pick the expansion provider: inline by default (offline, deterministic); a VSAC-routing provider
 * only when VSAC is configured. Mirrors `selectCodingMap` — selection never routes to the gated path
 * unless it is configured, so offline/golden runs are always inline.
 */
export function selectExpansionProvider(
  config: VsacConfig = vsacConfigFromEnv()
): ExpansionSelection {
  if (config.configured) {
    return {
      provider: routingProvider(),
      reason: 'VSAC configured — inline for RHTP/CPT, VSAC else',
    };
  }
  return { provider: inlineExpansionProvider, reason: 'VSAC not configured — inline expansion' };
}
