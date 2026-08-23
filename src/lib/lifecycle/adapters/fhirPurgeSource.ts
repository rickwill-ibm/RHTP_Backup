/**
 * FHIR mutable-store purge adapter (Wave C).
 *
 * Projects resources from the in-memory FHIR store (a MUTABLE store) to PHI-safe
 * PurgeableItems and removes them via the store's PUBLIC API only
 * (`storeSearch` / `storeDelete`) — the store internals are never touched. This
 * is the concrete example of a purge source over a mutable store; the same
 * shape adapts the care-plan and dead-letter stores.
 *
 * The projection helpers read only ids, references, category codes, and the
 * lastUpdated timestamp — never clinical payload. `consentWithdrawnFor` is
 * injected so consent state is resolved by the caller (Wave B owns consent),
 * keeping this adapter free of a consent dependency.
 */
import { storeDelete, storeSearch } from '@/lib/fhir/store';
import type { PurgeSource, PurgeableItem } from '../types';

interface FhirBundleLike {
  entry?: Array<{ resource?: Record<string, unknown> }>;
}

export interface FhirPurgeSourceConfig {
  /** Resource types to scan and (when selected) purge, e.g. ['Observation']. */
  resourceTypes: string[];
  /** Resolve consent-withdrawal for a subject; defaults to always-false. */
  consentWithdrawnFor?: (subjectRef: string) => boolean;
  /** Store label; defaults to 'fhir'. */
  store?: string;
}

function subjectRefOf(res: Record<string, unknown>): string {
  const subject = (res.subject ?? res.patient) as { reference?: string } | undefined;
  const ref = subject?.reference;
  if (typeof ref === 'string') return ref.includes('/') ? ref.split('/').pop()! : ref;
  return 'unknown';
}

function createdAtOf(res: Record<string, unknown>): string {
  const meta = res.meta as { lastUpdated?: string } | undefined;
  if (typeof meta?.lastUpdated === 'string') return meta.lastUpdated;
  for (const k of ['effectiveDateTime', 'issued', 'recordedDate', 'authoredOn'] as const) {
    const v = res[k];
    if (typeof v === 'string') return v;
  }
  return '1970-01-01T00:00:00.000Z';
}

/** Create a purge source over the given FHIR resource types. */
export function createFhirPurgeSource(config: FhirPurgeSourceConfig): PurgeSource {
  const store = config.store ?? 'fhir';
  const consentWithdrawnFor = config.consentWithdrawnFor ?? (() => false);
  // id -> resourceType, so `remove` can route a delete to the right type.
  const typeById = new Map<string, string>();

  return {
    store,
    scan(): PurgeableItem[] {
      const items: PurgeableItem[] = [];
      for (const resourceType of config.resourceTypes) {
        const bundle = storeSearch<FhirBundleLike>(resourceType, {});
        for (const entry of bundle.entry ?? []) {
          const res = entry.resource;
          if (!res || typeof res.id !== 'string') continue;
          typeById.set(res.id, resourceType);
          const subjectRef = subjectRefOf(res);
          items.push({
            id: res.id,
            store,
            subjectRef,
            category: resourceType,
            createdAt: createdAtOf(res),
            consentWithdrawn: consentWithdrawnFor(subjectRef),
          });
        }
      }
      return items;
    },
    remove(id: string): void {
      const resourceType = typeById.get(id);
      if (!resourceType) {
        throw new Error(`fhir purge source: unknown id '${id}' (scan before remove)`);
      }
      storeDelete(resourceType, id);
    },
  };
}
