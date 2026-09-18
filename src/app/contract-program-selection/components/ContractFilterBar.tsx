'use client';
import React from 'react';
import Icon from '@/components/ui/AppIcon';
import type { ProgramType } from '@/lib/mockData';
import type { ContractFilters } from '../page';

const programTypes: (ProgramType | 'All')[] = [
  'All',
  'MSSP ACO',
  'ACO REACH',
  'Commercial VBC',
  'Medicaid MCO',
];
const performanceFilters = ['All', 'On Track', 'At Risk', 'Below Target'];

interface ContractFilterBarProps {
  filters: ContractFilters;
  onFiltersChange: (f: ContractFilters) => void;
}

export default function ContractFilterBar({ filters, onFiltersChange }: ContractFilterBarProps) {
  const update = (partial: Partial<ContractFilters>) => onFiltersChange({ ...filters, ...partial });

  return (
    <div className="flex flex-wrap items-center gap-3 mb-5">
      <div className="relative flex-1 min-w-[220px] max-w-xs">
        <Icon
          name="MagnifyingGlassIcon"
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-carbon-gray-50"
        />
        <input
          type="text"
          placeholder="Search contracts or payers..."
          value={filters.search}
          onChange={(e) => update({ search: e.target.value })}
          className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-carbon-gray-20 text-carbon-gray-100 placeholder:text-carbon-gray-50 focus:outline-none focus:border-carbon-blue"
        />
      </div>
      <div className="flex items-center gap-1">
        {programTypes.map((p) => (
          <button
            key={`prog-${p}`}
            onClick={() => update({ program: p })}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${filters.program === p ? 'bg-carbon-blue text-white' : 'bg-white border border-carbon-gray-20 text-carbon-gray-70 hover:bg-carbon-gray-10'}`}
          >
            {p}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1 ml-auto">
        {performanceFilters.map((f) => (
          <button
            key={`perf-${f}`}
            onClick={() => update({ performance: f })}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${filters.performance === f ? 'bg-carbon-gray-90 text-white' : 'bg-white border border-carbon-gray-20 text-carbon-gray-70 hover:bg-carbon-gray-10'}`}
          >
            {f}
          </button>
        ))}
      </div>
    </div>
  );
}
