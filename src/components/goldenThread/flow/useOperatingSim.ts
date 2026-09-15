'use client';
/**
 * useOperatingSim — the ONE shared operating simulation behind all three Golden-Thread tabs.
 *
 * The live process flow, the Operations work-baskets, and the analyst workbench read the SAME
 * SimState, so an issue that arises in the flow (a pend, an underpayment, a §1557 breach, a
 * decision-clock timeout) mints one governed ticket, routes to one analyst persona, and opens one
 * workbench — a single operating loop, not three disconnected views.
 *
 * Owns the deterministic tick loop (requestAnimationFrame) and, under `?capture=1`, the window.__sim*
 * step hooks for GIF capture. CLIENT-SAFE: engine + spine only, no `@/lib/evidence` barrel.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createSim,
  advance,
  spawn278,
  runBatch837,
  grabTicket,
  routeDetection,
  proposeOutbound,
  closeCase,
  verifyEntry,
  verifyReconEntry,
  routeReconHandoff,
  routeReconPattern,
  startAppealWorkflow,
  reviewAppeal,
  releaseAppeal,
  dismissNotification,
  grantPromotion,
  revokeAuthority,
  setMaturity as setSimMaturity,
  type SimState,
} from '@/lib/goldenThread/flowSim';
import type { ScenarioId } from '@/lib/goldenThread/scenarios';

export interface OperatingSim {
  sim: SimState;
  version: number; // bumps on every state change so consumers re-render
  running: boolean;
  speed: number;
  maturity: number; // 0..100
  scenario: ScenarioId; // the active operating-book scenario
  inCapture: boolean;
  play(): void;
  step(): void;
  setSpeed(n: number): void;
  spawn(): void;
  batch(): void;
  reset(): void;
  setScenario(id: ScenarioId): void;
  changeMaturity(pct: number): void;
  grab(key: string, by: string): void;
  route(key: string, seat: string, authority: string, referOut?: string): void; // seal a detection→queue routing event
  propose(key: string, label: string, humanGated: boolean): void;
  close(key: string, disposition: 'resolved' | 'cleared', by: string, reason?: string): void;
  verify(seq: number): boolean;
  verifyRecon(seq: number): boolean; // re-derive one recon sub-ledger record's hash (tamper-evidence)
  routeRecon(seq: number): void; // route a recon record to its seat as a governed Operations ticket
  routePattern(
    kind: 'fee-schedule-config' | 'fwa-signal',
    provider: string,
    carc: string,
    count: number,
    amountUsd: number
  ): void;
  startAppeal(reconSeq: number): void; // instantiate the underpayment→appeal workflow
  reviewAppeal(wfId: string, by: string, approve: boolean, note?: string): void;
  releaseAppeal(wfId: string, by: string): void;
  dismissNotif(id: string): void;
  grantPromotion(): void; // human ratifies the earned authority promotion (never automatic)
  simulateBreach(): void; // presenter control: trip a §1557 breach → fail-closed revocation
}

let globalTick = 0; // read by the board's roundtrip interpolation
export function getGlobalTick(): number {
  return globalTick;
}

export function useOperatingSim(): OperatingSim {
  // Lazy-init: createSim() now warms the book (hundreds of advance() calls). The inline-arg form would
  // re-run that whole warm-up on EVERY render (useRef discards all but the first) — so build it once.
  const simRef = useRef<SimState>(null as unknown as SimState);
  if (!simRef.current) simRef.current = createSim();
  const [version, setVersion] = useState(0);
  const bump = useCallback((): void => setVersion((n) => n + 1), []);

  const [speed, setSpeedState] = useState(1);
  const [running, setRunning] = useState(false);
  const [maturity, setMaturityState] = useState(0);
  const [scenario, setScenarioState] = useState<ScenarioId>('wa-medicaid');
  const scenarioRef = useRef<ScenarioId>('wa-medicaid');
  const runningRef = useRef(false);
  const speedRef = useRef(1);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  const accRef = useRef(0);
  const captureRef = useRef(false);

  useEffect(() => {
    runningRef.current = running;
  }, [running]);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    const isCapture =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('capture') === '1';
    captureRef.current = isCapture;
    globalTick = simRef.current.tick;
    if (isCapture) {
      const w = window as unknown as Record<string, unknown>;
      w.__simStep = (n = 1): void => {
        for (let i = 0; i < n; i += 1) {
          advance(simRef.current);
          globalTick = simRef.current.tick;
        }
        bump();
      };
      w.__simReset = (seed = 20260914, sc: ScenarioId = scenarioRef.current): void => {
        scenarioRef.current = sc;
        setScenarioState(sc);
        simRef.current = createSim(seed, undefined, sc);
        globalTick = 0;
        setMaturityState(0);
        bump();
      };
      w.__sim278 = (): void => {
        spawn278(simRef.current);
        bump();
      };
      w.__simBatch = (): void => {
        runBatch837(simRef.current, 12);
        bump();
      };
      w.__simMaturity = (m: number): void => {
        setSimMaturity(simRef.current, m);
        setMaturityState(Math.round(m * 100));
        bump();
      };
      w.__simSpotlight = (adverse = false): void => {
        const t = adverse
          ? simRef.current.txns.find((x) => x.adverse && x.phase !== 'done' && x.phase !== 'denied')
          : simRef.current.txns.find(
              (x) => x.type === 'pa' && !x.adverse && x.phase !== 'done' && x.phase !== 'denied'
            );
        if (t) simRef.current.spotlightId = t.id;
        bump();
      };
      return;
    }
    const TICK_MS = 250;
    const loop = (ts: number): void => {
      if (lastRef.current === 0) lastRef.current = ts;
      const dt = ts - lastRef.current;
      lastRef.current = ts;
      if (runningRef.current && !document.hidden) {
        accRef.current += dt * speedRef.current;
        let steps = 0;
        while (accRef.current >= TICK_MS && steps < 8) {
          advance(simRef.current);
          globalTick = simRef.current.tick;
          accRef.current -= TICK_MS;
          steps += 1;
        }
        if (steps > 0) bump();
      } else {
        accRef.current = 0;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [bump]);

  const play = useCallback((): void => setRunning((r) => !r), []);
  const step = useCallback((): void => {
    advance(simRef.current);
    globalTick = simRef.current.tick;
    bump();
  }, [bump]);
  const setSpeed = useCallback((n: number): void => setSpeedState(n), []);
  const spawn = useCallback((): void => {
    spawn278(simRef.current);
    bump();
  }, [bump]);
  const batch = useCallback((): void => {
    runBatch837(simRef.current, 12);
    bump();
  }, [bump]);
  const reset = useCallback((): void => {
    simRef.current = createSim(undefined, undefined, scenarioRef.current);
    globalTick = 0;
    setRunning(false);
    setMaturityState(0);
    bump();
  }, [bump]);
  const setScenario = useCallback(
    (id: ScenarioId): void => {
      scenarioRef.current = id;
      setScenarioState(id);
      simRef.current = createSim(undefined, undefined, id); // full reset into the chosen scenario
      globalTick = 0;
      setRunning(false);
      setMaturityState(0);
      bump();
    },
    [bump]
  );
  const changeMaturity = useCallback(
    (pct: number): void => {
      setMaturityState(pct);
      setSimMaturity(simRef.current, pct / 100);
      bump();
    },
    [bump]
  );
  const grab = useCallback(
    (key: string, by: string): void => {
      grabTicket(simRef.current, key, by);
      bump();
    },
    [bump]
  );
  const route = useCallback(
    (key: string, seat: string, authority: string, referOut?: string): void => {
      routeDetection(simRef.current, key, seat, authority, referOut);
      bump();
    },
    [bump]
  );
  const propose = useCallback(
    (key: string, label: string, humanGated: boolean): void => {
      proposeOutbound(simRef.current, key, label, humanGated);
      bump();
    },
    [bump]
  );
  const close = useCallback(
    (key: string, disposition: 'resolved' | 'cleared', by: string, reason?: string): void => {
      closeCase(simRef.current, key, disposition, by, reason);
      bump();
    },
    [bump]
  );
  const verify = useCallback((seq: number): boolean => verifyEntry(simRef.current, seq), []);
  const verifyRecon = useCallback(
    (seq: number): boolean => verifyReconEntry(simRef.current, seq),
    []
  );
  const routeRecon = useCallback(
    (seq: number): void => {
      routeReconHandoff(simRef.current, seq);
      bump();
    },
    [bump]
  );
  const routePattern = useCallback(
    (
      kind: 'fee-schedule-config' | 'fwa-signal',
      provider: string,
      carc: string,
      count: number,
      amountUsd: number
    ): void => {
      routeReconPattern(simRef.current, kind, provider, carc, count, amountUsd);
      bump();
    },
    [bump]
  );
  const startAppeal = useCallback(
    (reconSeq: number): void => {
      startAppealWorkflow(simRef.current, reconSeq);
      bump();
    },
    [bump]
  );
  const reviewApp = useCallback(
    (wfId: string, by: string, approve: boolean, note?: string): void => {
      reviewAppeal(simRef.current, wfId, by, approve, note);
      bump();
    },
    [bump]
  );
  const releaseApp = useCallback(
    (wfId: string, by: string): void => {
      releaseAppeal(simRef.current, wfId, by);
      bump();
    },
    [bump]
  );
  const dismissNotif = useCallback(
    (id: string): void => {
      dismissNotification(simRef.current, id);
      bump();
    },
    [bump]
  );
  const grantPromo = useCallback((): void => {
    grantPromotion(simRef.current, 'human:governance');
    bump();
  }, [bump]);
  const simulateBreach = useCallback((): void => {
    revokeAuthority(simRef.current, '§1557 four-fifths breach (presenter-simulated)');
    bump();
  }, [bump]);

  return {
    sim: simRef.current,
    version,
    running,
    speed,
    maturity,
    scenario,
    inCapture: captureRef.current,
    play,
    step,
    setSpeed,
    spawn,
    batch,
    reset,
    setScenario,
    changeMaturity,
    grab,
    route,
    propose,
    close,
    verify,
    verifyRecon,
    routeRecon,
    routePattern,
    startAppeal,
    reviewAppeal: reviewApp,
    releaseAppeal: releaseApp,
    dismissNotif,
    grantPromotion: grantPromo,
    simulateBreach,
  };
}
