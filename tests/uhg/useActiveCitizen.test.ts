// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { useActiveCitizen } from '@/uhg/store/useActiveCitizen';
import { useDemoStore } from '@/uhg/store/demoStore';

afterEach(() => {
  cleanup(); // unmount the hook so the next test's store update has no mounted subscriber (no act warning)
  useDemoStore.setState({ activeCitizenId: 'MARIA_SD_001' });
});

describe('useActiveCitizen — resolution status', () => {
  it("resolves a known member (status 'resolved', member present)", () => {
    useDemoStore.setState({ activeCitizenId: 'MARIA_SD_001' });
    const { result } = renderHook(() => useActiveCitizen());
    expect(result.current.status).toBe('resolved');
    expect(result.current.member?.platformId).toBe('MARIA_SD_001');
  });

  it("reports 'invalid' for an unknown id, and never leaks another member", () => {
    useDemoStore.setState({ activeCitizenId: 'PAT-9999-GHOST' });
    const { result } = renderHook(() => useActiveCitizen());
    expect(result.current.status).toBe('invalid');
    expect(result.current.member).toBeNull();
  });

  it("reports 'none' when no citizen is active", () => {
    useDemoStore.setState({ activeCitizenId: '' });
    const { result } = renderHook(() => useActiveCitizen());
    expect(result.current.status).toBe('none');
    expect(result.current.member).toBeNull();
  });
});
