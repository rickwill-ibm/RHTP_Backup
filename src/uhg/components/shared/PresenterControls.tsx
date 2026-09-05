'use client';

import React, { useEffect, useCallback, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useDemoStore, SCREEN_ORDER, SCREEN_ROUTES } from '@/uhg/store/demoStore';
import { resolveOrchestrateTarget, nextApplicableScreenIndex as nextApplicableScreenIndexFor } from '@/uhg/data/orchestrateNav';
import { downloadTalkTrackPDF } from '@/uhg/lib/generateTalkTrackPDF';

interface PresenterControlsProps {
  currentScreenId: string;
  onMariaInject?: () => void;
  onGovernanceIntercept?: () => void;
}

const SCREEN_KEY_MAP: Record<string, number> = {
  '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 6, '8': 7, '9': 8,
};

// ─── Appendix Overlay ─────────────────────────────────────────────────────────

function AppendixOverlay({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const store = useDemoStore();

  const APPENDIX_SCREENS = [
    {
      id: 'fragmentation' as const,
      label: 'CDP1 — Fragmentation Split System View',
      desc: 'System fragmentation view showing split care delivery across multiple systems and providers.',
      color: '#06b6d4',
      route: '/fragmentation-split-system-view',
    },
    {
      id: 'cdp-assembly' as const,
      label: 'CDP2 — CDP Assembly',
      desc: 'Customer Data Platform identity resolution and data assembly process.',
      color: '#8b5cf6',
      route: '/cdp-assembly-split',
    },
    {
      id: 'maria-subgraph' as const,
      label: 'CDP3 — Maria Subgraph Context',
      desc: 'Maria\'s knowledge graph subgraph showing relationships, care gaps, and context.',
      color: '#42be65',
      route: '/maria-subgraph-context',
    },
    {
      id: 'consumer-360' as const,
      label: 'UHG1 — Consumer 360',
      desc: 'RHTP-ORCHESTRATE Consumer 360 view with identity, care gaps, and household context.',
      color: '#78a9ff',
      route: '/consumer-360',
    },
    {
      id: 'whole-person-care' as const,
      label: 'UHG2 — Whole Person Care',
      desc: 'RHTP-ORCHESTRATE Whole Person Care orchestration and intervention planning.',
      color: '#f1c21b',
      route: '/whole-person-care',
    },
    {
      id: 'agent-marketplace-query' as const,
      label: 'A1 — Agent Marketplace Query',
      desc: 'Live agent selection and task routing — how the controller queries the marketplace for the right agent for each domain.',
      color: '#78a9ff',
      route: '/agent-marketplace-query',
    },
    {
      id: 'agent-library' as const,
      label: 'A2 — Agent Library',
      desc: '31-agent registry — full catalog of available agents, their domains, capabilities, and governance constraints.',
      color: '#42be65',
      route: '/agent-library',
    },
    {
      id: 'reporting-dashboard' as const,
      label: 'A3 — Reporting Dashboard',
      desc: 'Enterprise reporting — population-level outcomes, agent performance metrics, and governance audit trail.',
      color: '#c084fc',
      route: '/reporting-dashboard',
    },
    {
      id: 'burning-platform' as const,
      label: 'A4 — Burning Platform',
      desc: 'Board-level strategic context — SD Medicaid Star Rating trajectory, TCOC pressure, and prior auth reform timeline.',
      color: '#fa4d56',
      route: '/burning-platform',
    },
    {
      id: 'opening' as const,
      label: 'A5 — Your Enterprise — Right Now',
      desc: 'Enterprise scale view — 124,847 members, 8,293 providers, 47,291 active episodes. Maria Redhawk introduced.',
      color: '#f4f4f4',
      route: '/',
    },
    {
      id: 'maria-counterfactual' as const,
      label: 'A6 — Without Orchestration: Maria Redhawk — The Silent Failure Path',
      desc: 'Counterfactual scenario — what happens to Maria without agentic orchestration: missed signals, fragmented care, silent failure.',
      color: '#ff832b',
      route: '/maria-counterfactual',
    },
  ];

  const navigateTo = (route: string, screenId: typeof APPENDIX_SCREENS[0]['id']) => {
    store.setScreen(screenId);
    router.push(route);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#1c1c1c',
          border: '1px solid rgba(120,169,255,0.4)',
          borderRadius: 12,
          padding: '32px 36px',
          maxWidth: 640,
          width: '90%',
          boxShadow: '0 0 60px rgba(120,169,255,0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#6f6f6f', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 6 }}>
              APPENDIX — REFERENCE MATERIAL
            </div>
            <div style={{ fontSize: 22, fontWeight: 600, color: '#ffffff', letterSpacing: '-0.01em' }}>
              Deep-Dive Screens
            </div>
            <div style={{ fontSize: 13, color: '#8d8d8d', marginTop: 4 }}>
              Not part of the main flow — available on request. Press ESC or click outside to return.
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 6,
              padding: '6px 12px',
              color: '#8d8d8d',
              fontFamily: 'monospace',
              fontSize: 11,
              cursor: 'pointer',
              letterSpacing: '0.08em',
            }}
          >
            ESC — RETURN
          </button>
        </div>

        {/* Appendix screens */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {APPENDIX_SCREENS.map((screen) => (
            <button
              key={screen.id}
              onClick={() => navigateTo(screen.route, screen.id)}
              style={{
                background: `${screen.color}08`,
                border: `1px solid ${screen.color}35`,
                borderRadius: 8,
                padding: '16px 20px',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = `${screen.color}14`;
                (e.currentTarget as HTMLButtonElement).style.borderColor = `${screen.color}60`;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = `${screen.color}08`;
                (e.currentTarget as HTMLButtonElement).style.borderColor = `${screen.color}35`;
              }}
            >
              <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: screen.color, letterSpacing: '0.06em' }}>
                {screen.label}
              </span>
              <span style={{ fontSize: 13, color: '#8d8d8d', lineHeight: 1.5 }}>
                {screen.desc}
              </span>
              <span style={{ fontSize: 11, color: screen.color, opacity: 0.7 }}>
                Click to open →
              </span>
            </button>
          ))}
        </div>

        {/* Footer hint */}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(57,57,57,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#4b5563', letterSpacing: '0.1em' }}>
            Press A from any screen to open this panel
          </span>
          <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#4b5563', letterSpacing: '0.1em' }}>
            ESC returns you to where you left off
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Presenter Controls ───────────────────────────────────────────────────────

export default function PresenterControls({
  currentScreenId,
  onMariaInject,
  onGovernanceIntercept,
}: PresenterControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const store = useDemoStore();
  const [showAppendix, setShowAppendix] = useState(false);
  // Track whether a navigation is in flight to prevent double-fires
  const navigatingRef = useRef(false);

  const navigate = useCallback(
    (screenIndex: number) => {
      if (navigatingRef.current) return;
      const screenId = SCREEN_ORDER[screenIndex];
      if (!screenId) return;
      navigatingRef.current = true;
      store.setScreen(screenId);
      router.push(SCREEN_ROUTES[screenId]);
      // Release lock after navigation settles
      setTimeout(() => { navigatingRef.current = false; }, 400);
    },
    [router, store]
  );

  // Up/Down nav across the Agentic Orchestrate flow. Pure target resolution lives in
  // orchestrateNav; here we only apply side effects. Returns true if it handled the screen.
  const navigateOrchestrate = useCallback(
    (dir: 1 | -1): boolean => {
      const res = resolveOrchestrateTarget(pathname, store.activeCitizenId, dir);
      if (res.kind === 'not-orchestrate') return false; // let legacy SCREEN_ORDER nav handle it
      if (res.kind === 'navigate' && !navigatingRef.current) {
        navigatingRef.current = true;
        router.push(res.route);
        setTimeout(() => { navigatingRef.current = false; }, 400);
      }
      return true;
    },
    [pathname, router, store.activeCitizenId]
  );

  // Linear ←→ stepper: nearest applicable SCREEN_ORDER index for the selected patient (see orchestrateNav).
  const nextApplicableScreenIndex = useCallback(
    (fromIndex: number, dir: 1 | -1): number =>
      nextApplicableScreenIndexFor(fromIndex, dir, store.activeCitizenId),
    [store.activeCitizenId]
  );

  const openAppendix = useCallback(() => {
    store.openAppendix();
    setShowAppendix(true);
  }, [store]);

  const closeAppendix = useCallback(() => {
    const returnScreen = store.appendixReturnScreen;
    store.closeAppendix();
    setShowAppendix(false);
    if (returnScreen) {
      router.push(SCREEN_ROUTES[returnScreen]);
    }
  }, [store, router]);

  useEffect(() => {
    const pressedKeys = new Set<string>();

    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent default for navigation keys to stop browser scroll
      if (['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
      }

      // Skip if already pressed (prevent key-repeat auto-fire)
      if (pressedKeys.has(e.key)) return;
      pressedKeys.add(e.key);

      // Appendix — A key opens/closes
      if (e.key === 'a' || e.key === 'A') {
        if (showAppendix) {
          closeAppendix();
        } else {
          openAppendix();
        }
        return;
      }

      // ESC closes appendix
      if (e.key === 'Escape' && showAppendix) {
        closeAppendix();
        return;
      }

      // Advance — DOWN arrow ONLY (primary)
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        // If a screen has local reveal steps pending, do not navigate
        if (store.navigationBlocked) return;
        if (navigateOrchestrate(1)) return;
        const target = nextApplicableScreenIndex(SCREEN_ORDER.indexOf(store.currentScreen), 1);
        if (target !== -1) navigate(target);
        return;
      }

      // Back — UP arrow ONLY (primary)
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        // Allow going back even when navigation is blocked (clears block via screen unmount)
        if (navigateOrchestrate(-1)) return;
        const target = nextApplicableScreenIndex(SCREEN_ORDER.indexOf(store.currentScreen), -1);
        if (target !== -1) navigate(target);
        return;
      }

      // Right arrow also advances (secondary)
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (store.navigationBlocked) return;
        if (navigateOrchestrate(1)) return;
        const target = nextApplicableScreenIndex(SCREEN_ORDER.indexOf(store.currentScreen), 1);
        if (target !== -1) navigate(target);
        return;
      }

      // Left arrow also goes back (secondary)
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (navigateOrchestrate(-1)) return;
        const target = nextApplicableScreenIndex(SCREEN_ORDER.indexOf(store.currentScreen), -1);
        if (target !== -1) navigate(target);
        return;
      }

      // Pause
      if (e.key === 'p' || e.key === 'P') {
        store.toggleAnimationPaused();
        return;
      }

      // Jump to screen by number
      if (SCREEN_KEY_MAP[e.key] !== undefined) {
        navigate(SCREEN_KEY_MAP[e.key]);
        return;
      }

      // Graph states
      if ((pressedKeys.has('g') || pressedKeys.has('G')) && (e.key === 'p' || e.key === 'P')) {
        store.setGraphState('population');
        return;
      }
      if ((pressedKeys.has('g') || pressedKeys.has('G')) && (e.key === 'm' || e.key === 'M')) {
        store.setGraphState('subgraph');
        return;
      }

      // Maria signals
      if (e.key === 'm' || e.key === 'M') {
        if (!pressedKeys.has('g') && !pressedKeys.has('G')) {
          store.injectMariaSignals();
          onMariaInject?.();
        }
        return;
      }

      // Governance intercept
      if (e.key === 'i' || e.key === 'I') {
        store.triggerGovernanceIntercept();
        onGovernanceIntercept?.();
        return;
      }

      // Stats overlay
      if (e.key === 't' || e.key === 'T') {
        store.toggleStatsOverlay();
        return;
      }

      // Presenter notes / Talk Track — N key toggles between talk track and current demo screen
      if (e.key === 'n' || e.key === 'N') {
        store.togglePresenterNotes();
        if (pathname === '/talk-track') {
          const currentRoute = SCREEN_ROUTES[store.currentScreen];
          router.push(currentRoute);
        } else {
          router.push('/talk-track');
        }
        return;
      }

      // PDF download — D key generates talk track PDF
      if (e.key === 'd' || e.key === 'D') {
        downloadTalkTrackPDF();
        return;
      }

      // Reset
      if ((e.key === 'R' || e.key === 'r') && e.shiftKey) {
        store.reset();
        navigate(0);
        return;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      pressedKeys.delete(e.key);
    };

    // Use document-level capture to ensure we intercept before browser scroll
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    document.addEventListener('keyup', handleKeyUp, { capture: true });
    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
      document.removeEventListener('keyup', handleKeyUp, { capture: true });
    };
  }, [store, navigate, navigateOrchestrate, nextApplicableScreenIndex, onMariaInject, onGovernanceIntercept, pathname, router, showAppendix, openAppendix, closeAppendix]);

  return (
    <>
      {showAppendix && <AppendixOverlay onClose={closeAppendix} />}
    </>
  );
}
