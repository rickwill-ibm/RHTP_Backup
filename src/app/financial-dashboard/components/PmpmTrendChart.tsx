'use client';
import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { mockPmpmTrend } from '@/lib/mockData';

// Backend integration: replace mockPmpmTrend with API call to contract PMPM time-series endpoint

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const actual = payload.find((p: any) => p.dataKey === 'actual');
  const target = payload.find((p: any) => p.dataKey === 'target');
  const variance = actual && target ? actual.value - target.value : 0;
  return (
    <div className="bg-white border border-carbon-gray-20 shadow-carbon p-3 text-xs">
      <p className="font-semibold text-carbon-gray-100 mb-2">{label}</p>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-carbon-gray-50">Actual PMPM</span>
          <span className="font-mono font-semibold text-carbon-gray-100">${actual?.value}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-carbon-gray-50">Target PMPM</span>
          <span className="font-mono text-carbon-gray-70">${target?.value}</span>
        </div>
        <div className="flex justify-between gap-4 border-t border-carbon-gray-20 pt-1 mt-1">
          <span className="text-carbon-gray-50">Variance</span>
          <span
            className={`font-mono font-semibold ${variance > 0 ? 'text-[#da1e28]' : 'text-[#24a148]'}`}
          >
            {variance > 0 ? '+' : ''}${variance.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default function PmpmTrendChart() {
  return (
    <div className="bg-white border border-carbon-gray-20 p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-carbon-gray-100">
            PMPM Trend — Apr 2025 to Mar 2026
          </h3>
          <p className="text-xs text-carbon-gray-50 mt-0.5">
            Actual per-member-per-month cost vs contract target
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-[#0f62fe] inline-block" />
            Actual
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-[#da1e28] inline-block border-dashed border-t border-[#da1e28]" />
            Target
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={mockPmpmTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="pmpmGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#0f62fe" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#0f62fe" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: '#525252' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#525252' }}
            axisLine={false}
            tickLine={false}
            domain={[780, 960]}
            tickFormatter={(v) => `$${v}`}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={890} stroke="#da1e28" strokeDasharray="4 4" strokeWidth={1.5} />
          <Area
            type="monotone"
            dataKey="actual"
            stroke="#0f62fe"
            strokeWidth={2}
            fill="url(#pmpmGrad)"
            dot={{ r: 3, fill: '#0f62fe', strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
