# Agent manifest registry (`src/lib/agents/manifest`)

Every agent in the library is declared in a **versioned manifest**. The runtime
reads an agent's authority from here; nothing about it is implicit in code
(AI-CODING-CONVENTIONS §10.2). This is the "manifest-as-data" half of G4.

## What a manifest declares

```jsonc
{
  "id": "outreach-agent", // stable registry key (pre-allocated)
  "version": "1.0.0", // additive; a change bumps it
  "purpose": "…", // auditable one-line intent
  "toolAllowlist": ["…"], // the MINIMUM tools (least privilege, §10.3)
  "autonomyTier": "HITL", // HITL | HOTL | autonomous (§10.5)
  "escalationPolicyRef": "default", // names an escalation-as-data policy set
  "phiPosture": "references-only", // none | references-only | full
  "owningModule": "src/lib/agents/outreach",
}
```

Data file: [`data/agent-manifests.json`](./data/agent-manifests.json). Three
agents are registered (the pre-allocated ids): `outreach-agent`,
`referral-coordination-agent`, `pa-documentation-agent`.

## API

```ts
import { getAgentManifest, loadAgentManifests } from '@/lib/agents/manifest';

const m = getAgentManifest('outreach-agent'); // throws UnknownAgentError if absent
m.autonomyTier; // 'HITL' — READ, never branched on
loadAgentManifests().assertToolAllowed('outreach-agent', 'pa-machine.transition');
// -> throws ToolNotAllowedError (not in the outreach agent's allowlist)
```

- `getAgentManifest(id)` — read one manifest by id.
- `loadAgentManifests()` — the active `AgentManifestRegistry` for the resolved
  data mode (see seam below). `.list()`, `.ids()`, `.get(id)`,
  `.isToolAllowed(id, tool)`, `.assertToolAllowed(id, tool)`.
- `parseRegistry(data)` — validate a registry blob (hand validator, refuses
  loudly with `AgentManifestError`; the house pattern, no zod).

## Least privilege (§10.3)

`assertToolAllowed` is the single gate every runtime tool invocation passes
through. A call to a tool NOT in the agent's allowlist throws
`ToolNotAllowedError`. Widening an allowlist is a reviewed manifest change (bump
`version`), never a code tweak. Example minimums:

| agent                         | may use                                     | must NOT use          |
| ----------------------------- | ------------------------------------------- | --------------------- |
| `outreach-agent`              | comms-channel.send, person-context.read     | pa-machine.transition |
| `pa-documentation-agent`      | pa-machine.transition, dtr.generate         | comms-channel.send    |
| `referral-coordination-agent` | referral-status.read, provider-context.read | comms-channel.send    |

## Autonomy is configuration, not a branch (§10.5)

`autonomyTier` is **read** from the manifest. The runtime maps the tier to
decision behavior through a data lookup, never an `if (agentId === …)` branch.
Changing a manifest's tier changes behavior with **no code change** — proven by
`tests/agents/autonomyTier.test.ts`. Regardless of tier, an agent NEVER sets an
authoritative domain state (e.g. a PA approval); the owning state machine is the
single authority. See the runtime's guardrail test.

## dataMode seam: `agentManifests`

Resolved via `getDataMode('agentManifests')` (registered in
`src/lib/config/dataMode.ts`):

- `mock` / `seeded` — the shipped default file (keeps the demo green).
- `production` — a store-backed loader installed via
  `setProductionManifestLoader()`; falls back to the default file until wired.

The default file is the reference registry regardless of mode, so tests are
reproducible.
