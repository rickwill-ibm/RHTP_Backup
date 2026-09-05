import { useDemoStore } from '@/uhg/store/demoStore';
import { getPatientById, type RegistryPatient } from '@/lib/patientRegistry';

/**
 * useActiveCitizen — single access point for the active patient/citizen context.
 *
 * Thin wrapper over demoStore so pages stop duplicating the same store wiring
 * (the previous copy-paste of `useDemoStore((s) => s.activeCitizenId)` /
 * `s.setActiveCitizen` across a dozen pages). Selectors stay ATOMIC — each reads a
 * single primitive/function reference — so referential stability is unchanged and
 * the golden demo (Maria, default `MARIA_SD_001`) renders byte-identical.
 *
 * It also resolves the active id against the patient registry and reports a
 * `status`, so member-subject screens can fail CLOSED on an unknown/absent member
 * (render MemberScopeNotice) instead of silently falling back to Maria's record.
 * `member` is a stable registry reference (or null); `status` is:
 *   • 'resolved' — id maps to a real member,
 *   • 'none'     — no active id in scope,
 *   • 'invalid'  — an id is set but the registry has no such member.
 *
 * Future cross-cutting concerns on the active citizen (telemetry on switch, authz
 * on setActiveCitizen, memoized derivations) hang here, not in every page.
 */
export type ActiveCitizenStatus = 'resolved' | 'none' | 'invalid';

export interface ActiveCitizen {
  activeCitizenId: string;
  setActiveCitizen: (id: string) => void;
  /** Resolved registry record for the active citizen, or null when not resolvable. */
  member: RegistryPatient | null;
  status: ActiveCitizenStatus;
}

export function useActiveCitizen(): ActiveCitizen {
  const activeCitizenId = useDemoStore((s) => s.activeCitizenId);
  const setActiveCitizen = useDemoStore((s) => s.setActiveCitizen);
  const member = activeCitizenId ? getPatientById(activeCitizenId) ?? null : null;
  const status: ActiveCitizenStatus = !activeCitizenId ? 'none' : member ? 'resolved' : 'invalid';
  return { activeCitizenId, setActiveCitizen, member, status };
}
