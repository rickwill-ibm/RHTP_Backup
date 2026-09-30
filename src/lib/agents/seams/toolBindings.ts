// CONTRACT: C-SEAM
/**
 * The deployment-time tool-binding table.
 *
 * Bindings are CONFIGURATION: which provider serves an already-granted tool.
 * They are validated against the granted tool set derived from agent authority,
 * so a binding can never introduce a capability the manifest did not grant.
 */
import { serializeStable } from '@/lib/agents/adl';
import { SeamError } from './errors';
import type {
  AdvertisedToolDefinition,
  McpBinding,
  SeamMode,
  ToolBinding,
  ToolBindingTable,
} from './types';

function obj(raw: unknown, at: string): Record<string, unknown> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SeamError('SEAM_SHAPE', at, 'expected an object');
  }
  return raw as Record<string, unknown>;
}

function str(src: Record<string, unknown>, key: string, at: string): string {
  const v = src[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw new SeamError('SEAM_SHAPE', `${at}.${key}`, 'expected a non-empty string');
  }
  return v;
}

function parseMcp(
  b: Record<string, unknown>,
  at: string,
  tool: string,
  phi: 'none' | 'references-only'
): McpBinding {
  const transport = str(b, 'transport', at);
  if (transport !== 'stdio' && transport !== 'streamable-http') {
    throw new SeamError('SEAM_SHAPE', `${at}.transport`, 'unsupported transport');
  }
  const binding: McpBinding = {
    kind: 'mcp',
    tool,
    phiClass: phi,
    serverId: str(b, 'serverId', at),
    toolName: str(b, 'toolName', at),
    endpoint: str(b, 'endpoint', at),
    transport,
    expectedIssuer: str(b, 'expectedIssuer', at),
    pinnedToolHash: str(b, 'pinnedToolHash', at),
    baaOnFile: b.baaOnFile === true,
  };
  if (binding.phiClass !== 'none' && !binding.baaOnFile) {
    throw new SeamError(
      'SEAM_PHI_UNSAFE',
      `${at}.${tool}`,
      'an MCP server may not receive member references without a BAA on file'
    );
  }
  return binding;
}

function parseBinding(raw: unknown, at: string): ToolBinding {
  const b = obj(raw, at);
  const kind = str(b, 'kind', at);
  const tool = str(b, 'tool', at);
  const phiClass = str(b, 'phiClass', at);
  if (phiClass !== 'none' && phiClass !== 'references-only') {
    throw new SeamError('SEAM_SHAPE', `${at}.phiClass`, "expected 'none' | 'references-only'");
  }
  if (kind === 'in-process') return { kind, tool, phiClass, handlerId: str(b, 'handlerId', at) };
  if (kind === 'typed-client') return { kind, tool, phiClass, clientId: str(b, 'clientId', at) };
  if (kind === 'mcp') return parseMcp(b, at, tool, phiClass);
  throw new SeamError('SEAM_SHAPE', `${at}.kind`, `unknown provider kind "${kind}"`);
}

/** Parse a binding table. Refuses duplicates and malformed entries. */
export function parseToolBindingTable(raw: unknown, at: string): ToolBindingTable {
  const t = obj(raw, at);
  const mode = str(t, 'mode', at);
  if (mode !== 'mock' && mode !== 'production') {
    throw new SeamError('SEAM_SHAPE', `${at}.mode`, "expected 'mock' | 'production'");
  }
  if (!Array.isArray(t.bindings)) {
    throw new SeamError('SEAM_SHAPE', `${at}.bindings`, 'expected an array');
  }
  const bindings = t.bindings.map((b, i) => parseBinding(b, `${at}.bindings[${i}]`));
  const seen = new Set<string>();
  for (const b of bindings) {
    if (seen.has(b.tool)) {
      throw new SeamError('SEAM_DUPLICATE_BINDING', b.tool, 'bound more than once');
    }
    seen.add(b.tool);
  }
  return {
    version: str(t, 'version', at),
    environment: str(t, 'environment', at),
    mode: mode as SeamMode,
    bindings,
  };
}

/**
 * Refuse any binding for a tool no agent has been granted. This is the line
 * that stops deployment configuration widening authority.
 */
export function assertBindingsWithinGrants(
  table: ToolBindingTable,
  grantedTools: ReadonlySet<string>
): void {
  for (const b of table.bindings) {
    if (!grantedTools.has(b.tool)) {
      throw new SeamError(
        'SEAM_TOOL_NOT_GRANTED',
        b.tool,
        'no agent manifest grants this tool — a binding cannot create authority'
      );
    }
  }
}

/**
 * A binding table already checked against ONE agent's grants. `resolveBinding`
 * accepts nothing else, so a caller cannot resolve against the union of every
 * agent's tools and stay green.
 */
declare const AGENT_BOUND: unique symbol;
export interface AgentBoundTable {
  /** Brand: this key cannot be produced outside this module. */
  readonly [AGENT_BOUND]: true;
  readonly agentId: string;
  readonly table: ToolBindingTable;
  readonly granted: ReadonlySet<string>;
}

/**
 * The ONLY constructor for a resolvable table. It narrows a shared table to one
 * agent's granted set; `resolveBinding` then refuses anything outside it.
 *
 * Note the division of labour: `assertBindingsWithinGrants` is a BOOT-TIME check
 * of the whole table against the UNION of every agent's grants (no binding may
 * exist for an ungranted tool at all). This is the PER-AGENT narrowing.
 */
export function bindTableForAgent(
  table: ToolBindingTable,
  agentId: string,
  grantedTools: readonly string[]
): AgentBoundTable {
  return { agentId, table, granted: new Set(grantedTools) } as unknown as AgentBoundTable;
}

/** Refuse a production table that leaves any granted tool unbound. */
export function assertAllGrantsBound(
  table: ToolBindingTable,
  grantedTools: ReadonlySet<string>
): void {
  const bound = new Set(table.bindings.map((b) => b.tool));
  const missing = [...grantedTools].filter((t) => !bound.has(t)).sort();
  if (missing.length > 0) {
    throw new SeamError(
      'SEAM_NOT_CONFIGURED',
      table.environment,
      `granted but unbound: ${missing.join(', ')} — bind every granted tool before serving traffic`
    );
  }
}

/**
 * Resolve the provider for a granted tool. An unbound granted tool FAILS CLOSED;
 * it never falls back to an in-process mock.
 */
export function resolveBinding(bound: AgentBoundTable, tool: string): ToolBinding {
  const table = bound.table;
  if (!bound.granted.has(tool)) {
    throw new SeamError(
      'SEAM_TOOL_NOT_GRANTED',
      tool,
      `agent "${bound.agentId}" is not granted this tool`
    );
  }
  const found = table.bindings.find((b) => b.tool === tool);
  if (found) return found;
  throw new SeamError(
    'SEAM_NOT_CONFIGURED',
    tool,
    `no binding in environment "${table.environment}" (mode ${table.mode}) — ` +
      'configure it at deployment; the seam will not fall back'
  );
}

/**
 * Canonical form of an advertised MCP tool definition, for hashing. Uses the ONE
 * canonicaliser, recursively — a nested inputSchema must not hash differently
 * because a server reserialised its keys in another order.
 */
export function canonicalAdvertisedTool(advertised: AdvertisedToolDefinition): string {
  return serializeStable({
    description: advertised.description,
    inputSchema: advertised.inputSchema,
    name: advertised.name,
    outputSchema: advertised.outputSchema ?? null,
  });
}

/** A pinned hash must name its algorithm and be the right width. */
const PINNED_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;

/**
 * Bind-time conformance check for an MCP tool: re-hash what the server actually
 * advertises and compare to the reviewed pin. This is what makes deployment-time
 * MCP configuration safe rather than reckless.
 */
export function assertMcpToolConforms(
  binding: McpBinding,
  advertised: AdvertisedToolDefinition,
  presentedIssuer: string,
  hash: (canonical: string) => string
): void {
  const subject = `${binding.serverId}/${binding.toolName}`;
  // A descriptor is public, so pinning it alone would let any endpoint that replays
  // it receive traffic. The issuer is checked FIRST, and hard.
  if (presentedIssuer !== binding.expectedIssuer) {
    throw new SeamError(
      'SEAM_ISSUER_MISMATCH',
      subject,
      `endpoint presented issuer "${presentedIssuer}", expected "${binding.expectedIssuer}"`
    );
  }
  if (advertised.name !== binding.toolName) {
    throw new SeamError('SEAM_HASH_MISMATCH', subject, `server advertised "${advertised.name}"`);
  }
  if (!PINNED_HASH_PATTERN.test(binding.pinnedToolHash)) {
    throw new SeamError(
      'SEAM_HASH_MISMATCH',
      subject,
      'pinnedToolHash must be sha256:<64 hex> — an unqualified digest is not a pin'
    );
  }
  const digest = hash(canonicalAdvertisedTool(advertised));
  // Reject a degenerate hasher (identity, truncation) before comparing.
  if (!PINNED_HASH_PATTERN.test(digest)) {
    throw new SeamError(
      'SEAM_HASH_MISMATCH',
      subject,
      'the supplied hasher did not produce a sha256:<64 hex> digest'
    );
  }
  if (digest !== binding.pinnedToolHash) {
    throw new SeamError(
      'SEAM_HASH_MISMATCH',
      subject,
      'advertised tool definition does not match the reviewed pin — refusing to bind'
    );
  }
}
