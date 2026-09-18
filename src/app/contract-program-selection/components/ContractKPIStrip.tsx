import React from 'react';
import { mockContracts } from '@/lib/mockData';

export default function ContractKPIStrip() {
  const totalLives = mockContracts?.reduce((a, c) => a + c?.attributedLives, 0);
  const totalAlerts = mockContracts?.reduce((a, c) => a + c?.activeAlerts, 0);
  const totalHCCRisk = mockContracts?.reduce((a, c) => a + c?.hccRevenueAtRisk, 0);
  const avgGap = mockContracts?.reduce((a, c) => a + c?.gapClosureRate, 0) / mockContracts?.length;
  const onTrack = mockContracts?.filter((c) => c?.performanceStatus === 'On Track')?.length;
  const atRisk = mockContracts?.filter((c) => c?.performanceStatus === 'At Risk')?.length;
  const below = mockContracts?.filter((c) => c?.performanceStatus === 'Below Target')?.length;

  const kpis = [
    {
      key: 'kpi-lives',
      label: 'Total Attributed Lives',
      value: totalLives?.toLocaleString(),
      sub: `${mockContracts?.length} active contracts`,
      color: 'text-carbon-gray-100',
    },
    {
      key: 'kpi-alerts',
      label: 'Active Utilization Alerts',
      value: totalAlerts?.toString(),
      sub: 'Across all contracts',
      color: 'text-[#da1e28]',
    },
    {
      key: 'kpi-hcc',
      label: 'HCC Revenue at Risk',
      value: `$${(totalHCCRisk / 1000000)?.toFixed(2)}M`,
      sub: 'Unconfirmed suspects',
      color: 'text-[#b45309]',
    },
    {
      key: 'kpi-gap',
      label: 'Avg Gap Closure Rate',
      value: `${(avgGap * 100)?.toFixed(1)}%`,
      sub: 'Portfolio average',
      color: avgGap >= 0.75 ? 'text-[#24a148]' : 'text-[#b45309]',
    },
    { key: 'kpi-status', label: 'Contract Performance', value: '', sub: '', color: '' },
  ];

  return (
    <div className="bg-white border border-carbon-gray-20 mb-6">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 divide-x divide-carbon-gray-20">
        {kpis?.map((k) =>
          k?.key === 'kpi-status' ? (
            <div key={k?.key} className="px-6 py-4">
              <p className="carbon-label">Contract Performance</p>
              <div className="flex items-center gap-3 mt-2">
                <div className="text-center">
                  <p className="text-2xl font-bold tabular-nums text-[#24a148]">{onTrack}</p>
                  <p className="text-2xs text-carbon-gray-50 mt-0.5">On Track</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold tabular-nums text-[#b45309]">{atRisk}</p>
                  <p className="text-2xs text-carbon-gray-50 mt-0.5">At Risk</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold tabular-nums text-[#da1e28]">{below}</p>
                  <p className="text-2xs text-carbon-gray-50 mt-0.5">Below Target</p>
                </div>
              </div>
            </div>
          ) : (
            <div key={k?.key} className="px-6 py-4">
              <p className="carbon-label">{k?.label}</p>
              <p className={`text-2xl font-bold tabular-nums mt-1 font-mono ${k?.color}`}>
                {k?.value}
              </p>
              <p className="text-xs text-carbon-gray-50 mt-0.5">{k?.sub}</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
