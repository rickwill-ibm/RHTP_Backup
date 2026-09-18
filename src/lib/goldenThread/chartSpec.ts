/**
 * chartSpec.ts — the small typed chart contract shared by the analytics engine (which PRODUCES specs)
 * and the Chart component (which RENDERS them). Pure + client-safe.
 */
export type TickFmt = 'int' | 'pct' | 'usd' | 'day';
export interface ScatterPt {
  x: number;
  y: number;
  label?: string;
  highlight?: boolean;
  series?: number;
}
export interface LineSeries {
  name: string;
  points: Array<{ x: number; y: number }>;
}
export interface BarDatum {
  label: string;
  value: number;
  seriesIndex?: number;
  highlight?: boolean;
}

export type ChartSpec =
  | {
      kind: 'scatter';
      title: string;
      xLabel: string;
      yLabel: string;
      points: ScatterPt[];
      threshold?: { y: number; label: string };
      xTickFmt?: TickFmt;
      yTickFmt?: TickFmt;
    }
  | {
      kind: 'line';
      title: string;
      xLabel: string;
      yLabel: string;
      series: LineSeries[];
      threshold?: { y: number; label: string };
      yTickFmt?: TickFmt;
    }
  | {
      kind: 'bar';
      title: string;
      xLabel?: string;
      yLabel: string;
      bars: BarDatum[];
      yTickFmt?: TickFmt;
    };
