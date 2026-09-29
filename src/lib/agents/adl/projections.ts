/**
 * Pure projections: definition set -> the generated authority artifacts.
 *
 * Manifest agents are ordered by id: the manifest is a lookup table, so its
 * array order carries no meaning and sorting makes output independent of the
 * order definitions were read from disk.
 *
 * Routes are NOT ordered by id. The dispatcher resolves a signal with
 * `routes.find(...)` — first match wins — so route order IS behaviour. It is
 * taken from the authored `dispatchOrder` on each route, and a duplicate order
 * is refused rather than broken by a tiebreak that would reintroduce the
 * dependence on read order.
 */
import { AdlError } from './errors';
import type {
  AgentDefinition,
  CompiledManifestFile,
  CompiledRoute,
  CompiledRoutingFile,
} from './types';

/** Project the definition set into the manifest file shape. */
export function projectManifest(
  defs: readonly AgentDefinition[],
  version: string
): CompiledManifestFile {
  const agents = [...defs]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((d) => ({
      id: d.id,
      version: d.version,
      purpose: d.purpose,
      toolAllowlist: [...d.toolAllowlist],
      autonomyTier: d.autonomyTier,
      escalationPolicyRef: d.escalationPolicyRef,
      phiPosture: d.phiPosture,
      owningModule: d.owningModule,
      // PROJECTED, deliberately. Leaving it out severed the whole static half:
      // nothing in src/ could build an AgentCapability, so the runtime gate ran
      // on an input with no governed producer and the lock's data-class cap read
      // `undefined` and passed vacuously. A separate artifact would not fix it —
      // a store-backed loader supplies the MANIFEST, so the cap must bind there.
      ...(d.dataCapability !== undefined ? { dataCapability: d.dataCapability } : {}),
    }));
  return { version, agents };
}

/**
 * Refuse a definition set whose routes share a dispatchOrder. Two routes at the
 * same precedence have no defined relative order, so the compiled array would
 * depend on read order — exactly the non-determinism dispatchOrder removes.
 */
export function assertUniqueDispatchOrder(defs: readonly AgentDefinition[]): void {
  const seen = new Map<number, string>();
  for (const d of defs) {
    for (const r of d.routes) {
      const prior = seen.get(r.dispatchOrder);
      if (prior !== undefined) {
        throw new AdlError(
          'ADL_ROUTE_ORDER',
          `${d.id}.routes.${r.id}`,
          `dispatchOrder ${r.dispatchOrder} is already held by ${prior} — ` +
            'route precedence must be total, or first-match dispatch becomes read-order dependent'
        );
      }
      seen.set(r.dispatchOrder, `${d.id}.routes.${r.id}`);
    }
  }
}

/** Project the definition set into the routing file shape. */
export function projectRouting(
  defs: readonly AgentDefinition[],
  version: string
): CompiledRoutingFile {
  assertUniqueDispatchOrder(defs);
  const ordered = defs
    .flatMap((d) => d.routes.map((r) => ({ agentId: d.id, route: r })))
    .sort((a, b) => a.route.dispatchOrder - b.route.dispatchOrder);
  const routes: CompiledRoute[] = ordered.map(({ agentId, route }) => {
    const compiled: CompiledRoute = {
      id: route.id,
      agentId,
      taskKind: route.taskKind,
      match: { ...route.match },
    };
    if (route.pa !== undefined) compiled.pa = route.pa;
    return compiled;
  });
  return { version, routes };
}
