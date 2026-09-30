# Agent seams (`src/lib/agents/seams`)

## Authority is not binding

|  | **Authority** — *what an agent may do* | **Binding** — *where that capability lives* |
|---|---|---|
| Decided at | build time, in a reviewed manifest version bump | deployment time, in configuration |
| Artifact | `src/lib/agents/adl/data/*.agent.json` + `src/lib/agents/authority/data/authority-lock.json` | `data/tool-bindings.<env>.json` |
| Changed by | a reviewed PR gated by the authority lock | an ops change, gated by the conformance check |

An agent's allowlist never changes at deployment. Only the *provider* behind an
already-granted capability does. **Deployment can change plumbing; it can never widen a
grant** — `assertBindingsWithinGrants` refuses a binding for any tool no manifest grants.

## Provider kinds

- `in-process` — a handler inside this process. The default for mock/demo.
- `typed-client` — a hand-written client. **FHIR, HSDS, Cerner SMART and CDS Hooks belong
  here, not on MCP**: they have published schemas, and FHIR already carries versioned
  profiles and provenance that MCP would flatten into untyped text.
- `mcp` — an MCP tool server. This is the **agent** tool plane, bound at deployment.

## Why deployment-time MCP configuration is safe here

1. The manifest grants the abstract tool at build time; the lock gates that.
2. The binding names a concrete provider at deployment time.
3. **Bind-time conformance:** `assertMcpToolConforms` re-hashes the server's advertised
   definition and compares it to the reviewed `pinnedToolHash`. A mismatch refuses to
   bind. A server that silently changes a tool's description — which lands in the model's
   selection context — cannot take effect unreviewed.
4. `mcp:<serverId>/<toolName>` flows through the **existing** `assertToolAllowed`. There is
   no "MCP tool" concept in the authority layer and no second ACL.
5. An MCP server may not receive member references without `baaOnFile` — refused at parse.

**Not supported, deliberately:** MCP *sampling* (a server asking our client to run a model
completion — a direct injection channel into a reasoning step) and *elicitation* (a server
asking a human for input — an ungoverned path around the qualified-human gate). Both must
be hard-disabled at the client, not configured off.

## Fail closed

`tool-bindings.production.json` ships with **no bindings**. In production, resolving a
granted-but-unbound tool throws `SEAM_NOT_CONFIGURED`. The seam never falls back to a mock —
a demo cannot silently masquerade as production.
