/**
 * validateCodeVersioned (I8A-ii wave A) - the REAL member-of-bound-version check.
 *
 * A governed coding is VALID only if it is a member of the value-set VERSION the
 * registry currently binds for that system (deterministic via an injected clock /
 * asOf). The result carries the CodeAssetBinding (assetId, version, current) so a
 * caller knows exactly which version answered. Outcomes:
 *   - ungoverned system -> unsupported-system (valid: false)
 *   - retired in the bound version -> retired (valid: false) [E9]
 *   - member of the bound version -> valid
 *   - governed but not a member -> unknown-code (valid: false)
 *
 * PHI-free (system + code + status + version metadata only).
 */
import { valueSetRegistry, type ValueSetRegistry } from '../registry/valueSetRegistry';
import { SYSTEM_URIS, type CodeAssetBinding, type CodeValidation, type TerminologySystem } from '../types';
import { currentMembers, isGovernedSystem, isRetiredInCurrent, systemDisplay } from './membership';

/** Context for a versioned validation: which registry answers, at what time. */
export interface ValidateContext {
  registry?: ValueSetRegistry;
  /** The check time; when omitted the registry's own clock decides the current version. */
  asOf?: Date;
}

/** The registry asset that currently binds `system`, as a PHI-free binding. */
export function bindingForSystem(
  system: string,
  registry: ValueSetRegistry,
  asOf?: Date,
): CodeAssetBinding | undefined {
  const uri = SYSTEM_URIS[system as TerminologySystem];
  if (!uri) return undefined;
  const active = registry.getActiveBySystem(uri, asOf);
  if (!active) return undefined;
  return {
    assetId: active.id,
    version: active.version,
    status: active.status,
    current: registry.isCurrent(active.id, asOf),
  };
}

/** Validate a coding against the bound value-set version. */
export function validateCodeVersioned(
  system: TerminologySystem | string,
  code: string,
  ctx: ValidateContext = {},
): CodeValidation {
  if (!isGovernedSystem(system)) {
    return { system, code, valid: false, status: 'unsupported-system', stub: true };
  }
  const registry = ctx.registry ?? valueSetRegistry;
  const binding = bindingForSystem(system, registry, ctx.asOf);

  if (isRetiredInCurrent(system, code)) {
    return {
      system,
      code,
      valid: false,
      status: 'retired',
      display: systemDisplay(system, code),
      stub: true,
      binding,
    };
  }

  if (currentMembers(system).includes(code)) {
    return {
      system,
      code,
      valid: true,
      status: 'valid',
      display: systemDisplay(system, code),
      stub: true,
      binding,
    };
  }

  return { system, code, valid: false, status: 'unknown-code', stub: true, binding };
}
