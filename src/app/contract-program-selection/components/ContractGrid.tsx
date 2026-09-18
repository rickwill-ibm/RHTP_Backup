'use client';
import React, { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { mockContracts } from '@/lib/mockData';
import type { Contract } from '@/lib/mockData';
import type { ContractFilters } from '../page';
import Icon from '@/components/ui/AppIcon';
import StatusBadge from '@/components/ui/StatusBadge';

function ProgramTypeBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    'MSSP ACO': 'bg-[#d0e2ff] text-[#0043ce] border border-[#97c1ff]',
    'ACO REACH': 'bg-[#f6f2ff] text-[#6929c4] border border-[#d4bbff]',
    'Commercial VBC': 'bg-[#defbe6] text-[#0e6027] border border-[#a7f0ba]',
    'Medicaid MCO': 'bg-[#fdf6dd] text-[#b45309] border border-[#f1c21b]',
  };
  return (
    <span
      className={`inline-flex items-center text-2xs font-semibold px-2 py-0.5 ${map[type] || 'bg-carbon-gray-10 text-carbon-gray-70'}`}
    >
      {type}
    </span>
  );
}

function PerformanceBar({
  actual,
  target,
  label,
}: {
  actual: number;
  target: number;
  label: string;
}) {
  const pct = Math.min((actual / target) * 100, 150);
  const overTarget = actual > target;
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-2xs text-carbon-gray-50">{label}</span>
        <span
          className={`text-2xs font-mono font-semibold ${overTarget ? 'text-[#da1e28]' : 'text-[#24a148]'}`}
        >
          ${actual.toFixed(2)} <span className="text-carbon-gray-50">/ ${target.toFixed(2)}</span>
        </span>
      </div>
      <div className="h-1.5 bg-carbon-gray-20 relative overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${overTarget ? 'bg-[#da1e28]' : 'bg-[#24a148]'}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
        <div className="absolute top-0 left-[66.7%] w-px h-full bg-carbon-gray-50" />
      </div>
    </div>
  );
}

interface ContractCardProps {
  contract: Contract;
  isSelected: boolean;
  onToggle: (id: string) => void;
}

function ContractCard({ contract, isSelected, onToggle }: ContractCardProps) {
  const router = useRouter();
  const [panelOpen, setPanelOpen] = useState(false);
  const [formattedDate, setFormattedDate] = React.useState<string>('');

  React.useEffect(() => {
    setFormattedDate(
      new Date(contract.lastUpdated).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    );
  }, [contract.lastUpdated]);

  const perfVariant =
    contract.performanceStatus === 'On Track'
      ? 'success'
      : contract.performanceStatus === 'At Risk'
        ? 'warning'
        : 'danger';
  const gapOk = contract.gapClosureRate >= contract.gapClosureTarget;
  const isExpiringSoon = contract.expiresInDays !== null && contract.expiresInDays <= 30;
  const pmpmOk = contract.pmpmActual <= contract.pmpmTarget;

  return (
    <div
      className={`flex flex-col transition-shadow duration-200 ${isSelected ? 'ring-2 ring-[#0f62fe] shadow-carbon-md' : 'shadow-carbon-sm hover:shadow-carbon-md'} ${isExpiringSoon ? 'border-l-4 border-l-[#f1c21b]' : ''}`}
    >
      {/* Card body */}
      <div
        className={`bg-white border border-carbon-gray-20 flex flex-col cursor-pointer group ${isExpiringSoon ? 'border-l-0' : ''}`}
        onClick={() => router.push('/panel-cohort-view')}
      >
        {/* Selected indicator bar */}
        {isSelected && (
          <div className="bg-[#0f62fe] px-4 py-1.5 flex items-center gap-2">
            <Icon name="CheckCircleIcon" size={13} className="text-white" />
            <span className="text-2xs font-semibold text-white">Contract Selected</span>
            <button
              className="ml-auto text-2xs text-blue-200 hover:text-white underline"
              onClick={(e) => {
                e.stopPropagation();
                onToggle(contract.id);
              }}
            >
              Deselect
            </button>
          </div>
        )}

        {/* Expiring warning */}
        {isExpiringSoon && (
          <div className="bg-[#fdf6dd] border-b border-[#f1c21b] px-4 py-2 flex items-center gap-2">
            <Icon name="ExclamationTriangleIcon" size={14} className="text-[#b45309]" />
            <span className="text-xs text-[#b45309] font-medium">
              Contract expires in {contract.expiresInDays} days — review performance now
            </span>
          </div>
        )}

        <div className="p-5 flex-1">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <ProgramTypeBadge type={contract.programType} />
                <StatusBadge label={contract.performanceStatus} variant={perfVariant} size="sm" />
              </div>
              <h3 className="text-sm font-semibold text-carbon-gray-100 group-hover:text-carbon-blue transition-colors leading-tight mt-1">
                {contract.name}
              </h3>
              <p className="text-xs text-carbon-gray-50 mt-0.5">
                {contract.payer} · {contract.contractPeriod}
              </p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {[1, 2, 3, 4, 5].map((s) => (
                <span
                  key={`star-${contract.id}-${s}`}
                  className={`text-xs ${s <= Math.floor(contract.starsRating) ? 'text-[#f1c21b]' : 'text-carbon-gray-20'}`}
                >
                  ★
                </span>
              ))}
              <span className="text-xs font-mono text-carbon-gray-70 ml-1">
                {contract.starsRating}
              </span>
            </div>
          </div>

          {/* Key metrics grid */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">Attributed</p>
              <p className="text-lg font-bold tabular-nums font-mono text-carbon-gray-100">
                {contract.attributedLives.toLocaleString()}
              </p>
              <p className="text-2xs text-carbon-gray-50">lives</p>
            </div>
            <div>
              <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">RAF Capture</p>
              <p
                className={`text-lg font-bold tabular-nums font-mono ${contract.rafCaptureRate >= 0.85 ? 'text-[#24a148]' : contract.rafCaptureRate >= 0.75 ? 'text-[#b45309]' : 'text-[#da1e28]'}`}
              >
                {(contract.rafCaptureRate * 100).toFixed(1)}%
              </p>
              <p className="text-2xs text-carbon-gray-50">confirmed</p>
            </div>
            <div>
              <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">Gap Closure</p>
              <p
                className={`text-lg font-bold tabular-nums font-mono ${gapOk ? 'text-[#24a148]' : 'text-[#da1e28]'}`}
              >
                {(contract.gapClosureRate * 100).toFixed(1)}%
              </p>
              <p className="text-2xs text-carbon-gray-50">
                target {(contract.gapClosureTarget * 100).toFixed(0)}%
              </p>
            </div>
          </div>

          {/* PMPM bar */}
          <PerformanceBar
            actual={contract.pmpmActual}
            target={contract.pmpmTarget}
            label="PMPM Actual vs Target"
          />

          {/* Alerts row */}
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-carbon-gray-20">
            <div className="flex items-center gap-3">
              {contract.activeAlerts > 0 && (
                <span className="flex items-center gap-1 text-xs text-[#da1e28]">
                  <Icon name="ExclamationCircleIcon" size={14} />
                  {contract.activeAlerts} alerts
                </span>
              )}
              <span className="flex items-center gap-1 text-xs text-[#b45309]">
                <Icon name="CurrencyDollarIcon" size={14} />$
                {(contract.hccRevenueAtRisk / 1000).toFixed(0)}K HCC at risk
              </span>
            </div>
            <button
              className="flex items-center gap-1 text-xs text-carbon-blue font-medium hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                setPanelOpen((v) => !v);
              }}
            >
              {panelOpen ? 'Close Panel' : 'Open Panel'}
              <Icon name={panelOpen ? 'ChevronUpIcon' : 'ChevronDownIcon'} size={14} />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-carbon-gray-10 px-5 py-2 flex justify-between items-center border-t border-carbon-gray-20">
          <span className="text-2xs text-carbon-gray-50">Updated {formattedDate}</span>
          <span className="text-2xs text-carbon-gray-50">
            {contract.openHCCSuspects} HCC suspects open
          </span>
        </div>
      </div>

      {/* Expandable panel beneath the card */}
      {panelOpen && (
        <div className="border border-t-0 border-carbon-gray-20 bg-[#f4f4f4]">
          {/* Panel header */}
          <div className="px-5 py-3 border-b border-carbon-gray-20 flex items-center justify-between">
            <span className="text-xs font-semibold text-carbon-gray-70">
              {contract.name} — Contract Details
            </span>
            <div className="flex items-center gap-2">
              <button
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border transition-colors ${
                  isSelected
                    ? 'bg-[#defbe6] text-[#0e6027] border-[#a7f0ba]'
                    : 'bg-[#0f62fe] text-white border-[#0f62fe] hover:bg-[#0353e9]'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(contract.id);
                }}
              >
                <Icon name={isSelected ? 'CheckCircleIcon' : 'PlusCircleIcon'} size={13} />
                {isSelected ? 'Selected' : 'Select Contract'}
              </button>
              <button
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-carbon-gray-20 bg-white text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  router.push('/panel-cohort-view');
                }}
              >
                Open Patient Panel
                <Icon name="ArrowRightIcon" size={13} />
              </button>
            </div>
          </div>

          {/* Panel content: two-column detail grid */}
          <div className="px-5 py-4 grid grid-cols-2 gap-x-8 gap-y-3">
            {/* Left column */}
            <div className="space-y-3">
              <div>
                <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide mb-0.5">Payer</p>
                <p className="text-xs font-medium text-carbon-gray-100">{contract.payer}</p>
              </div>
              <div>
                <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide mb-0.5">
                  Program Type
                </p>
                <ProgramTypeBadge type={contract.programType} />
              </div>
              <div>
                <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide mb-0.5">
                  Contract Period
                </p>
                <p className="text-xs font-medium text-carbon-gray-100">
                  {contract.contractPeriod}
                </p>
              </div>
              <div>
                <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide mb-0.5">
                  Attributed Lives
                </p>
                <p className="text-xs font-mono font-semibold text-carbon-gray-100">
                  {contract.attributedLives.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide mb-0.5">
                  Stars Rating
                </p>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <span
                      key={s}
                      className={`text-sm ${s <= Math.floor(contract.starsRating) ? 'text-[#f1c21b]' : 'text-carbon-gray-20'}`}
                    >
                      ★
                    </span>
                  ))}
                  <span className="text-xs font-mono text-carbon-gray-70 ml-1">
                    {contract.starsRating}
                  </span>
                </div>
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-3">
              <div>
                <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide mb-0.5">
                  Performance Status
                </p>
                <StatusBadge label={contract.performanceStatus} variant={perfVariant} size="sm" />
              </div>
              <div>
                <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide mb-0.5">
                  PMPM Actual / Target
                </p>
                <p
                  className={`text-xs font-mono font-semibold ${pmpmOk ? 'text-[#24a148]' : 'text-[#da1e28]'}`}
                >
                  ${contract.pmpmActual.toFixed(2)}{' '}
                  <span className="text-carbon-gray-50 font-normal">
                    / ${contract.pmpmTarget.toFixed(2)}
                  </span>
                </p>
              </div>
              <div>
                <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide mb-0.5">
                  RAF Capture Rate
                </p>
                <p
                  className={`text-xs font-mono font-semibold ${contract.rafCaptureRate >= 0.85 ? 'text-[#24a148]' : contract.rafCaptureRate >= 0.75 ? 'text-[#b45309]' : 'text-[#da1e28]'}`}
                >
                  {(contract.rafCaptureRate * 100).toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide mb-0.5">
                  Gap Closure Rate
                </p>
                <p
                  className={`text-xs font-mono font-semibold ${gapOk ? 'text-[#24a148]' : 'text-[#da1e28]'}`}
                >
                  {(contract.gapClosureRate * 100).toFixed(1)}%{' '}
                  <span className="text-carbon-gray-50 font-normal">
                    target {(contract.gapClosureTarget * 100).toFixed(0)}%
                  </span>
                </p>
              </div>
              <div>
                <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide mb-0.5">
                  HCC Revenue at Risk
                </p>
                <p className="text-xs font-mono font-semibold text-[#b45309]">
                  ${(contract.hccRevenueAtRisk / 1000).toFixed(0)}K
                </p>
              </div>
            </div>
          </div>

          {/* Active alerts summary */}
          {contract.activeAlerts > 0 && (
            <div className="mx-5 mb-4 px-3 py-2.5 bg-[#fff1f1] border border-[#ffb3b8] flex items-center gap-2">
              <Icon
                name="ExclamationCircleIcon"
                size={14}
                className="text-[#da1e28] flex-shrink-0"
              />
              <span className="text-xs text-[#da1e28] font-medium">
                {contract.activeAlerts} active alert{contract.activeAlerts > 1 ? 's' : ''} require
                attention
              </span>
            </div>
          )}

          {/* Expiry notice */}
          {isExpiringSoon && (
            <div className="mx-5 mb-4 px-3 py-2.5 bg-[#fdf6dd] border border-[#f1c21b] flex items-center gap-2">
              <Icon
                name="ExclamationTriangleIcon"
                size={14}
                className="text-[#b45309] flex-shrink-0"
              />
              <span className="text-xs text-[#b45309] font-medium">
                Contract expires in {contract.expiresInDays} days
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ContractGridProps {
  filters: ContractFilters;
  selectedContracts: string[];
  onToggleContract: (id: string) => void;
}

export default function ContractGrid({
  filters,
  selectedContracts,
  onToggleContract,
}: ContractGridProps) {
  const filtered = useMemo(() => {
    let result = [...mockContracts];

    // If contracts are selected via the dropdown, show only those
    if (selectedContracts.length > 0) {
      result = result.filter((c) => selectedContracts.includes(c.id));
      return result;
    }

    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (c) => c.name.toLowerCase().includes(q) || c.payer.toLowerCase().includes(q)
      );
    }

    if (filters.program !== 'All') {
      result = result.filter((c) => c.programType === filters.program);
    }

    if (filters.performance !== 'All') {
      result = result.filter((c) => c.performanceStatus === filters.performance);
    }

    return result;
  }, [filters, selectedContracts]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-carbon-gray-70">
          {selectedContracts.length > 0 ? (
            <>
              Showing{' '}
              <span className="font-semibold text-[#0f62fe]">{filtered.length} selected</span> of{' '}
              {mockContracts.length} contracts
              <span className="ml-2 text-carbon-gray-50 text-xs">(filtered by selection)</span>
            </>
          ) : (
            <>
              Showing <span className="font-semibold text-carbon-gray-100">{filtered.length}</span>
              {filtered.length !== mockContracts.length ? ` of ${mockContracts.length}` : ''}{' '}
              contracts
            </>
          )}
        </p>
        <button className="carbon-btn-secondary text-xs py-1.5">
          <Icon name="ArrowDownTrayIcon" size={14} />
          Export Portfolio Report
        </button>
      </div>
      {filtered.length === 0 ? (
        <div className="py-12 text-center text-carbon-gray-50 text-sm">
          No contracts match the current filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-3 gap-4">
          {filtered.map((contract) => (
            <ContractCard
              key={contract.id}
              contract={contract}
              isSelected={selectedContracts.includes(contract.id)}
              onToggle={onToggleContract}
            />
          ))}
        </div>
      )}
    </div>
  );
}
