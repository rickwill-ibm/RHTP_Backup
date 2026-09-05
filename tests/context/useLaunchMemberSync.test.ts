// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLaunchMemberSync } from '@/lib/context/useLaunchMemberSync';
import { useDemoStore } from '@/uhg/store/demoStore';

beforeEach(() => useDemoStore.setState({ activeCitizenId: 'MARIA_SD_001' }));

describe('useLaunchMemberSync — launch precedence', () => {
  it('sets the global active member from a launch id', () => {
    renderHook(() => useLaunchMemberSync('PAT-0087'));
    expect(useDemoStore.getState().activeCitizenId).toBe('PAT-0087');
  });

  it('no-ops on an empty id (does not clobber the active member)', () => {
    renderHook(() => useLaunchMemberSync(''));
    expect(useDemoStore.getState().activeCitizenId).toBe('MARIA_SD_001');
  });

  it('no-ops on undefined', () => {
    renderHook(() => useLaunchMemberSync(undefined));
    expect(useDemoStore.getState().activeCitizenId).toBe('MARIA_SD_001');
  });
});
