'use client';
import React from 'react';
import Icon from '@/components/ui/AppIcon';
import type { ProviderFilters } from '../page';

const specialties = [
  'All Specialties',
  'Cardiology',
  'Endocrinology',
  'Nephrology',
  'Ophthalmology',
  'Pulmonology',
  'Gastroenterology',
  'Orthopedics',
  'Geriatrics',
];
const networkTiers = ['All Tiers', 'Preferred', 'In-Network', 'Out-of-Network'];
const sortOptions = ['Quality Score', 'Cost Percentile', 'Distance', 'Wait Time'];

interface ProviderSearchBarProps {
  filters: ProviderFilters;
  onFiltersChange: (f: ProviderFilters) => void;
}

export default function ProviderSearchBar({ filters, onFiltersChange }: ProviderSearchBarProps) {
  const update = (partial: Partial<ProviderFilters>) => onFiltersChange({ ...filters, ...partial });

  return (
    <div className="bg-white border border-carbon-gray-20 p-4 mb-4">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="relative flex-1 min-w-[240px]">
          <Icon
            name="MagnifyingGlassIcon"
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-carbon-gray-50"
          />
          <input
            type="text"
            placeholder="Search by provider name, NPI, or facility..."
            value={filters.search}
            onChange={(e) => update({ search: e.target.value })}
            className="w-full pl-9 pr-4 py-2 text-sm bg-carbon-gray-10 border-0 border-b border-carbon-gray-30 focus:outline-none focus:border-carbon-blue"
          />
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-xs text-carbon-gray-50">Sort:</span>
          {sortOptions.map((s) => (
            <button
              key={`sort-${s}`}
              onClick={() => update({ sort: s })}
              className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${filters.sort === s ? 'bg-carbon-gray-90 text-white' : 'bg-carbon-gray-10 text-carbon-gray-70 hover:bg-carbon-gray-20'}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1">
          <span className="text-2xs text-carbon-gray-50 mr-1">Specialty:</span>
          <select
            value={filters.specialty}
            onChange={(e) => update({ specialty: e.target.value })}
            className="text-xs bg-carbon-gray-10 border border-carbon-gray-20 px-2 py-1.5 text-carbon-gray-70 focus:outline-none focus:border-carbon-blue"
          >
            {specialties.map((s) => (
              <option key={`spec-${s}`} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-2xs text-carbon-gray-50 mr-1">Network:</span>
          {networkTiers.map((t) => (
            <button
              key={`tier-${t}`}
              onClick={() => update({ tier: t })}
              className={`px-2.5 py-1 text-2xs font-medium transition-colors ${
                filters.tier === t
                  ? t === 'Preferred'
                    ? 'bg-[#24a148] text-white'
                    : t === 'In-Network'
                      ? 'bg-[#0f62fe] text-white'
                      : t === 'Out-of-Network'
                        ? 'bg-[#da1e28] text-white'
                        : 'bg-carbon-gray-90 text-white'
                  : 'bg-carbon-gray-10 text-carbon-gray-70 hover:bg-carbon-gray-20'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 ml-auto">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.accepting}
              onChange={(e) => update({ accepting: e.target.checked })}
              className="accent-carbon-blue"
            />
            <span className="text-xs text-carbon-gray-70">Accepting new patients</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.vbcOnly}
              onChange={(e) => update({ vbcOnly: e.target.checked })}
              className="accent-carbon-blue"
            />
            <span className="text-xs text-carbon-gray-70">VBC-aligned only</span>
          </label>
        </div>
      </div>
    </div>
  );
}
