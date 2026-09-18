import React from 'react';
import { mockContracts } from '@/lib/mockData';
import Icon from '@/components/ui/AppIcon';

export default function FinancialKPIGrid() {
  const contract = mockContracts.find((c) => c.id === 'contract-001')!;
  const pmpmVar = contract.pmpmActual - contract.pmpmTarget;
  const pmpmVarPct = ((pmpmVar / contract.pmpmTarget) * 100).toFixed(1);

  const kpis = [
    {
      key: 'kpi-pmpm',
      label: 'PMPM Actual',
      value: `$${contract.pmpmActual.toFixed(2)}`,
      delta: `${pmpmVar < 0 ? '' : '+'}$${pmpmVar.toFixed(2)} vs target`,
      deltaColor: pmpmVar < 0 ? 'text-[#24a148]' : 'text-[#da1e28]',
      icon: 'CurrencyDollarIcon',
      bg: pmpmVar < 0 ? 'bg-[#defbe6] border-[#a7f0ba]' : 'bg-[#fff1f1] border-[#ffb3b8]',
    },
    {
      key: 'kpi-var',
      label: 'PMPM Variance',
      value: `${pmpmVarPct}%`,
      delta: pmpmVar < 0 ? 'Under target — favorable' : 'Over target — unfavorable',
      deltaColor: pmpmVar < 0 ? 'text-[#24a148]' : 'text-[#da1e28]',
      icon: 'ArrowTrendingDownIcon',
      bg: pmpmVar < 0 ? 'bg-[#defbe6] border-[#a7f0ba]' : 'bg-[#fff1f1] border-[#ffb3b8]',
    },
    {
      key: 'kpi-avoidable',
      label: 'Avoidable Util. Cost',
      value: '$284,100',
      delta: '38 active alerts',
      deltaColor: 'text-[#da1e28]',
      icon: 'ExclamationTriangleIcon',
      bg: 'bg-[#fff1f1] border-[#ffb3b8]',
    },
    {
      key: 'kpi-raf-risk',
      label: 'RAF Revenue at Risk',
      value: `$${(contract.hccRevenueAtRisk / 1000000).toFixed(2)}M`,
      delta: `${contract.openHCCSuspects} unconfirmed suspects`,
      deltaColor: 'text-[#b45309]',
      icon: 'CurrencyDollarIcon',
      bg: 'bg-[#fdf6dd] border-[#f1c21b]',
    },
    {
      key: 'kpi-savings',
      label: 'Projected Savings',
      value: '$142,800',
      delta: 'From active interventions',
      deltaColor: 'text-[#24a148]',
      icon: 'ArrowTrendingUpIcon',
      bg: 'bg-[#defbe6] border-[#a7f0ba]',
    },
    {
      key: 'kpi-recon',
      label: 'Payer Reconciliation',
      value: 'Q1 Pending',
      delta: 'Last settled: Dec 2025',
      deltaColor: 'text-[#b45309]',
      icon: 'DocumentCheckIcon',
      bg: 'bg-[#fdf6dd] border-[#f1c21b]',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 2xl:grid-cols-6 gap-3 mb-5">
      {kpis.map((k) => (
        <div key={k.key} className={`border p-4 ${k.bg}`}>
          <div className="flex items-center justify-between mb-2">
            <p className="carbon-label">{k.label}</p>
            <Icon name={k.icon as any} size={14} className="text-carbon-gray-50" />
          </div>
          <p className="text-xl font-bold tabular-nums font-mono text-carbon-gray-100">{k.value}</p>
          <p className={`text-2xs mt-1 ${k.deltaColor}`}>{k.delta}</p>
        </div>
      ))}
    </div>
  );
}
