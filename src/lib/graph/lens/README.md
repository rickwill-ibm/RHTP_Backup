# Graph lens queries (`src/lib/graph/lens`)

The FIVE lens queries (DP-1 acceptance), Iteration 2 wave B1. Each lens is a
**store-agnostic** read expressed only against the `GraphStore` API (`getNode`,
`listNodes`, `listEdges`), so the Postgres and Neo4j backends satisfy every lens
identically. That co-equality is proven in code: `tests/graph/lens.acceptance.test.ts`
runs all five lenses against **both** backends from the same seeded event stream and
asserts byte-identical results.

They answer the same questions the demo's five lens filters ask of the hardcoded
`wholePersonGraphData`, but against the **projected** store.

| Lens               | Question                      | Scope over the projected graph                         |
| ------------------ | ----------------------------- | ------------------------------------------------------ |
| `whole-person`     | the member's complete picture | member + every connected resource (consent-filtered)   |
| `care-gap`         | what needs action             | OPEN encounters + unmet needs                          |
| `sdoh-barrier`     | social barriers               | SDOH screenings + the causal unmet needs               |
| `care-team`        | who is caring for them        | assigned care-team members (providers, care managers)  |
| `part2-restricted` | the sensitive subgraph        | the 42 CFR Part 2 / segmented nodes - gated by consent |

## Consent enforcement (C1)

Every lens runs under a `ConsentScope`. A **restricted** (Part 2 / segmented) node
is included only when the scope covers each of its restricting labels; the default
scope (`NO_CONSENT`) covers nothing, so restricted data is excluded by default. The
`part2-restricted` lens makes this the whole point: **empty without scope, populated
with it**. Part 2 enforcement is asserted on both backends in the acceptance suite.

## Usage

```ts
import { wholePersonLens, careGapLens, LENSES } from '@/lib/graph';

const view = await wholePersonLens(store, memberId); // no restricted data
const full = await wholePersonLens(store, memberId, { part2: true }); // with Part 2 consent
const gaps = await LENSES['care-gap'](store, memberId);
```

Both backends return the identical `LensResult` for the same input, because the
adapters return identical read-back records and the lens logic lives entirely above
the store interface.
