'use client';
import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { mockCostByCategory } from '@/lib/mockData';

// Backend integration: replace mockCostByCategory with contract-scoped cost breakdown API

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((a: number, p: any) => a + (p.value || 0), 0);
  return (
    <div className="bg-white border border-carbon-gray-20 shadow-carbon p-3 text-xs">
      <p className="font-semibold text-carbon-gray-100 mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={`tt-${p.dataKey}`} className="flex justify-between gap-4 mb-1">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 inline-block" style={{ background: p.color }} />
            <span className="text-carbon-gray-50">{p.name}</span>
          </span>
          <span className="font-mono text-carbon-gray-100">${p.value?.toLocaleString()}</span>
        </div>
      ))}
      <div className="border-t border-carbon-gray-20 pt-1 mt-1 flex justify-between">
        <span className="text-carbon-gray-50">Total</span>
        <span className="font-mono font-semibold">${total.toLocaleString()}</span>
      </div>
    </div>
  );
};

const COLORS = {
  inpatient: '#da1e28',
  er: '#f1c21b',
  specialty: '#0f62fe',
  pharmacy: '#6929c4',
  postAcute: '#b45309',
};

export default function CostEnvelopeChart() {
  return (
    <div className="bg-white border border-carbon-gray-20 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-carbon-gray-100">Cost Envelope by Category</h3>
          <p className="text-xs text-carbon-gray-50 mt-0.5">
            Monthly spend breakdown — Oct 2025 to Mar 2026
          </p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={mockCostByCategory} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" vertical={false} />
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
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
          <Bar dataKey="inpatient" name="Inpatient" stackId="a" fill={COLORS.inpatient} />
          <Bar dataKey="er" name="ER" stackId="a" fill={COLORS.er} />
          <Bar dataKey="specialty" name="Specialty" stackId="a" fill={COLORS.specialty} />
          <Bar dataKey="pharmacy" name="Pharmacy" stackId="a" fill={COLORS.pharmacy} />
          <Bar dataKey="postAcute" name="Post-Acute" stackId="a" fill={COLORS.postAcute} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
