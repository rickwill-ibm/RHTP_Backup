'use client';
import React from 'react';
import { RadialBarChart, RadialBar, ResponsiveContainer } from 'recharts';
import { mockContracts } from '@/lib/mockData';

export default function RafRevenuePanel() {
  const contract = mockContracts.find((c) => c.id === 'contract-001')!;
  const captureRate = contract.rafCaptureRate;
  const radialData = [{ name: 'Captured', value: Math.round(captureRate * 100), fill: '#24a148' }];

  return (
    <div className="bg-white border border-carbon-gray-20 p-5 h-full flex flex-col">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-carbon-gray-100">RAF Revenue Impact</h3>
        <p className="text-xs text-carbon-gray-50 mt-0.5">HCC capture rate and revenue exposure</p>
      </div>

      <div className="flex items-center justify-center mb-4">
        <div className="relative">
          <ResponsiveContainer width={140} height={140}>
            <RadialBarChart
              cx="50%"
              cy="50%"
              innerRadius="60%"
              outerRadius="90%"
              data={radialData}
              startAngle={90}
              endAngle={-270}
            >
              <RadialBar dataKey="value" cornerRadius={0} background={{ fill: '#e0e0e0' }} />
            </RadialBarChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold tabular-nums font-mono text-carbon-gray-100">
              {Math.round(captureRate * 100)}%
            </span>
            <span className="text-2xs text-carbon-gray-50">Captured</span>
          </div>
        </div>
      </div>

      <div className="space-y-2 flex-1">
        {[
          {
            key: 'raf-confirmed',
            label: 'Confirmed HCCs',
            value: `$${((contract.hccRevenueAtRisk * captureRate) / 1000).toFixed(0)}K`,
            color: 'text-[#24a148]',
          },
          {
            key: 'raf-unconfirmed',
            label: 'Unconfirmed (at risk)',
            value: `$${(contract.hccRevenueAtRisk / 1000000).toFixed(2)}M`,
            color: 'text-[#da1e28]',
          },
          {
            key: 'raf-suspects',
            label: 'Open Suspects',
            value: contract.openHCCSuspects.toString(),
            color: 'text-[#b45309]',
          },
          {
            key: 'raf-deadline',
            label: 'Submission Deadline',
            value: 'Jun 30, 2026',
            color: 'text-[#da1e28]',
          },
        ].map((row) => (
          <div
            key={row.key}
            className="flex justify-between items-center py-1.5 border-b border-carbon-gray-20 last:border-0"
          >
            <span className="text-xs text-carbon-gray-50">{row.label}</span>
            <span className={`text-sm font-mono font-semibold tabular-nums ${row.color}`}>
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
