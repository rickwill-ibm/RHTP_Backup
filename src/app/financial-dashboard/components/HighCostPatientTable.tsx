'use client';
import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { mockHighCostPatients } from '@/lib/mockData';
import RiskBadge from '@/components/ui/RiskBadge';
import StatusBadge from '@/components/ui/StatusBadge';
import Icon from '@/components/ui/AppIcon';
import { toast } from 'sonner';

type SortKey = 'name' | 'pmpm' | 'variance' | 'topDriver' | 'interventionStatus';
type SortDir = 'asc' | 'desc';

const COLS: { key: SortKey | 'riskTier'; label: string; sortable?: boolean; sortKey?: SortKey }[] =
  [
    { key: 'name', label: 'Patient', sortable: true, sortKey: 'name' },
    { key: 'riskTier', label: 'Risk' },
    { key: 'pmpm', label: 'PMPM', sortable: true, sortKey: 'pmpm' },
    { key: 'variance', label: 'Variance', sortable: true, sortKey: 'variance' },
    { key: 'topDriver', label: 'Top Driver', sortable: true, sortKey: 'topDriver' },
    {
      key: 'interventionStatus',
      label: 'Intervention',
      sortable: true,
      sortKey: 'interventionStatus',
    },
    { key: 'name', label: '' }, // actions column
  ];

export default function HighCostPatientTable() {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>('pmpm');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sorted = useMemo(() => {
    const data = [...(mockHighCostPatients ?? [])];
    const dir = sortDir === 'asc' ? 1 : -1;
    data.sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return dir * a.name.localeCompare(b.name);
        case 'pmpm':
          return dir * (a.pmpm - b.pmpm);
        case 'variance':
          return dir * (a.variance - b.variance);
        case 'topDriver':
          return dir * a.topDriver.localeCompare(b.topDriver);
        case 'interventionStatus':
          return dir * a.interventionStatus.localeCompare(b.interventionStatus);
        default:
          return 0;
      }
    });
    return data;
  }, [sortKey, sortDir]);

  const SortIcon = ({ sk }: { sk: SortKey }) => (
    <span className={`ml-1 text-2xs ${sortKey === sk ? 'opacity-100' : 'opacity-30'}`}>
      {sortKey === sk ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
    </span>
  );

  return (
    <div className="bg-white border border-carbon-gray-20">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-carbon-gray-20">
        <div>
          <h3 className="text-sm font-semibold text-carbon-gray-100">Top Cost Drivers</h3>
          <p className="text-xs text-carbon-gray-50 mt-0.5">
            Patients with highest PMPM vs contract target
          </p>
        </div>
        <button
          className="carbon-btn-secondary text-xs py-1.5"
          onClick={() => toast.info('Export started')}
        >
          <Icon name="ArrowDownTrayIcon" size={14} />
          Export
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-carbon-gray-10 border-b border-carbon-gray-20">
            <tr>
              {COLS.map((col, i) => (
                <th
                  key={`hch-${col.key}-${i}`}
                  className={`px-4 py-2.5 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide whitespace-nowrap
                    ${col.sortable ? 'cursor-pointer hover:text-carbon-gray-100 select-none' : ''}
                    ${col.sortKey && sortKey === col.sortKey ? 'text-carbon-blue bg-[#edf5ff]' : ''}`}
                  onClick={() => col.sortable && col.sortKey && handleSort(col.sortKey)}
                >
                  {col.label}
                  {col.sortable && col.sortKey && <SortIcon sk={col.sortKey} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-carbon-gray-20">
            {sorted?.map((p) => (
              <tr
                key={p?.id}
                className="hover:bg-[#edf5ff] group cursor-pointer"
                onClick={() => router?.push('/patient-detail')}
              >
                <td className="px-4 py-2.5">
                  <span className="font-medium text-carbon-gray-100 group-hover:text-carbon-blue">
                    {p?.name}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <RiskBadge tier={p?.riskTier} size="sm" />
                </td>
                <td className="px-4 py-2.5">
                  <span className="font-mono font-semibold text-[#da1e28]">
                    ${p?.pmpm?.toLocaleString()}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span className="font-mono text-[#da1e28]">
                    +${p?.variance?.toLocaleString()}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`text-2xs font-semibold px-2 py-0.5 ${
                      p?.topDriver === 'Inpatient'
                        ? 'bg-[#fff1f1] text-[#da1e28]'
                        : p?.topDriver === 'ER'
                          ? 'bg-[#fdf6dd] text-[#b45309]'
                          : p?.topDriver === 'Specialty'
                            ? 'bg-[#d0e2ff] text-[#0043ce]'
                            : p?.topDriver === 'Pharmacy'
                              ? 'bg-[#f6f2ff] text-[#6929c4]'
                              : 'bg-carbon-gray-10 text-carbon-gray-70'
                    }`}
                  >
                    {p?.topDriver}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <StatusBadge
                    label={p?.interventionStatus}
                    variant={
                      p?.interventionStatus === 'Active'
                        ? 'success'
                        : p?.interventionStatus === 'In Progress'
                          ? 'info'
                          : p?.interventionStatus === 'Pending'
                            ? 'warning'
                            : 'neutral'
                    }
                    size="sm"
                  />
                </td>
                <td className="px-4 py-2.5">
                  <div
                    className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      title="Assign task"
                      className="p-1 text-carbon-gray-50 hover:text-carbon-blue hover:bg-[#d0e2ff] transition-colors"
                      onClick={() => toast.success(`Task assigned to ${p?.name}`)}
                    >
                      <Icon name="ClipboardDocumentListIcon" size={13} />
                    </button>
                    <button
                      title="Flag for outreach"
                      className="p-1 text-carbon-gray-50 hover:text-[#da1e28] hover:bg-[#fff1f1] transition-colors"
                      onClick={() => toast.warning(`${p?.name} flagged for outreach`)}
                    >
                      <Icon name="FlagIcon" size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
