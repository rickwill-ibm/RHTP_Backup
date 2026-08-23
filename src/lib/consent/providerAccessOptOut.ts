import * as clock from '@/lib/clock'; // deterministic time/rng seam (test setters: setClock/setRng)
import { getDataMode } from '@/lib/config/dataMode';
/**
 * Provider Access opt-out consent store (Dev Plan Workstream A — closes the RFI
 * audit gap: "provides the opt-out model for Provider Access" was previously
 * architected-only with no implementation).
 *
 * CMS-0057-F requires that a member be able to opt out of the Provider Access API
 * sharing their data with a requesting provider, independent of whether a treatment
 * relationship exists. This is a distinct authorization basis from consent for
 * Payer-to-Payer (which is opt-in) — see lib/authz/guard.ts.
 *
 * Follows the same data-source-seam pattern as goldCardSource.ts / denialRates.ts:
 * a real production source (a consent-management system, or HCA's own consent
 * repository) can replace the mock store without changing callers.
 */

export interface ConsentRecord {
  memberId: string;
  optedOut: boolean;
  /** Who recorded the most recent change — always audited, never silent. */
  recordedBy: string;
  recordedAt: string; // ISO 8601
  /** Free-text reason, optional (e.g., "member request via portal"). */
  reason?: string;
}

export interface ProviderAccessConsentStore {
  id: string;
  /** Returns the current record, or null if the member has no consent record (default: not opted out). */
  getStatus(memberId: string): ConsentRecord | null;
  /** Record that a member has opted OUT of Provider Access data sharing. */
  optOut(memberId: string, recordedBy: string, reason?: string): ConsentRecord;
  /** Revoke a prior opt-out (member opts back in). Also audited, never silent. */
  revokeOptOut(memberId: string, recordedBy: string, reason?: string): ConsentRecord;
  /** Convenience check used by the authorization guard. Defaults to false (not opted out) when no record exists. */
  isOptedOut(memberId: string): boolean;
}

function nowIso(): string {
  return clock.nowIso();
}

/** In-memory mock store over a Map — swap for a real consent-repository client in production. */
function createMockProviderAccessConsentStore(): ProviderAccessConsentStore {
  const records = new Map<string, ConsentRecord>();

  return {
    id: 'mock-provider-access-consent',
    getStatus(memberId: string): ConsentRecord | null {
      return records.get(memberId) ?? null;
    },
    optOut(memberId: string, recordedBy: string, reason?: string): ConsentRecord {
      if (!recordedBy) {
        throw new Error('optOut requires recordedBy — consent changes must always be attributed');
      }
      const record: ConsentRecord = {
        memberId,
        optedOut: true,
        recordedBy,
        recordedAt: nowIso(),
        reason,
      };
      records.set(memberId, record);
      return record;
    },
    revokeOptOut(memberId: string, recordedBy: string, reason?: string): ConsentRecord {
      if (!recordedBy) {
        throw new Error(
          'revokeOptOut requires recordedBy — consent changes must always be attributed'
        );
      }
      const record: ConsentRecord = {
        memberId,
        optedOut: false,
        recordedBy,
        recordedAt: nowIso(),
        reason,
      };
      records.set(memberId, record);
      return record;
    },
    isOptedOut(memberId: string): boolean {
      return records.get(memberId)?.optedOut === true;
    },
  };
}

export const mockProviderAccessConsentStore: ProviderAccessConsentStore =
  createMockProviderAccessConsentStore();

// SEAM: consent — mode-registry switch point (lib/config/dataMode.ts).
// The future production backend (a consent-management system or HCA's own
// consent repository) plugs in here; callers go through this selector and
// never change. deploy.config.yaml's dataMode block sets DATA_MODE_CONSENT.

/** Resolve the consent store for the configured 'consent' data mode. */
export function getProviderAccessConsentStore(): ProviderAccessConsentStore {
  const mode = getDataMode('consent');
  if (mode === 'production') {
    throw new Error(
      'DATA_MODE consent=production: no production consent store is wired yet — ' +
        'implement a ProviderAccessConsentStore client here (SEAM: consent) or set DATA_MODE_CONSENT=mock.'
    );
  }
  // 'mock' and 'seeded' both serve the in-memory store (it has no seed file yet).
  return mockProviderAccessConsentStore;
}
