import React from 'react';
import type { RiskTier } from '@/lib/mockData';

interface RiskBadgeProps {
  tier: RiskTier;
  size?: 'sm' | 'md';
}

export default function RiskBadge({ tier, size = 'md' }: RiskBadgeProps) {
  const base = size === 'sm' ? 'text-2xs px-1.5 py-0.5' : 'text-xs px-2 py-1';
  const variants: Record<RiskTier, string> = {
    Critical: 'bg-[#fff1f1] text-[#da1e28] border border-[#ffb3b8]',
    High: 'bg-[#fff8e1] text-[#b45309] border border-[#f1c21b]',
    Moderate: 'bg-[#d0e2ff] text-[#0043ce] border border-[#97c1ff]',
    Low: 'bg-[#defbe6] text-[#0e6027] border border-[#a7f0ba]',
  };
  return (
    <span className={`inline-flex items-center font-semibold font-mono ${base} ${variants[tier]}`}>
      {tier}
    </span>
  );
}
