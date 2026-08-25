// SEAM: security/egress  // red-team: SSRF on seam endpoints (remote ops driver)
/**
 * Outbound egress allowlist (SSRF guard).
 *
 * Some seams forward work to a REMOTE URL taken from configuration — notably the
 * HTTP ops job driver (OPS_JOBS_REMOTE_URL in lib/jobs/opsRuntime.ts), which POSTs
 * to `${baseUrl}/api/ops/jobs/run`. Without a guard a misconfigured or injected
 * value could point the server at cloud metadata (169.254.169.254), loopback, or
 * private-network infrastructure — a server-side request forgery pivot.
 *
 * ONE model, no dev bypass. There are two tiers of danger and they are handled
 * differently on purpose:
 *   - ALWAYS blocked, every environment: cloud metadata / link-local (169.254/16),
 *     `*.internal` / `*.local`, and IPv6 link-local. These are NEVER a legitimate
 *     outbound target — not even in local dev — so the guard never relaxes them.
 *   - Conditionally allowed for LOCAL DEV only: loopback (127/8, ::1, localhost) and
 *     RFC-1918 private ranges, because a dev topology legitimately runs the runner
 *     on localhost. `allowPrivateNetwork` (true only in dev/mock) gates just this
 *     tier — it does not disable the metadata block.
 *
 * The environment differs by DATA (allowPrivateNetwork + allowedHosts), not by a
 * boolean that turns the checks off. Pure, no I/O (hostname-literal checks only;
 * DNS-rebinding defense belongs at the network layer and is noted, not attempted).
 */
export interface EgressPolicy {
  /** Allow loopback + RFC-1918 private hosts (local dev topologies). Metadata /
   *  link-local hosts are blocked regardless of this flag. */
  allowPrivateNetwork: boolean;
  /** Optional exact-host allowlist. When present, host must match (empty => deny all). */
  allowedHosts?: readonly string[];
}

export interface EgressCheck {
  allowed: boolean;
  /** PHI-safe reason (never includes credentials or query strings). */
  reason: string;
  /** Parsed host when the URL was syntactically valid. */
  host?: string;
}

/** Metadata / link-local hostnames that must NEVER be an outbound target. */
const ALWAYS_BLOCKED_LITERAL_HOSTS = new Set([
  '169.254.169.254', // cloud instance metadata (IMDS)
  'metadata',
  'metadata.google.internal',
]);

/** Loopback literals — blocked unless allowPrivateNetwork (local dev). */
const LOOPBACK_LITERAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);

/** Never-legitimate targets: cloud metadata, link-local, internal service names. */
function isAlwaysBlockedHost(host: string): boolean {
  const h = host.toLowerCase();
  if (ALWAYS_BLOCKED_LITERAL_HOSTS.has(h)) return true;
  if (h.endsWith('.internal') || h.endsWith('.local')) return true; // metadata + service-mesh internals
  if (/^169\.254\./.test(h)) return true; //                          IPv4 link-local 169.254.0.0/16
  const v6 = h.replace(/^\[|\]$/g, '');
  if (/^fe80:/.test(v6)) return true; //                              IPv6 link-local fe80::/10
  return false;
}

/** Loopback / private ranges: legitimate in local dev, blocked in production. */
function isPrivateOrLoopbackHost(host: string): boolean {
  const h = host.toLowerCase();
  if (LOOPBACK_LITERAL_HOSTS.has(h)) return true;
  if (/^127\./.test(h)) return true; //            loopback 127.0.0.0/8
  if (/^10\./.test(h)) return true; //             private 10.0.0.0/8
  if (/^192\.168\./.test(h)) return true; //       private 192.168.0.0/16
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true; // private 172.16.0.0/12
  const v6 = h.replace(/^\[|\]$/g, '');
  if (v6 === '::1') return true; //                 IPv6 loopback
  if (/^f[cd][0-9a-f]{2}:/.test(v6)) return true; // fc00::/7 unique-local
  return false;
}

/**
 * Vet an outbound base URL against the policy. Returns a decision — the caller
 * decides whether to throw (fail-closed) or fall back.
 */
export function checkOutboundUrl(rawUrl: string, policy: EgressPolicy): EgressCheck {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { allowed: false, reason: 'outbound url is not a valid absolute URL' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      allowed: false,
      reason: `outbound protocol '${parsed.protocol}' not allowed`,
      host: parsed.hostname,
    };
  }
  const host = parsed.hostname;

  // Never relaxed — metadata / link-local / internal service names.
  if (isAlwaysBlockedHost(host)) {
    return {
      allowed: false,
      reason: 'metadata/link-local host is never an allowed egress target',
      host,
    };
  }
  // Loopback / private ranges — allowed only in local dev.
  if (!policy.allowPrivateNetwork && isPrivateOrLoopbackHost(host)) {
    return {
      allowed: false,
      reason: 'loopback/private host not allowed in this environment',
      host,
    };
  }
  if (policy.allowedHosts !== undefined) {
    const ok = policy.allowedHosts.includes(host);
    return ok
      ? { allowed: true, reason: 'host on egress allowlist', host }
      : { allowed: false, reason: 'host not on egress allowlist', host };
  }
  return { allowed: true, reason: 'host passes egress checks', host };
}

export class EgressBlockedError extends Error {
  constructor(reason: string) {
    super(`outbound egress blocked: ${reason}`);
    this.name = 'EgressBlockedError';
  }
}

/** Throwing wrapper for the fail-closed call sites. Returns the vetted host. */
export function assertAllowedOutboundUrl(rawUrl: string, policy: EgressPolicy): string {
  const check = checkOutboundUrl(rawUrl, policy);
  if (!check.allowed) throw new EgressBlockedError(check.reason);
  return check.host ?? '';
}

/** Parse a comma/space-separated env allowlist into exact hosts (empty => undefined). */
export function parseAllowedHosts(raw: string | undefined): readonly string[] | undefined {
  if (!raw) return undefined;
  const hosts = raw
    .split(/[,\s]+/)
    .map((h) => h.trim().toLowerCase())
    .filter((h) => h.length > 0);
  return hosts.length > 0 ? hosts : undefined;
}
