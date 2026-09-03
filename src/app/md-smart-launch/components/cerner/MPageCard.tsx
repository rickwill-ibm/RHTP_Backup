'use client';
/**
 * MPage workflow component chrome — collapsible card with the Cerner
 * slate-blue header bar, refresh timestamp, and optional count badge.
 */
import React, { useState } from 'react';

interface MPageCardProps {
  title: string;
  count?: number;
  fetchedAt?: string | null;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
  defaultCollapsed?: boolean;
}

export default function MPageCard({
  title,
  count,
  fetchedAt,
  loading,
  error,
  onRefresh,
  actions,
  children,
  defaultCollapsed = false,
}: MPageCardProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <section className="bg-white border border-[#b7c1ca] rounded-sm shadow-sm mb-2 overflow-hidden">
      <header className="bg-[#4b6a87] text-white flex items-center px-2 py-1 gap-2 select-none">
        <button
          className="text-[11px] w-4 text-white/90 hover:text-white"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '▸' : '▾'}
        </button>
        <h3 className="text-[12.5px] font-bold tracking-wide flex-1 truncate">
          {title}
          {count !== undefined && <span className="font-normal text-white/85"> ({count})</span>}
        </h3>
        {actions}
        {fetchedAt && (
          <span className="text-[10px] text-white/70 hidden sm:inline" title="Data fetched">
            {new Date(fetchedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        {onRefresh && (
          <button
            className="text-[12px] text-white/85 hover:text-white"
            onClick={onRefresh}
            title="Refresh from FHIR"
          >
            ⟳
          </button>
        )}
      </header>
      {!collapsed && (
        <div className="text-[12.5px] leading-5 text-[#1a1a1a]">
          {loading ? (
            <div className="px-3 py-2 text-[#5b6770] italic">Loading…</div>
          ) : error ? (
            <div className="px-3 py-2 text-[#c8102e]">FHIR error: {error}</div>
          ) : (
            children
          )}
        </div>
      )}
    </section>
  );
}
