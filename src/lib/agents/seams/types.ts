// CONTRACT: C-SEAM  // SEAM: tool-binding
/**
 * Seam types — AUTHORITY IS NOT BINDING.
 *
 * Authority (which tools an agent may use) is decided at BUILD time in a
 * reviewed manifest, gated by the authority lock. Binding (where that tool
 * physically lives) is decided at DEPLOYMENT time, in configuration.
 *
 * Deployment can change plumbing. It can never widen a grant.
 *
 * INVARIANT: a binding may only name a tool that some agent's authority grants;
 *            a binding for an ungranted tool is refused at load.
 * INVARIANT: an MCP binding carries a pinned tool hash; at bind time the
 *            advertised definition is re-hashed and compared, and a mismatch
 *            fails closed rather than calling the tool.
 * INVARIANT: production mode with no binding for a granted tool fails closed
 *            with a typed error — it never silently falls back to a mock.
 */

/** Which side of the mock/production seam is active. */
export type SeamMode = 'mock' | 'production';

/** How a granted tool is physically reached. */
export type ProviderKind = 'in-process' | 'typed-client' | 'mcp';

/** Common fields every binding carries. */
interface BindingBase {
  /** The abstract tool id as granted in the agent manifest, e.g. 'person-context.read'. */
  tool: string;
  /** What member data may cross this boundary. Enforced at our edge, not theirs. */
  phiClass: 'none' | 'references-only';
}

/** A tool served by a function inside this process (the default for mock). */
export interface InProcessBinding extends BindingBase {
  kind: 'in-process';
  /** The registered handler id resolved from the effect registry. */
  handlerId: string;
}

/** A tool served by a hand-written typed client (FHIR, HSDS, SMART, CDS Hooks). */
export interface TypedClientBinding extends BindingBase {
  kind: 'typed-client';
  clientId: string;
}

/**
 * A tool served over MCP. Bound at deployment, never at build.
 * `pinnedToolHash` is the canonical hash of the server's advertised tool
 * definition captured when the binding was reviewed.
 */
export interface McpBinding extends BindingBase {
  kind: 'mcp';
  serverId: string;
  toolName: string;
  endpoint: string;
  transport: 'stdio' | 'streamable-http';
  expectedIssuer: string;
  pinnedToolHash: string;
  /** A server handling PHI needs a BAA on file; refused otherwise. */
  baaOnFile: boolean;
}

export type ToolBinding = InProcessBinding | TypedClientBinding | McpBinding;

/** The deployment-time binding table for one environment. */
export interface ToolBindingTable {
  version: string;
  environment: string;
  mode: SeamMode;
  bindings: ToolBinding[];
}

/** What an MCP server advertises for a tool, as we canonicalise it for hashing. */
export interface AdvertisedToolDefinition {
  name: string;
  description: string;
  inputSchema: unknown;
  outputSchema?: unknown;
}
