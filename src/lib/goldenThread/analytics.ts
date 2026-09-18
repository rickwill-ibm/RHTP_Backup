/**
 * analytics.ts — the analytic query engine behind the workbench conversation. Each query RUNS over the
 * record (live recon sub-ledger where real; a deterministic modelled series where the detection story
 * needs one) and returns a narrative answer + a chart spec + flagged outliers + follow-up questions.
 * Deterministic (hash-seeded, no RNG, no wall-clock) and honestly labelled real vs illustrative.
 *
 * CLIENT-SAFE: reconcile domain + spec types only; SimState is a type import.
 */
import { hashStr, reconInsights } from '@/lib/goldenThread/reconcile';
import type { SimState } from '@/lib/goldenThread/flowSim';
import type { ChartSpec } from '@/lib/goldenThread/chartSpec';

export interface AnalyticResult {
  queryId: string;
  answer: string; // the headline finding
  detail: string[]; // supporting points
  chart: ChartSpec;
  outliers?: string; // the flagged point(s)
  followups: string[]; // query ids
  honest: string; // real vs illustrative provenance
  action?: { label: string; kind: 'appeal' | 'recon' | 'route' };
}
interface Query {
  id: string;
  label: string;
  category: string;
  keywords: string[];
  run: (s: SimState) => AnalyticResult;
}

const rnd = (k: string): number => hashStr(k) / 4294967296;

// ── 1 · Program-integrity outlier hunt ───────────────────────────────────────────
const piImpossible: Query = {
  id: 'pi-impossible',
  label: 'Spot the temporally-impossible provider',
  category: 'Program integrity',
  keywords: ['impossible', 'hours', 'calendar', 'time', 'npi', 'fraud', 'outlier', 'scatter'],
  run: () => {
    const days = Array.from({ length: 12 }, (_, i) => i + 1);
    const pts = days.map((d) => {
      const impossible = d === 4;
      const y = impossible ? 31.5 : 6 + rnd(`hrs-${d}`) * 5; // 6–11h normal; one impossible day
      return {
        x: d,
        y: Number(y.toFixed(1)),
        highlight: impossible,
        label: `08/${String(d).padStart(2, '0')} · ${y.toFixed(1)} service-hrs`,
      };
    });
    return {
      queryId: 'pi-impossible',
      answer:
        'One rendering NPI billed 31.5 time-based service-hours on 08/04 — physically impossible (the same minute cannot be billed on two patients).',
      detail: [
        '17 flagged encounters span 08/03–08/07; the peak day exceeds a 24-hour day.',
        'No split/shared-visit (FS) or supervising-provider modifier on the overlaps — rules out legitimate team billing under one NPI.',
        'Rule out a benign NPI-attribution / timezone artifact first — then open SIU (CALENDAR-IMPOSSIBLE, near-zero false positives).',
      ],
      chart: {
        kind: 'scatter',
        title: 'Rendering-NPI service-hours per day (single NPI)',
        xLabel: 'Service day (August)',
        yLabel: 'Service-hours billed',
        points: pts,
        threshold: { y: 24, label: '24h/day — impossible' },
        xTickFmt: 'int',
        yTickFmt: 'int',
      },
      outliers: '08/04 · 31.5h — the impossible point',
      followups: ['pi-upcode', 'recon-scatter', 'clickdeny-overturn'],
      honest:
        'Illustrative modelled service-hour series (deterministic); the CALENDAR-IMPOSSIBLE detector logic is real.',
    };
  },
};
const piUpcode: Query = {
  id: 'pi-upcode',
  label: 'E&M upcoding vs peer',
  category: 'Program integrity',
  keywords: ['upcode', 'upcoding', 'e&m', 'em', 'level', '99215', 'coding', 'distribution', 'peer'],
  run: () => ({
    queryId: 'pi-upcode',
    answer:
      'This NPI bills the highest E&M level (99215) on 41% of visits vs a 12% peer benchmark — an upcoding-drift signal (UPCODE-DRIFT, A1 flag-only).',
    detail: [
      'The shift is concentrated in the top level; 99213 is under-represented vs peers.',
      'A statistical flag — never an autonomous downcode; it routes to a coder for review.',
    ],
    chart: {
      kind: 'bar',
      title: 'E&M level mix — this NPI vs peer benchmark',
      xLabel: 'E&M level',
      yLabel: 'share of visits',
      yTickFmt: 'pct',
      bars: [
        { label: '99213', value: 0.18, seriesIndex: 0 },
        { label: '99214', value: 0.41, seriesIndex: 0 },
        { label: '99215 (this NPI)', value: 0.41, highlight: true },
        { label: '99215 (peer)', value: 0.12, seriesIndex: 2 },
      ],
    },
    outliers: '99215 at 41% vs 12% peer',
    followups: ['pi-impossible', 'recon-carc'],
    honest: 'Illustrative modelled distribution; the UPCODE-DRIFT flag-only governance is real.',
  }),
};

// ── 2 · Reconciliation financials (REAL — live recon sub-ledger) ──────────────────
const reconScatter: Query = {
  id: 'recon-scatter',
  label: 'Allowed-vs-contract scatter (underpayment cluster)',
  category: 'Reconciliation',
  keywords: [
    'underpay',
    'underpayment',
    'contract',
    'allowed',
    'scatter',
    'cluster',
    'recover',
    'recoverable',
    'fee schedule',
  ],
  run: (s) => {
    const ups = s.reconLedger
      .filter((r) => r.reconClass === 'underpayment' || r.reconClass === 'contractual-writeoff')
      .slice(0, 60);
    const pts = ups.map((r) => {
      const ratio = r.contractedUsd > 0 ? r.paidUsd / r.contractedUsd : 1;
      const cluster = r.reconClass === 'underpayment' && ratio < 0.9;
      return {
        x: r.contractedUsd,
        y: Number(ratio.toFixed(3)),
        highlight: cluster,
        label: `${r.provider.split(' (')[0]} · paid ${Math.round(ratio * 100)}% of contract`,
      };
    });
    const ins = reconInsights(s.reconLedger.map((r) => r));
    return {
      queryId: 'recon-scatter',
      answer: `${pts.filter((p) => p.highlight).length} claims paid below the contracted rate — a tight cluster near 0.8× on one provider is the mis-loaded fee-schedule signal ($${Math.round(ins.totalRecoverableUsd - ins.totalRealizedUsd).toLocaleString()} recoverable).`,
      detail: [
        'Contractual write-offs sit on the 1.0 line (paid at contract — correct); the flagged cluster sits well below it (CO-45 over-adjustment).',
        'A uniform shortfall points at a fee-schedule version, not one claim — widen to every claim on the code since the effective date.',
      ],
      chart: {
        kind: 'scatter',
        title: 'Paid ÷ contracted, per claim (live recon sub-ledger)',
        xLabel: 'Contracted amount ($)',
        yLabel: 'paid ÷ contracted',
        points: pts,
        threshold: { y: 1, label: 'paid at contract' },
        xTickFmt: 'usd',
        yTickFmt: 'int',
      },
      outliers: `${pts.filter((p) => p.highlight).length} underpaid claims below 0.9×`,
      followups: ['recon-carc', 'pi-impossible', 'fairness-trend'],
      honest: 'REAL — computed live over the recon sub-ledger (classification + arithmetic).',
      action: { label: 'Draft the appeal on the largest underpayment', kind: 'appeal' },
    };
  },
};
const reconCarc: Query = {
  id: 'recon-carc',
  label: 'Top CARC drivers by exposure',
  category: 'Reconciliation',
  keywords: ['carc', 'driver', 'top', 'exposure', 'bar', 'adjustment', 'reason'],
  run: (s) => {
    const ins = reconInsights(s.reconLedger.map((r) => r));
    const bars = ins.topCarcDrivers.slice(0, 5).map((d, i) => ({
      label: d.carc.replace(' (over-adjustment)', '*'),
      value: d.amountUsd,
      seriesIndex: i,
      highlight: d.carc.includes('CO-45'),
    }));
    return {
      queryId: 'recon-carc',
      answer: `The exposure concentrates in ${ins.topCarcDrivers[0]?.carc ?? 'CARC'} ($${Math.round(ins.topCarcDrivers[0]?.amountUsd ?? 0).toLocaleString()}) across the book — ${ins.systematicPatterns.length} systematic pattern(s) detected.`,
      detail: [
        'CO-45* is the over-adjustment (billed-minus-allowed beyond contract) — the recoverable driver.',
        'Route the systematic cluster to payer Claims Config as a mis-loaded fee schedule (advisory; the reprocess is human).',
      ],
      chart: {
        kind: 'bar',
        title: 'Adjustment exposure by CARC (live)',
        xLabel: 'CARC',
        yLabel: 'exposure',
        yTickFmt: 'usd',
        bars,
      },
      outliers: ins.topCarcDrivers[0]?.carc,
      followups: ['recon-scatter', 'clickdeny-overturn'],
      honest: 'REAL — computed live over the recon sub-ledger.',
      action: { label: 'Open the Reconciliation board', kind: 'recon' },
    };
  },
};

// ── 3 · Fairness & compliance trend ──────────────────────────────────────────────
const fairnessTrend: Query = {
  id: 'fairness-trend',
  label: '§1557 four-fifths ratio over time',
  category: 'Fairness',
  keywords: ['fairness', '1557', 'four-fifths', 'disparate', 'ratio', 'bias', 'trend', 'cohort'],
  run: () => {
    const pts = Array.from({ length: 10 }, (_, i) => {
      const base = 0.85 - i * 0.005;
      const jag = (rnd(`fair-${i}`) - 0.5) * 0.08;
      const y = i === 6 ? 0.76 : Number(Math.max(0.7, Math.min(0.92, base + jag)).toFixed(2));
      return { x: i + 1, y };
    });
    return {
      queryId: 'fairness-trend',
      answer:
        'The §1557 four-fifths ratio for the behavioral-health cohort dipped to 0.76 at period 6 — below the 0.80 line, which auto-revoked earned authority (fail-closed).',
      detail: [
        'The safeguard is never hidden: it periodically breaches at any maturity as the book’s denial rate rises.',
        'A breach routes to the Medical Director + Compliance and floors autonomous authority — no rule change is auto-applied.',
      ],
      chart: {
        kind: 'line',
        title: '§1557 four-fifths ratio — BH cohort (by cohort screen)',
        xLabel: 'Cohort screen',
        yLabel: 'four-fifths ratio',
        yTickFmt: 'int',
        series: [{ name: 'BH cohort ratio', points: pts }],
        threshold: { y: 0.8, label: '0.80 four-fifths floor' },
      },
      outliers: 'period 6 · 0.76 (breach)',
      followups: ['clickdeny-overturn', 'recon-carc'],
      honest:
        'Illustrative modelled ratio series; the §1557 screen + fail-closed revocation are real engine logic.',
    };
  },
};

// ── 4 · Payer "click-deny" watch ─────────────────────────────────────────────────
const clickdenyOverturn: Query = {
  id: 'clickdeny-overturn',
  label: 'Overturn-on-appeal by denial reason',
  category: 'Click-deny',
  keywords: ['overturn', 'appeal', 'deny', 'denial', 'click-deny', 'reason', 'reversal', 'kff'],
  run: () => ({
    queryId: 'clickdeny-overturn',
    answer:
      '80.7% of “medical-necessity” denials are overturned on appeal — an abnormal reversal rate consistent with click-deny (AUTO-DENY-PATTERN).',
    detail: [
      'A high overturn rate means the denials were not supportable on the record — automation is denying, not adjudicating.',
      'Routes to the arbiter/attestation lane; it is a payer-facing integrity signal, not a member determination.',
    ],
    chart: {
      kind: 'bar',
      title: 'Overturn-on-appeal rate by denial reason',
      xLabel: 'Denial reason',
      yLabel: 'overturn rate',
      yTickFmt: 'pct',
      bars: [
        { label: 'Med-necessity', value: 0.807, highlight: true },
        { label: 'Records', value: 0.42, seriesIndex: 1 },
        { label: 'Auth absent', value: 0.28, seriesIndex: 2 },
        { label: 'Coding', value: 0.19, seriesIndex: 3 },
      ],
    },
    outliers: 'Medical-necessity · 80.7% overturned',
    followups: ['clickdeny-latency', 'fairness-trend'],
    honest: 'Illustrative modelled rates (KFF-informed); the AUTO-DENY-PATTERN routing is real.',
  }),
};
const clickdenyLatency: Query = {
  id: 'clickdeny-latency',
  label: 'Decision latency vs time-to-read',
  category: 'Click-deny',
  keywords: ['latency', 'speed', 'fast', 'read', 'time', 'denial-velocity', 'velocity'],
  run: () => {
    const pts = Array.from({ length: 30 }, (_, i) => {
      const readMin = 4 + rnd(`read-${i}`) * 6; // 4–10 min to read the attachment
      const fast = i % 5 === 0;
      const latency = fast ? rnd(`lat-${i}`) * 2 : readMin + 2 + rnd(`lat-${i}`) * 20;
      return {
        x: Number(readMin.toFixed(1)),
        y: Number(latency.toFixed(1)),
        highlight: fast,
        label: fast
          ? `denied in ${latency.toFixed(1)}m · read needs ${readMin.toFixed(1)}m`
          : `${latency.toFixed(1)}m`,
      };
    });
    return {
      queryId: 'clickdeny-latency',
      answer:
        'A band of denials issued in under 2 minutes — faster than the attachment could be read (est. 4–10 min). Decision-latency below read-time is a click-deny fingerprint (DENIAL-VELOCITY).',
      detail: [
        'Points below the read-time line were decided before the record could have been reviewed.',
        'A1/A2 attestation lane on the payer — the provider-counter direction of the surveillance library.',
      ],
      chart: {
        kind: 'scatter',
        title: 'Decision latency vs time-to-read (per denial)',
        xLabel: 'Est. time-to-read attachment (min)',
        yLabel: 'decision latency (min)',
        points: pts,
        threshold: { y: 4, label: 'min read time' },
        xTickFmt: 'int',
        yTickFmt: 'int',
      },
      outliers: '6 denials issued < 2 min',
      followups: ['clickdeny-overturn', 'recon-scatter'],
      honest: 'Illustrative modelled latencies; the DENIAL-VELOCITY governance is real.',
    };
  },
};

export const QUERIES: Query[] = [
  piImpossible,
  piUpcode,
  reconScatter,
  reconCarc,
  fairnessTrend,
  clickdenyOverturn,
  clickdenyLatency,
];
const BY_ID = new Map(QUERIES.map((q) => [q.id, q]));

export const queryLabel = (id: string): string => BY_ID.get(id)?.label ?? id;
export function runQuery(s: SimState, id: string): AnalyticResult | null {
  const q = BY_ID.get(id);
  return q ? q.run(s) : null;
}

/** Deterministic intent match: score by keyword hits, tie-break by catalogue order. Honest — pattern-matched. */
export function matchQuery(text: string): string {
  const t = text.toLowerCase();
  let best = QUERIES[0].id,
    bestScore = 0;
  for (const q of QUERIES) {
    const score =
      q.keywords.reduce((a, k) => a + (t.includes(k) ? 1 : 0), 0) +
      (t.includes(q.category.toLowerCase()) ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = q.id;
    }
  }
  return best;
}

/** Starter chips for a fresh conversation (fallback / mixed). */
export const STARTERS: string[] = [
  'pi-impossible',
  'recon-scatter',
  'fairness-trend',
  'clickdeny-overturn',
];

/**
 * Party-specific lead analyses — the SAME shared ledger, three lenses. Each seat opens on the
 * questions that seat actually owns, so payer ≠ provider ≠ neutral on the exploration screen.
 *   payer/MCO   → program-integrity (offensive) + click-deny self-audit ("are OUR denials defensible")
 *   provider    → revenue integrity (underpayment recovery, CARC drivers, denial overturn)
 *   neutral/State → oversight (fairness/§1557, click-deny velocity, TPL/recovery drivers)
 */
export function startersForSide(side: 'payer' | 'provider' | 'neutral'): string[] {
  if (side === 'payer')
    return ['pi-impossible', 'pi-upcode', 'clickdeny-overturn', 'clickdeny-latency'];
  if (side === 'provider') return ['recon-scatter', 'recon-carc', 'clickdeny-overturn'];
  return ['fairness-trend', 'clickdeny-overturn', 'clickdeny-latency', 'recon-carc']; // neutral / State oversight
}

/**
 * The book-wide analysis a ticket's RCA points at ("widen to every claim on this code"). Keeps the
 * recommended next step in-frame on the ticket screen instead of forcing the analyst to leave the case.
 */
export function widenQueryForAlgorithm(algorithm: string): string {
  switch (algorithm) {
    case 'CALENDAR-IMPOSSIBLE':
      return 'pi-impossible';
    case 'UPCODE-DRIFT':
      return 'pi-upcode';
    case 'UNDERPAY-CONTRACT':
      return 'recon-scatter';
    case 'AUTO-DENY-PATTERN':
      return 'clickdeny-overturn';
    case 'DENIAL-VELOCITY':
      return 'clickdeny-latency';
    case 'DENY-DISPARATE-IMPACT':
      return 'fairness-trend';
    case 'COB-TPL':
      return 'recon-carc';
    default:
      return 'recon-scatter';
  }
}
