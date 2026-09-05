import { create } from 'zustand';

export type ScreenId =
  | 'burning-platform'
  | 'opening' |'fragmentation' |'cdp-assembly' |'maria-subgraph' |'knowledge-graph' |'consumer-360' |'whole-person-care' |'signal-classification-beat' |'signal-disposition-engine' |'maria-counterfactual' |'controller' |'financial-intelligence' |'family-sofia' |'caregiver-elena' |'agent-impact' |'portfolio-scale' |'strategic-roadmap' |'leave-behind'
  // Appendix screens
  | 'agent-marketplace-query' | 'reporting-dashboard' | 'agent-library';

// Main demo flow — 9 screens (CDP & Agentic Orchestration moved to appendix)
export const SCREEN_ORDER: ScreenId[] = [
  'knowledge-graph',
  'signal-disposition-engine',
  'controller',
  'family-sofia',
  'caregiver-elena',
  'agent-impact',
  'portfolio-scale',
  'strategic-roadmap',
  'leave-behind',
];

// Appendix screens — accessible via A key or Leave Behind button
export const APPENDIX_ORDER: ScreenId[] = [
  // CDP & Agentic Orchestration Section
  'fragmentation',
  'cdp-assembly',
  'maria-subgraph',
  'consumer-360',
  'whole-person-care',
  // Existing Appendix Screens
  'agent-marketplace-query',
  'agent-library',
  'reporting-dashboard',
  'burning-platform',
  'opening',
  'maria-counterfactual',
  'signal-classification-beat',
  'financial-intelligence',
];

export const SCREEN_ROUTES: Record<ScreenId, string> = {
  'burning-platform': '/burning-platform',
  'opening': '/',
  // Orchestrate screens live under /uhg-orchestrate/* — point the linear stepper at the
  // real pages (matches ORCHESTRATE_FLOW), not the bare routes that 404 / hit Backup stubs.
  'fragmentation': '/uhg-orchestrate/fragmentation-split-system-view',
  'cdp-assembly': '/uhg-orchestrate/cdp-assembly-split',
  'maria-subgraph': '/maria-subgraph-context',
  'knowledge-graph': '/knowledge-graph-population-and-maria-subgraph',
  'consumer-360': '/uhg-orchestrate/consumer-360',
  'whole-person-care': '/uhg-orchestrate/whole-person-care',
  'signal-classification-beat': '/signal-classification-beat',
  'signal-disposition-engine': '/uhg-orchestrate/signal-disposition-engine',
  'maria-counterfactual': '/maria-counterfactual',
  'agent-marketplace-query': '/agent-marketplace-query',
  'controller': '/uhg-orchestrate/controller-agentic-super-orchestration-centerpiece',
  'financial-intelligence': '/financial-intelligence',
  'family-sofia': '/uhg-orchestrate/family-sofia',
  'caregiver-elena': '/uhg-orchestrate/caregiver-elena',
  'agent-impact': '/uhg-orchestrate/agent-impact-dashboard',
  'reporting-dashboard': '/uhg-orchestrate/reporting-dashboard',
  'agent-library': '/uhg-orchestrate/agent-library',
  'portfolio-scale': '/uhg-orchestrate/portfolio-scale',
  'strategic-roadmap': '/strategic-roadmap',
  'leave-behind': '/leave-behind',
};

// ─── Agentic Orchestrate flow ───────────────────────────────────────────────────
// The actual pages live under /uhg-orchestrate/*. This ordered list is the single
// source of truth for Up/Down arrow navigation across the orchestrate screens
// (see PresenterControls). Order follows the demo narrative arc.
export interface OrchestrateStep { route: string; label: string }
export const ORCHESTRATE_FLOW: OrchestrateStep[] = [
  { route: '/uhg-orchestrate/fragmentation-split-system-view', label: 'Fragmentation' },        // step 32
  { route: '/uhg-orchestrate/cdp-assembly-split', label: 'CDP Assembly' },                       // step 33
  { route: '/whole-person-care-summary', label: 'Whole Person Care View' },                      // step 34
  { route: '/uhg-orchestrate/consumer-360', label: 'Consumer 360' },                             // step 35
  { route: '/uhg-orchestrate/whole-person-care', label: 'Whole Person Care Intelligence' },      // step 36
  { route: '/uhg-orchestrate/signal-disposition-engine', label: 'Signal Disposition' },          // step 37
  { route: '/uhg-orchestrate/controller-agentic-super-orchestration-centerpiece', label: 'Agentic Super Orchestration' }, // step 38
  { route: '/uhg-orchestrate/agent-library', label: 'Agent Library' },                           // step 39
  { route: '/uhg-orchestrate/family-sofia', label: 'Family Thread' },                          // step 40
  { route: '/uhg-orchestrate/caregiver-elena', label: 'Caregiver Intelligence' },                     // step 41
  { route: '/uhg-orchestrate/portfolio-scale', label: 'Portfolio Scale' },                       // step 42
  { route: '/uhg-orchestrate/agent-impact-dashboard', label: 'Agent Impact' },                   // step 43
  { route: '/uhg-orchestrate/reporting-dashboard', label: 'Reporting Dashboard' },               // step 44
];

export function orchestrateIndexFor(pathname: string | null | undefined): number {
  if (!pathname) return -1;
  return ORCHESTRATE_FLOW.findIndex((s) => pathname === s.route || pathname.endsWith(s.route));
}

export const SCREEN_LABELS: Record<ScreenId, string> = {
  'burning-platform': 'Burning Platform',
  'opening': 'Opening',
  'fragmentation': 'Fragmentation',
  'cdp-assembly': 'CDP Assembly',
  'maria-subgraph': 'Maria Subgraph',
  'knowledge-graph': 'Knowledge Graph',
  'consumer-360': 'Consumer 360',
  'whole-person-care': 'Whole Person Care',
  'signal-classification-beat': 'Signal Classification',
  'signal-disposition-engine': 'Signal Disposition',
  'maria-counterfactual': 'Counterfactual',
  'agent-marketplace-query': 'Agent Marketplace',
  'controller': 'Controller',
  'financial-intelligence': 'Financial Intelligence',
  'family-sofia': 'Family Thread',
  'caregiver-elena': 'Caregiver Intelligence',
  'agent-impact': 'Agent Impact',
  'reporting-dashboard': 'Reporting Dashboard',
  'agent-library': 'Agent Library',
  'portfolio-scale': 'Portfolio Scale',
  'strategic-roadmap': 'Strategic Roadmap',
  'leave-behind': 'Leave Behind',
};

export interface DemoState {
  currentScreen: ScreenId;
  phaseArcActive: { foundation: boolean; orchestration: boolean; autonomous: boolean };
  showMiniProfile: boolean;
  animationPaused: boolean;
  showPresenterNotes: boolean;
  showStatsOverlay: boolean;
  mariaSignalsInjected: boolean;
  activeCitizenId: string;
  setActiveCitizen: (id: string) => void;
  governanceInterceptTriggered: boolean;
  graphState: 'population' | 'subgraph';
  // Appendix state
  appendixOpen: boolean;
  appendixReturnScreen: ScreenId | null;
  // Navigation block — screens with local reveal steps set this to prevent premature navigation
  navigationBlocked: boolean;

  setScreen: (id: ScreenId) => void;
  nextScreen: () => void;
  prevScreen: () => void;
  toggleAnimationPaused: () => void;
  togglePresenterNotes: () => void;
  toggleStatsOverlay: () => void;
  injectMariaSignals: () => void;
  triggerGovernanceIntercept: () => void;
  setGraphState: (state: 'population' | 'subgraph') => void;
  openAppendix: () => void;
  closeAppendix: () => void;
  setNavigationBlocked: (blocked: boolean) => void;
  reset: () => void;
}

export const useDemoStore = create<DemoState>((set, get) => ({
  currentScreen: 'knowledge-graph',
  phaseArcActive: { foundation: false, orchestration: false, autonomous: false },
  showMiniProfile: false,
  animationPaused: false,
  showPresenterNotes: false,
  showStatsOverlay: false,
  mariaSignalsInjected: false,
  activeCitizenId: 'MARIA_SD_001',
  governanceInterceptTriggered: false,
  graphState: 'population',
  appendixOpen: false,
  appendixReturnScreen: null,
  navigationBlocked: false,

  setScreen: (id) => {
    const screenIndex = SCREEN_ORDER.indexOf(id);
    set({
      currentScreen: id,
      showMiniProfile: screenIndex >= 0,
      phaseArcActive: {
        foundation: screenIndex >= 0,
        orchestration: screenIndex >= 1,
        autonomous: screenIndex >= 2,
      },
    });
  },

  nextScreen: () => {
    const { currentScreen } = get();
    const idx = SCREEN_ORDER.indexOf(currentScreen);
    if (idx < SCREEN_ORDER.length - 1) {
      get().setScreen(SCREEN_ORDER[idx + 1]);
    }
  },

  prevScreen: () => {
    const { currentScreen } = get();
    const idx = SCREEN_ORDER.indexOf(currentScreen);
    if (idx > 0) {
      get().setScreen(SCREEN_ORDER[idx - 1]);
    }
  },

  toggleAnimationPaused: () => set((s) => ({ animationPaused: !s.animationPaused })),
  togglePresenterNotes: () => set((s) => ({ showPresenterNotes: !s.showPresenterNotes })),
  toggleStatsOverlay: () => set((s) => ({ showStatsOverlay: !s.showStatsOverlay })),
  injectMariaSignals: () => set({ mariaSignalsInjected: true }),
  setActiveCitizen: (id) => set({ activeCitizenId: id }),
  triggerGovernanceIntercept: () => set({ governanceInterceptTriggered: true }),
  setGraphState: (state) => set({ graphState: state }),
  setNavigationBlocked: (blocked) => set({ navigationBlocked: blocked }),

  openAppendix: () => {
    const { currentScreen } = get();
    set({ appendixOpen: true, appendixReturnScreen: currentScreen });
  },

  closeAppendix: () => {
    const { appendixReturnScreen } = get();
    set({ appendixOpen: false });
    if (appendixReturnScreen) {
      get().setScreen(appendixReturnScreen);
    }
  },

  reset: () =>
    set({
      currentScreen: 'knowledge-graph',
      phaseArcActive: { foundation: false, orchestration: false, autonomous: false },
      showMiniProfile: false,
      animationPaused: false,
      showPresenterNotes: false,
      showStatsOverlay: false,
      mariaSignalsInjected: false,
      governanceInterceptTriggered: false,
      graphState: 'population',
      appendixOpen: false,
      appendixReturnScreen: null,
      navigationBlocked: false,
    }),
}));
