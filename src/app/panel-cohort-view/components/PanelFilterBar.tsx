'use client';
import React, { useState, useRef, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import type { PanelFilters } from '../page';

// ─── Filter option definitions ────────────────────────────────────────────────

const RISK_OPTIONS = ['All', 'Critical', 'High', 'Moderate', 'Low'] as const;
const GAP_OPTIONS = ['All Gaps', 'Has Open Gaps', 'No Gaps'] as const;
const HCC_OPTIONS = ['All HCC', 'Has Suspects', 'No Suspects'] as const;
const ALERT_OPTIONS = ['All Alerts', 'Has Alerts', 'No Alerts'] as const;
const ATTR_OPTIONS = ['All', 'Confirmed', 'Provisional', 'Disputed', 'Dropped'] as const;

// Risk chip colours (active state)
const RISK_COLORS: Record<string, string> = {
  Critical: 'bg-[#da1e28] text-white',
  High: 'bg-[#f1c21b] text-[#161616]',
  Moderate: 'bg-[#0f62fe] text-white',
  Low: 'bg-[#24a148] text-white',
  All: '',
};
const ATTR_COLORS: Record<string, string> = {
  Confirmed: 'bg-[#24a148] text-white',
  Disputed: 'bg-[#da1e28] text-white',
  Provisional: 'bg-[#f1c21b] text-[#161616]',
  Dropped: 'bg-carbon-gray-50 text-white',
  All: '',
};

// Default / "show all" sentinel for each dimension
const DEFAULT: Record<keyof Omit<PanelFilters, 'search' | 'sort' | 'sortDir'>, string> = {
  risk: 'All',
  gap: 'All Gaps',
  hcc: 'All HCC',
  alert: 'All Alerts',
  attribution: 'All',
};

// ─── Chip pill ────────────────────────────────────────────────────────────────

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-2xs font-medium bg-[#d0e2ff] text-[#0043ce] border border-[#97c1ff]">
      {label}
      <button
        onClick={onRemove}
        className="hover:text-[#002d9c]"
        aria-label={`Remove ${label} filter`}
      >
        <Icon name="XMarkIcon" size={10} />
      </button>
    </span>
  );
}

// ─── Single-select pill group used inside the flyout ─────────────────────────

function PillGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  colorMap,
}: {
  label: string;
  options: readonly T[];
  value: string;
  onChange: (v: T) => void;
  colorMap?: Record<string, string>;
}) {
  return (
    <div>
      <p className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide mb-1.5">
        {label}
      </p>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => {
          const isActive = value === opt;
          const activeClass =
            colorMap?.[opt] && isActive
              ? colorMap[opt]
              : isActive
                ? 'bg-carbon-gray-90 text-white'
                : 'bg-carbon-gray-10 text-carbon-gray-70 hover:bg-carbon-gray-20';
          return (
            <button
              key={opt}
              onClick={() => onChange(opt)}
              className={`px-2.5 py-1 text-2xs font-medium transition-colors ${activeClass}`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface PanelFilterBarProps {
  filters: PanelFilters;
  onFiltersChange: (f: PanelFilters) => void;
}

export default function PanelFilterBar({ filters, onFiltersChange }: PanelFilterBarProps) {
  const [open, setOpen] = useState(false);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const update = (partial: Partial<PanelFilters>) => onFiltersChange({ ...filters, ...partial });

  // Close flyout on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        flyoutRef.current &&
        !flyoutRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Active filter chips — only non-default values
  const activeChips: { key: keyof typeof DEFAULT; label: string }[] = [];
  if (filters.risk !== DEFAULT.risk) activeChips.push({ key: 'risk', label: filters.risk });
  if (filters.gap !== DEFAULT.gap) activeChips.push({ key: 'gap', label: filters.gap });
  if (filters.hcc !== DEFAULT.hcc) activeChips.push({ key: 'hcc', label: filters.hcc });
  if (filters.alert !== DEFAULT.alert) activeChips.push({ key: 'alert', label: filters.alert });
  if (filters.attribution !== DEFAULT.attribution)
    activeChips.push({ key: 'attribution', label: filters.attribution });

  const clearAll = () =>
    onFiltersChange({
      ...filters,
      risk: 'All',
      gap: 'All Gaps',
      hcc: 'All HCC',
      alert: 'All Alerts',
      attribution: 'All',
    });

  const removeChip = (key: keyof typeof DEFAULT) =>
    update({ [key]: DEFAULT[key] } as Partial<PanelFilters>);

  return (
    <div className="bg-white border border-carbon-gray-20 px-4 py-2.5 mb-4 relative">
      {/* ── Single toolbar row ── */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative min-w-[220px] max-w-xs">
          <Icon
            name="MagnifyingGlassIcon"
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-carbon-gray-50"
          />
          <input
            type="text"
            placeholder="Search patient name or MRN..."
            value={filters.search}
            onChange={(e) => update({ search: e.target.value })}
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-carbon-gray-10 border-0 border-b border-carbon-gray-30 focus:outline-none focus:border-carbon-blue"
          />
        </div>

        {/* Filters toggle button */}
        <div className="relative">
          <button
            ref={btnRef}
            onClick={() => setOpen((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border transition-colors ${
              open || activeChips.length > 0
                ? 'bg-[#d0e2ff] text-[#0043ce] border-[#97c1ff]'
                : 'bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10'
            }`}
          >
            <Icon name="FunnelIcon" size={13} />
            Filters
            {activeChips.length > 0 && (
              <span className="ml-0.5 px-1.5 py-0 text-2xs font-semibold bg-[#0043ce] text-white rounded-full">
                {activeChips.length}
              </span>
            )}
            <Icon name={open ? 'ChevronUpIcon' : 'ChevronDownIcon'} size={12} />
          </button>

          {/* ── Flyout panel ── */}
          {open && (
            <div
              ref={flyoutRef}
              className="absolute left-0 top-full mt-1 z-30 bg-white border border-carbon-gray-20 shadow-lg p-4 w-[480px]"
            >
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                {/* Left column */}
                <PillGroup
                  label="Risk Tier"
                  options={RISK_OPTIONS}
                  value={filters.risk}
                  onChange={(v) => update({ risk: v })}
                  colorMap={RISK_COLORS}
                />
                <PillGroup
                  label="Attribution"
                  options={ATTR_OPTIONS}
                  value={filters.attribution}
                  onChange={(v) => update({ attribution: v })}
                  colorMap={ATTR_COLORS}
                />
                {/* Right column */}
                <PillGroup
                  label="Care Gaps"
                  options={GAP_OPTIONS}
                  value={filters.gap}
                  onChange={(v) => update({ gap: v })}
                />
                <PillGroup
                  label="HCC Suspects"
                  options={HCC_OPTIONS}
                  value={filters.hcc}
                  onChange={(v) => update({ hcc: v })}
                />
                <PillGroup
                  label="Alerts"
                  options={ALERT_OPTIONS}
                  value={filters.alert}
                  onChange={(v) => update({ alert: v })}
                />
              </div>

              <div className="flex items-center justify-between mt-4 pt-3 border-t border-carbon-gray-20">
                <button
                  onClick={clearAll}
                  className="text-xs text-carbon-gray-50 hover:text-carbon-gray-100 transition-colors"
                >
                  Reset all filters
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="px-4 py-1.5 text-xs font-semibold bg-[#0043ce] text-white hover:bg-[#002d9c] transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Active filter chips */}
        {activeChips.map((chip) => (
          <Chip key={chip.key} label={chip.label} onRemove={() => removeChip(chip.key)} />
        ))}

        {/* Clear all — only when chips exist */}
        {activeChips.length > 1 && (
          <button
            onClick={clearAll}
            className="text-2xs text-carbon-gray-50 hover:text-carbon-gray-100 underline underline-offset-2 transition-colors"
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
