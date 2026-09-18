'use client';
// Contract-level action bar driven by the central action registry
import React, { useState, useRef, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import { toast } from 'sonner';
import { useAppContext } from '@/lib/appContext';
import { mockContracts } from '@/lib/mockData';
import type { ActionDefinition } from '@/lib/actionRegistry';

interface ContractActionBarProps {
  selectedContracts: string[];
  onSelectedContractsChange: (ids: string[]) => void;
}

export default function ContractActionBar({
  selectedContracts,
  onSelectedContractsChange,
}: ContractActionBarProps) {
  const { getActions, user } = useAppContext();
  const actions = getActions('contract-selection');

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleContract = (id: string) => {
    onSelectedContractsChange(
      selectedContracts.includes(id)
        ? selectedContracts.filter((c) => c !== id)
        : [...selectedContracts, id]
    );
  };

  const handleConfirm = () => {
    if (selectedContracts.length === 0) {
      toast.error('Please select at least one contract.');
      return;
    }
    const names = mockContracts
      .filter((c) => selectedContracts.includes(c.id))
      .map((c) => c.name)
      .join(', ');
    toast.success(`Contract${selectedContracts.length > 1 ? 's' : ''} selected`, {
      description: names,
    });
    setDropdownOpen(false);
  };

  const handleAction = (action: ActionDefinition) => {
    if (action.id === 'act-select-contract') {
      setDropdownOpen((prev) => !prev);
      return;
    }
    toast.success(`Action: ${action.label}`, { description: action.description });
  };

  if (actions.length === 0) return null;

  const btnClass = (variant: ActionDefinition['variant']) => {
    const base = 'flex items-center gap-2 px-3 py-1.5 text-xs font-medium border transition-colors';
    switch (variant) {
      case 'primary':
        return `${base} bg-[#0f62fe] text-white border-[#0f62fe] hover:bg-[#0353e9]`;
      case 'secondary':
        return `${base} bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10`;
      default:
        return `${base} bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10`;
    }
  };

  return (
    <div className="mb-4">
      <div className="bg-white border border-carbon-gray-20 px-4 py-2.5 flex items-center gap-2 flex-wrap">
        <span className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide mr-2">
          Contract Actions
        </span>
        {actions.map((action) => (
          <div
            key={action.id}
            className="relative"
            ref={action.id === 'act-select-contract' ? dropdownRef : undefined}
          >
            <button
              className={btnClass(action.variant)}
              title={action.description}
              onClick={() => handleAction(action)}
            >
              <Icon name={action.icon as any} size={13} />
              {action.shortLabel ?? action.label}
              {action.id === 'act-select-contract' && selectedContracts.length > 0 && (
                <span className="bg-white text-[#0f62fe] text-2xs font-bold px-1.5 py-0.5 rounded-full border border-[#97c1ff] leading-none">
                  {selectedContracts.length}
                </span>
              )}
              {action.id === 'act-select-contract' && (
                <Icon name={dropdownOpen ? 'ChevronUpIcon' : 'ChevronDownIcon'} size={12} />
              )}
            </button>

            {action.id === 'act-select-contract' && dropdownOpen && (
              <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-carbon-gray-20 shadow-lg w-80">
                {/* Header */}
                <div className="px-3 py-2 border-b border-carbon-gray-20 flex items-center justify-between">
                  <span className="text-xs font-semibold text-carbon-gray-70">
                    Select Contracts
                  </span>
                  <span className="text-2xs text-carbon-gray-50">
                    {selectedContracts.length} selected
                  </span>
                </div>

                {/* Contract list */}
                <ul className="max-h-60 overflow-y-auto divide-y divide-carbon-gray-10">
                  {mockContracts.map((contract) => {
                    const isChecked = selectedContracts.includes(contract.id);
                    return (
                      <li key={contract.id}>
                        <label className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-carbon-gray-10 transition-colors">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleContract(contract.id)}
                            className="mt-0.5 accent-[#0f62fe] w-3.5 h-3.5 flex-shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-carbon-gray-70 truncate">
                              {contract.name}
                            </p>
                            <p className="text-2xs text-carbon-gray-50">
                              {contract.payer} · {contract.programType}
                            </p>
                            <p className="text-2xs text-carbon-gray-50">
                              {contract.contractPeriod} ·{' '}
                              {contract.attributedLives.toLocaleString()} lives
                            </p>
                          </div>
                          <span
                            className={`ml-auto flex-shrink-0 text-2xs font-semibold px-1.5 py-0.5 ${
                              contract.performanceStatus === 'On Track'
                                ? 'bg-[#defbe6] text-[#0e6027]'
                                : contract.performanceStatus === 'At Risk'
                                  ? 'bg-[#fff1f1] text-[#da1e28]'
                                  : 'bg-[#fff8e1] text-[#b28600]'
                            }`}
                          >
                            {contract.performanceStatus}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>

                {/* Footer actions */}
                <div className="px-3 py-2 border-t border-carbon-gray-20 flex items-center justify-between gap-2">
                  <button
                    className="text-2xs text-carbon-gray-50 hover:text-carbon-gray-70 underline"
                    onClick={() => onSelectedContractsChange([])}
                  >
                    Clear all
                  </button>
                  <div className="flex gap-2">
                    <button
                      className="px-3 py-1.5 text-xs font-medium border border-carbon-gray-20 bg-white text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors"
                      onClick={() => setDropdownOpen(false)}
                    >
                      Cancel
                    </button>
                    <button
                      className="px-3 py-1.5 text-xs font-medium bg-[#0f62fe] text-white border border-[#0f62fe] hover:bg-[#0353e9] transition-colors"
                      onClick={handleConfirm}
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {selectedContracts.length > 0 && (
          <div className="flex items-center gap-2 ml-2 pl-2 border-l border-carbon-gray-20">
            <span className="text-2xs text-[#0f62fe] font-semibold">
              {selectedContracts.length} contract{selectedContracts.length > 1 ? 's' : ''} selected
            </span>
            <button
              className="text-2xs text-carbon-gray-50 hover:text-carbon-gray-70 underline"
              onClick={() => onSelectedContractsChange([])}
            >
              Clear
            </button>
          </div>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-2xs text-carbon-gray-50">Role:</span>
          <span
            className={`text-2xs font-semibold px-1.5 py-0.5 ${user.role === 'physician' ? 'bg-[#f6f2ff] text-[#6929c4]' : 'bg-[#d0e2ff] text-[#0043ce]'}`}
          >
            {user.role === 'physician' ? 'Physician' : 'Care Manager'}
          </span>
        </div>
      </div>
    </div>
  );
}
