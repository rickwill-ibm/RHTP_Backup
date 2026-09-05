import { useEffect } from 'react';
import { useDemoStore } from '@/uhg/store/demoStore';

/**
 * Launch precedence — single source. A deep-linked / SMART-launch route whose URL carries the
 * member (e.g. /care-plan-monitor/[patientId]) is AUTHORITATIVE: reflect it as the global active
 * member so the shell chrome matches the record being viewed. No-op when memberId is empty, so an
 * unknown/missing id never forces a member (the screen's own fail-closed guard then applies).
 * Reused by launch-frame screens instead of each page re-wiring the store.
 */
export function useLaunchMemberSync(memberId?: string): void {
  const setActiveCitizen = useDemoStore((s) => s.setActiveCitizen);
  useEffect(() => {
    if (memberId) setActiveCitizen(memberId);
  }, [memberId, setActiveCitizen]);
}
