'use client';
import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from 'recharts';

const outcomeBySpecialty = [
  { specialty: 'Cardiology', seen: 11, noShow: 1, cancelled: 0, hospitalized: 1 },
  { specialty: 'Endocrinology', seen: 4, noShow: 0, cancelled: 1, hospitalized: 0 },
  { specialty: 'Nephrology', seen: 2, noShow: 0, cancelled: 0, hospitalized: 1 },
  { specialty: 'Ophthalmology', seen: 4, noShow: 0, cancelled: 0, hospitalized: 0 },
  { specialty: 'Pulmonology', seen: 3, noShow: 1, cancelled: 0, hospitalized: 0 },
  { specialty: 'Orthopedics', seen: 2, noShow: 1, cancelled: 0, hospitalized: 0 },
  { specialty: 'Gastroenterology', seen: 2, noShow: 0, cancelled: 1, hospitalized: 0 },
];

const outcomeDistribution = [
  { name: 'Seen', value: 28, fill: '#24a148' },
  { name: 'No-Show', value: 3, fill: '#da1e28' },
  { name: 'Cancelled', value: 2, fill: '#b45309' },
  { name: 'Hospitalized', value: 2, fill: '#6929c4' },
  { name: 'Pending', value: 11, fill: '#a8a8a8' },
];

const avgDaysBySpecialty = [
  { specialty: 'Cardiology', days: 6.8 },
  { specialty: 'Endocrinology', days: 8.2 },
  { specialty: 'Nephrology', days: 9.0 },
  { specialty: 'Ophthalmology', days: 7.0 },
  { specialty: 'Pulmonology', days: 13.0 },
  { specialty: 'Orthopedics', days: 7.0 },
  { specialty: 'Gastroenterology', days: 15.0 },
];

export default function OutcomeMetricsPanel() {
  return (
    <div className="bg-white border border-carbon-gray-20 flex flex-col">
      <div className="px-4 py-3 border-b border-carbon-gray-20 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-carbon-gray-100">Patient Outcome Metrics</h2>
        <span className="text-2xs text-carbon-gray-50 uppercase tracking-wide font-semibold">
          Last 90 days
        </span>
      </div>
      <div className="p-4 grid grid-cols-1 gap-4">
        {/* Outcome distribution donut */}
        <div>
          <p className="text-xs font-semibold text-carbon-gray-70 mb-2">Outcome Distribution</p>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={outcomeDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={65}
                  dataKey="value"
                  paddingAngle={2}
                >
                  {outcomeDistribution.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, name: string) => [`${value} referrals`, name]}
                  contentStyle={{ fontSize: 11, border: '1px solid #e0e0e0' }}
                />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        {/* Avg days to appointment by specialty */}
        <div>
          <p className="text-xs font-semibold text-carbon-gray-70 mb-2">
            Avg Days to Appointment by Specialty
          </p>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={avgDaysBySpecialty}
                layout="vertical"
                margin={{ left: 8, right: 24, top: 0, bottom: 0 }}
              >
                <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis
                  type="category"
                  dataKey="specialty"
                  tick={{ fontSize: 10 }}
                  width={90}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  formatter={(v: number) => [`${v}d`, 'Avg Days']}
                  contentStyle={{ fontSize: 11, border: '1px solid #e0e0e0' }}
                />
                <Bar dataKey="days" radius={[0, 2, 2, 0]}>
                  {avgDaysBySpecialty.map((entry) => (
                    <Cell
                      key={entry.specialty}
                      fill={entry.days > 14 ? '#da1e28' : entry.days > 10 ? '#f1c21b' : '#24a148'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 mt-1">
            <span className="flex items-center gap-1 text-2xs text-carbon-gray-50">
              <span className="w-2 h-2 bg-[#24a148] inline-block" /> ≤ 10d
            </span>
            <span className="flex items-center gap-1 text-2xs text-carbon-gray-50">
              <span className="w-2 h-2 bg-[#f1c21b] inline-block" /> 10–14d
            </span>
            <span className="flex items-center gap-1 text-2xs text-carbon-gray-50">
              <span className="w-2 h-2 bg-[#da1e28] inline-block" /> &gt; 14d
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
