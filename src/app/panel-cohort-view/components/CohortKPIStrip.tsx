import React from 'react';
import { mockPatients } from '@/lib/mockData';

export default function CohortKPIStrip({ physicianName }: { physicianName?: string }) {
  const contractPts = mockPatients?.filter((p) => p?.contractId === 'contract-001');
  // When drilled to a specific physician, scope KPIs to that physician's panel only
  const pts = physicianName
    ? contractPts?.filter((p) => p?.primaryCareProvider === physicianName)
    : contractPts;
  const criticalCount = pts?.filter((p) => p?.riskTier === 'Critical')?.length;
  const highCount = pts?.filter((p) => p?.riskTier === 'High')?.length;
  const totalHCCValue = pts?.reduce((a, p) => a + p?.hccSuspectValue, 0);
  const totalGaps = pts?.reduce((a, p) => a + p?.openCareGaps, 0);
  const avgRaf = (pts?.reduce((a, p) => a + p?.rafScore, 0) / pts?.length)?.toFixed(2);
  const highErRisk = pts?.filter((p) => p?.predictedErRisk >= 0.5)?.length;

  const items = [
    {
      key: 'kpi-critical',
      label: 'Critical Risk',
      value: criticalCount?.toString(),
      sub: `${highCount} High risk`,
      color: 'text-[#da1e28]',
      bg: 'bg-[#fff1f1]',
    },
    {
      key: 'kpi-hcc',
      label: 'HCC Suspect Value',
      value: `$${(totalHCCValue / 1000)?.toFixed(0)}K`,
      sub: `${pts?.filter((p) => p?.openHCCSuspects > 0)?.length} patients with suspects`,
      color: 'text-[#b45309]',
      bg: 'bg-[#fdf6dd]',
    },
    {
      key: 'kpi-gaps',
      label: 'Open Care Gaps',
      value: totalGaps?.toString(),
      sub: `${pts?.filter((p) => p?.openCareGaps > 0)?.length} patients with open gaps`,
      color: 'text-[#0043ce]',
      bg: 'bg-[#d0e2ff]',
    },
    {
      key: 'kpi-raf',
      label: 'Avg RAF Score',
      value: avgRaf,
      sub: 'Panel average',
      color: 'text-carbon-gray-100',
      bg: 'bg-white',
    },
    {
      key: 'kpi-er',
      label: 'High ER Risk',
      value: highErRisk?.toString(),
      sub: 'Predicted risk ≥ 50%',
      color: 'text-[#da1e28]',
      bg: 'bg-[#fff1f1]',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-5">
      {items?.map((item) => (
        <div key={item?.key} className={`${item?.bg} border border-carbon-gray-20 px-4 py-3`}>
          <p className="carbon-label">{item?.label}</p>
          <p className={`text-2xl font-bold tabular-nums font-mono mt-1 ${item?.color}`}>
            {item?.value}
          </p>
          <p className="text-2xs text-carbon-gray-50 mt-0.5">{item?.sub}</p>
        </div>
      ))}
    </div>
  );
}
