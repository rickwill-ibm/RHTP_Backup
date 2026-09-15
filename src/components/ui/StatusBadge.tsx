import React from 'react';

type StatusVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'purple';

interface StatusBadgeProps {
  label: string;
  variant: StatusVariant;
  size?: 'sm' | 'md';
}

const variants: Record<StatusVariant, string> = {
  success: 'bg-[#defbe6] text-[#0e6027] border border-[#a7f0ba]',
  warning: 'bg-[#fdf6dd] text-[#b45309] border border-[#f1c21b]',
  danger: 'bg-[#fff1f1] text-[#da1e28] border border-[#ffb3b8]',
  info: 'bg-[#d0e2ff] text-[#0043ce] border border-[#97c1ff]',
  neutral: 'bg-[#f4f4f4] text-[#525252] border border-[#e0e0e0]',
  purple: 'bg-[#f6f2ff] text-[#6929c4] border border-[#d4bbff]',
};

export default function StatusBadge({ label, variant, size = 'md' }: StatusBadgeProps) {
  const sz = size === 'sm' ? 'text-2xs px-1.5 py-0.5' : 'text-xs px-2 py-0.5';
  return (
    <span className={`inline-flex items-center font-medium ${sz} ${variants[variant]}`}>
      {label}
    </span>
  );
}
