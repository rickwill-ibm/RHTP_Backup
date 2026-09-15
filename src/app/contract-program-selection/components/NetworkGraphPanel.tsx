'use client';
import React from 'react';
import Icon from '@/components/ui/AppIcon';
import { useRouter } from 'next/navigation';

type ProgramType = 'All' | 'Clinical' | 'BH' | 'Social';

// ── Per-program node + legend sets ──────────────────────────────────────────

const NODES_BY_PROGRAM: Record<ProgramType, typeof CLINICAL_NODES> = {} as any;

const CLINICAL_NODES = [
  {
    id: 'state',
    label: 'SD DHSS',
    sub: 'State Medicaid Agency',
    x: 50,
    y: 10,
    color: '#0043ce',
    icon: '🏛️',
    size: 'lg',
    clickable: false,
    region: '',
    regionName: '',
  },
  {
    id: 'rhtp',
    label: 'RHTP Platform',
    sub: 'Regional Tech Center',
    x: 50,
    y: 38,
    color: '#6929c4',
    icon: '⚡',
    size: 'lg',
    clickable: false,
    region: '',
    regionName: '',
  },
  {
    id: 'fqhc1',
    label: 'Bennett Co. HC',
    sub: 'CAH · 8,420 pts',
    x: 10,
    y: 68,
    color: '#0043ce',
    icon: '🏥',
    size: 'sm',
    clickable: true,
    region: 'region-west-river',
    regionName: 'West River Region',
  },
  {
    id: 'fqhc2',
    label: 'Winner FQHC',
    sub: 'FQHC · 5,640 pts',
    x: 30,
    y: 72,
    color: '#0043ce',
    icon: '🏥',
    size: 'sm',
    clickable: true,
    region: 'region-central',
    regionName: 'Missouri River Corridor',
  },
  {
    id: 'hosp1',
    label: 'Winner Regional',
    sub: 'Rural Hospital',
    x: 50,
    y: 75,
    color: '#6929c4',
    icon: '🏨',
    size: 'sm',
    clickable: true,
    region: 'region-southeast',
    regionName: 'Southeast SD Region',
  },
  {
    id: 'hosp2',
    label: 'Avera Sacred Hrt',
    sub: 'Critical Access',
    x: 68,
    y: 72,
    color: '#6929c4',
    icon: '🏨',
    size: 'sm',
    clickable: true,
    region: 'region-northeast',
    regionName: 'Northeast SD Region',
  },
  {
    id: 'pcp1',
    label: 'Oglala Lakota PCP',
    sub: 'PCP · 3,100 pts',
    x: 85,
    y: 65,
    color: '#24a148',
    icon: '👨‍⚕️',
    size: 'sm',
    clickable: true,
    region: 'region-west-river',
    regionName: 'West River Region',
  },
  {
    id: 'spec1',
    label: 'Monument Cardio',
    sub: 'Specialist',
    x: 20,
    y: 90,
    color: '#b45309',
    icon: '❤️',
    size: 'sm',
    clickable: true,
    region: 'region-southeast',
    regionName: 'Southeast SD Region',
  },
  {
    id: 'spec2',
    label: 'Avera Specialists',
    sub: 'Specialist',
    x: 78,
    y: 88,
    color: '#b45309',
    icon: '🔬',
    size: 'sm',
    clickable: true,
    region: 'region-southeast',
    regionName: 'Southeast SD Region',
  },
];

const BH_NODES = [
  {
    id: 'state',
    label: 'SD DHSS',
    sub: 'BH Block Grant',
    x: 50,
    y: 10,
    color: '#9f1853',
    icon: '🏛️',
    size: 'lg',
    clickable: false,
    region: '',
    regionName: '',
  },
  {
    id: 'rhtp',
    label: 'RHTP Platform',
    sub: 'BH Coordination Hub',
    x: 50,
    y: 38,
    color: '#6929c4',
    icon: '⚡',
    size: 'lg',
    clickable: false,
    region: '',
    regionName: '',
  },
  {
    id: 'bh1',
    label: 'Avera BH Svcs',
    sub: 'CCBHC · 1,840 pts',
    x: 15,
    y: 68,
    color: '#9f1853',
    icon: '🧠',
    size: 'sm',
    clickable: true,
    region: 'region-northeast',
    regionName: 'Northeast SD Region',
  },
  {
    id: 'bh2',
    label: 'Rapid City BHC',
    sub: 'Crisis Center',
    x: 35,
    y: 72,
    color: '#9f1853',
    icon: '🆘',
    size: 'sm',
    clickable: true,
    region: 'region-west-river',
    regionName: 'West River Region',
  },
  {
    id: 'bh3',
    label: 'Rosebud BH Prog',
    sub: 'Tribal BH · 920 pts',
    x: 55,
    y: 75,
    color: '#6929c4',
    icon: '🌀',
    size: 'sm',
    clickable: true,
    region: 'region-west-river',
    regionName: 'West River Region',
  },
  {
    id: 'bh4',
    label: 'Sioux Falls CSU',
    sub: 'Community Stabilization',
    x: 75,
    y: 70,
    color: '#9f1853',
    icon: '🏠',
    size: 'sm',
    clickable: true,
    region: 'region-southeast',
    regionName: 'Southeast SD Region',
  },
  {
    id: 'bh5',
    label: 'SD Crisis Line',
    sub: '988 Network Partner',
    x: 45,
    y: 90,
    color: '#da1e28',
    icon: '📞',
    size: 'sm',
    clickable: false,
    region: '',
    regionName: '',
  },
];

const SOCIAL_NODES = [
  {
    id: 'state',
    label: 'SD DHSS',
    sub: 'Social Needs Nav',
    x: 50,
    y: 10,
    color: '#198038',
    icon: '🏛️',
    size: 'lg',
    clickable: false,
    region: '',
    regionName: '',
  },
  {
    id: 'rhtp',
    label: 'RHTP Platform',
    sub: 'CBO Coordination Hub',
    x: 50,
    y: 38,
    color: '#007d79',
    icon: '⚡',
    size: 'lg',
    clickable: false,
    region: '',
    regionName: '',
  },
  {
    id: 'cbo1',
    label: 'Tri-County Food Bk',
    sub: 'SNAP · 2,100 enrolled',
    x: 15,
    y: 65,
    color: '#b45309',
    icon: '🍎',
    size: 'sm',
    clickable: true,
    region: 'region-central',
    regionName: 'Missouri River Corridor',
  },
  {
    id: 'cbo2',
    label: 'SD Housing Auth',
    sub: 'Housing Nav · 840 pts',
    x: 35,
    y: 72,
    color: '#198038',
    icon: '🏠',
    size: 'sm',
    clickable: true,
    region: 'region-southeast',
    regionName: 'Southeast SD Region',
  },
  {
    id: 'cbo3',
    label: 'Lakota Outreach',
    sub: 'CHW Program · 1,240 pts',
    x: 55,
    y: 68,
    color: '#0043ce',
    icon: '🤝',
    size: 'sm',
    clickable: true,
    region: 'region-west-river',
    regionName: 'West River Region',
  },
  {
    id: 'cbo4',
    label: 'Rides to Wellness',
    sub: 'Transport Benefit',
    x: 75,
    y: 72,
    color: '#198038',
    icon: '🚌',
    size: 'sm',
    clickable: true,
    region: 'region-northeast',
    regionName: 'Northeast SD Region',
  },
  {
    id: 'cbo5',
    label: 'SD Legal Aid',
    sub: 'Benefits Navigation',
    x: 30,
    y: 90,
    color: '#6929c4',
    icon: '⚖️',
    size: 'sm',
    clickable: true,
    region: 'region-southeast',
    regionName: 'Southeast SD Region',
  },
  {
    id: 'cbo6',
    label: 'SD SNAP Office',
    sub: 'Food Assistance',
    x: 68,
    y: 90,
    color: '#b45309',
    icon: '📋',
    size: 'sm',
    clickable: false,
    region: '',
    regionName: '',
  },
];

const LEGEND_BY_PROGRAM: Record<ProgramType, { color: string; label: string }[]> = {
  All: [
    { color: '#0043ce', label: 'FQHCs' },
    { color: '#6929c4', label: 'Hospitals' },
    { color: '#24a148', label: 'PCPs' },
    { color: '#b45309', label: 'Specialists' },
  ],
  Clinical: [
    { color: '#0043ce', label: 'FQHCs' },
    { color: '#6929c4', label: 'Rural Hospitals' },
    { color: '#24a148', label: 'PCP Practices' },
    { color: '#b45309', label: 'Specialist Groups' },
  ],
  BH: [
    { color: '#9f1853', label: 'CCBHC / BH Centers' },
    { color: '#6929c4', label: 'Tribal BH' },
    { color: '#da1e28', label: 'Crisis / 988' },
  ],
  Social: [
    { color: '#b45309', label: 'Food Banks' },
    { color: '#198038', label: 'Housing / CHW' },
    { color: '#0043ce', label: 'Outreach' },
    { color: '#6929c4', label: 'Legal / Benefits' },
  ],
};

const CONNECTIONS_BY_PROGRAM: Record<ProgramType, { from: string; to: string; label?: string }[]> =
  {
    All: [
      { from: 'state', to: 'rhtp', label: 'Funds & Governs' },
      { from: 'rhtp', to: 'fqhc1' },
      { from: 'rhtp', to: 'fqhc2' },
      { from: 'rhtp', to: 'hosp1' },
      { from: 'rhtp', to: 'hosp2' },
      { from: 'rhtp', to: 'pcp1' },
      { from: 'rhtp', to: 'spec1' },
      { from: 'rhtp', to: 'spec2' },
    ],
    Clinical: [
      { from: 'state', to: 'rhtp', label: 'Funds & Governs' },
      { from: 'rhtp', to: 'fqhc1' },
      { from: 'rhtp', to: 'fqhc2' },
      { from: 'rhtp', to: 'hosp1' },
      { from: 'rhtp', to: 'hosp2' },
      { from: 'rhtp', to: 'pcp1' },
      { from: 'rhtp', to: 'spec1' },
      { from: 'rhtp', to: 'spec2' },
    ],
    BH: [
      { from: 'state', to: 'rhtp', label: 'BH Block Grant' },
      { from: 'rhtp', to: 'bh1' },
      { from: 'rhtp', to: 'bh2' },
      { from: 'rhtp', to: 'bh3' },
      { from: 'rhtp', to: 'bh4' },
      { from: 'rhtp', to: 'bh5' },
    ],
    Social: [
      { from: 'state', to: 'rhtp', label: 'Social Nav Funds' },
      { from: 'rhtp', to: 'cbo1' },
      { from: 'rhtp', to: 'cbo2' },
      { from: 'rhtp', to: 'cbo3' },
      { from: 'rhtp', to: 'cbo4' },
      { from: 'rhtp', to: 'cbo5' },
      { from: 'rhtp', to: 'cbo6' },
    ],
  };

// Wire the lookup tables after all const declarations
Object.assign(NODES_BY_PROGRAM, {
  All: CLINICAL_NODES,
  Clinical: CLINICAL_NODES,
  BH: BH_NODES,
  Social: SOCIAL_NODES,
});

export default function NetworkGraphPanel({ programType = 'All' }: { programType?: ProgramType }) {
  const router = useRouter();

  const NODES = NODES_BY_PROGRAM[programType] ?? CLINICAL_NODES;
  const CONNECTIONS = CONNECTIONS_BY_PROGRAM[programType] ?? CONNECTIONS_BY_PROGRAM.Clinical;
  const LEGEND = LEGEND_BY_PROGRAM[programType] ?? LEGEND_BY_PROGRAM.Clinical;

  const getNode = (id: string) => NODES.find((n) => n.id === id)!;

  const handleNodeClick = (node: (typeof NODES)[0]) => {
    if (!node.clickable) return;
    if (node.region && node.regionName) {
      router.push(
        `/provider-level?region=${node.region}&regionName=${encodeURIComponent(node.regionName)}`
      );
    }
  };

  return (
    <div className="bg-white border border-carbon-gray-20">
      <div className="px-5 py-3 border-b border-carbon-gray-20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="ShareIcon" size={15} className="text-[#6929c4]" />
          <h3 className="text-sm font-semibold text-carbon-gray-100">
            Integrated Rural Care Delivery Network
          </h3>
        </div>
        <div className="flex items-center gap-3">
          {LEGEND.map((l) => (
            <div key={l.label} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: l.color }} />
              <span className="text-2xs text-carbon-gray-50">{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="p-5">
        {/* Click hint */}
        <div className="mb-3 flex items-center gap-2 text-2xs text-carbon-gray-50">
          <Icon name="CursorArrowRaysIcon" size={13} className="text-[#0043ce]" />
          <span>Click any provider node to drill into that region&apos;s providers</span>
        </div>

        {/* SVG Network Graph */}
        <div
          className="relative bg-[#f8f9ff] border border-carbon-gray-20 overflow-hidden"
          style={{ height: '320px' }}
        >
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
            {/* Connection lines */}
            {CONNECTIONS.map((conn, i) => {
              const from = getNode(conn.from);
              const to = getNode(conn.to);
              return (
                <g key={`conn-${i}`}>
                  <line
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={conn.label ? '#0043ce' : '#c6c6c6'}
                    strokeWidth={conn.label ? '0.5' : '0.3'}
                    strokeDasharray={conn.label ? '0' : '1,0.5'}
                    opacity={0.7}
                  />
                  {conn.label && (
                    <text
                      x={(from.x + to.x) / 2 + 2}
                      y={(from.y + to.y) / 2}
                      fontSize="2"
                      fill="#0043ce"
                      textAnchor="middle"
                    >
                      {conn.label}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Nodes */}
            {NODES.map((node) => {
              const r = node.size === 'lg' ? 5 : 3.5;
              return (
                <g
                  key={node.id}
                  style={{ cursor: node.clickable ? 'pointer' : 'default' }}
                  onClick={() => handleNodeClick(node)}
                >
                  {/* Hover ring for clickable nodes */}
                  {node.clickable && (
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={r + 2}
                      fill="none"
                      stroke={node.color}
                      strokeWidth="0.4"
                      opacity={0.4}
                      strokeDasharray="1,0.5"
                    />
                  )}
                  <circle cx={node.x} cy={node.y} r={r + 1} fill={node.color} opacity={0.15} />
                  <circle cx={node.x} cy={node.y} r={r} fill={node.color} opacity={0.9} />
                  <text
                    x={node.x}
                    y={node.y + 0.5}
                    fontSize={node.size === 'lg' ? '3.5' : '2.5'}
                    fill="white"
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {node.icon}
                  </text>
                  <text
                    x={node.x}
                    y={node.y + r + 2.5}
                    fontSize="2"
                    fill="#161616"
                    textAnchor="middle"
                    fontWeight="600"
                  >
                    {node.label}
                  </text>
                  <text
                    x={node.x}
                    y={node.y + r + 4.5}
                    fontSize="1.6"
                    fill={node.clickable ? '#0043ce' : '#6f6f6f'}
                    textAnchor="middle"
                  >
                    {node.clickable ? '→ drill in' : node.sub}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Overlay label */}
          <div className="absolute top-3 left-3 bg-white/90 border border-carbon-gray-20 px-3 py-2">
            <p className="text-2xs font-semibold text-carbon-gray-100">14 SD Rural Counties</p>
            <p className="text-2xs text-carbon-gray-50">18 Participating Organizations</p>
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-4 grid grid-cols-4 gap-3">
          {[
            { label: 'FQHCs / CAHs', value: '4', color: '#0043ce' },
            { label: 'Rural Hospitals', value: '3', color: '#6929c4' },
            { label: 'PCP Practices', value: '6', color: '#24a148' },
            { label: 'Specialist Groups', value: '5', color: '#b45309' },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-carbon-gray-10 border border-carbon-gray-20 px-3 py-2.5 text-center"
            >
              <p className="text-xl font-bold font-mono" style={{ color: s.color }}>
                {s.value}
              </p>
              <p className="text-xs text-carbon-gray-70 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
