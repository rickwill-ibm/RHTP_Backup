'use client';
/**
 * BoardTabs — the ONE shared tab primitive for the Golden Thread. It renders the top-level board tabs
 * (level="top", the underline style) and the lighter in-board sub-tabs (level="sub", pill style), so
 * every navigation level reads as one system. Accessible: a real `role="tablist"` with roving
 * tabindex + Left/Right/Home/End arrow-key navigation (WCAG), an `aria-label` per row, and an optional
 * count badge per tab. Pure presentational — state lives in the caller.
 */
import { useRef } from 'react';

export interface BoardTab<K extends string> {
  key: K;
  label: string;
  badge?: number; // optional count pill (e.g. exceptions, appeals in flight)
}

/** Stable slug for the tab/panel id pair, derived from the tablist's aria-label (unique per row). */
const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

/** The id a tab button carries (also the panel's aria-labelledby target). */
export const boardTabId = (ariaLabel: string, key: string): string =>
  `bt-${slug(ariaLabel)}-tab-${key}`;
/** The id the controlled panel carries (also the tab's aria-controls target). */
export const boardPanelId = (ariaLabel: string, key: string): string =>
  `bt-${slug(ariaLabel)}-panel-${key}`;

/**
 * Props a caller spreads onto the wrapper of the ACTIVE panel so it completes the WAI-ARIA tabs
 * contract: a labelled, focusable `role="tabpanel"` that the selected tab `aria-controls`. `ariaLabel`
 * MUST match the BoardTabs `ariaLabel` for the tab↔panel linkage to resolve.
 */
export function tabPanelProps(
  ariaLabel: string,
  activeKey: string
): { role: 'tabpanel'; id: string; 'aria-labelledby': string; tabIndex: 0 } {
  return {
    role: 'tabpanel',
    id: boardPanelId(ariaLabel, activeKey),
    'aria-labelledby': boardTabId(ariaLabel, activeKey),
    tabIndex: 0,
  };
}

export function BoardTabs<K extends string>({
  tabs,
  active,
  onChange,
  ariaLabel,
  level = 'sub',
}: {
  tabs: ReadonlyArray<BoardTab<K>>;
  active: K;
  onChange: (k: K) => void;
  ariaLabel: string;
  level?: 'top' | 'sub';
}): React.ReactElement {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const idx = Math.max(
    0,
    tabs.findIndex((t) => t.key === active)
  );

  const onKey = (e: React.KeyboardEvent): void => {
    const last = tabs.length - 1;
    let next = -1;
    if (e.key === 'ArrowRight') next = idx >= last ? 0 : idx + 1;
    else if (e.key === 'ArrowLeft') next = idx <= 0 ? last : idx - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    if (next >= 0) {
      e.preventDefault();
      onChange(tabs[next].key);
      refs.current[next]?.focus();
    }
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKey}
      className={
        level === 'top'
          ? 'flex flex-wrap gap-1 border-b border-carbon-gray-20'
          : 'flex flex-wrap gap-1'
      }
    >
      {tabs.map((t, i) => {
        const on = t.key === active;
        const cls =
          level === 'top'
            ? `-mb-px border-b-2 px-3 py-2 text-xs font-semibold transition ${
                on
                  ? 'border-carbon-blue text-carbon-blue'
                  : 'border-transparent text-carbon-gray-60 hover:text-carbon-gray-90'
              }`
            : `rounded-full border px-3 py-0.5 text-[11px] font-medium transition ${
                on
                  ? 'border-carbon-blue bg-carbon-blue text-white'
                  : 'border-carbon-gray-30 bg-white text-carbon-gray-70 hover:bg-carbon-gray-10'
              }`;
        return (
          <button
            key={t.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={boardTabId(ariaLabel, t.key)}
            aria-selected={on}
            aria-controls={boardPanelId(ariaLabel, t.key)}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.key)}
            className={cls}
          >
            {t.label}
            {t.badge !== undefined && t.badge > 0 && (
              <span
                className={`mono ml-1 rounded-full px-1 text-[9px] ${
                  on ? 'bg-white/25 text-white' : 'bg-carbon-gray-10 text-carbon-gray-60'
                }`}
              >
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
