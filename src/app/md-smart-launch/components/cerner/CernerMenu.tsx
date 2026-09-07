'use client';
/**
 * Cerner PowerChart-style left "Menu" (table of contents).
 * Replaces the horizontal tab strip.
 */
import React from 'react';

export type MenuKey =
  | 'provider-view'
  | 'results'
  | 'orders'
  | 'medications'
  | 'documentation'
  | 'allergies'
  | 'problems'
  | 'histories'
  | 'immunizations'
  | 'vitals'
  | 'careplan'
  | 'careteam'
  | 'referrals'
  | 'quality'
  | 'cdi'
  | 'compliance'
  // CMS-0057-F provisions
  | 'coverage'
  | 'claims'
  | 'payer-exchange'
  | 'return';

export interface MenuItem {
  key: MenuKey;
  label: string;
  section?: string;
  badge?: number;
}

export const MENU_ITEMS: MenuItem[] = [
  { key: 'provider-view', label: 'Provider View' },
  { key: 'results', label: 'Results Review' },
  { key: 'orders', label: 'Orders' },
  { key: 'medications', label: 'Medication List' },
  { key: 'documentation', label: 'Documentation' },
  { key: 'allergies', label: 'Allergies' },
  { key: 'problems', label: 'Problems and Diagnoses' },
  { key: 'histories', label: 'Histories' },
  { key: 'immunizations', label: 'Immunizations' },
  { key: 'vitals', label: 'Vital Signs' },
  { key: 'careplan', label: 'Care Plan' },
  { key: 'careteam', label: 'Care Team' },
  { key: 'referrals', label: 'Referrals' },
  { key: 'quality', label: 'Quality & Care Gaps', section: 'Value-Based Care' },
  { key: 'cdi', label: 'CDI / HCC Opportunities', section: 'Value-Based Care' },
  { key: 'compliance', label: 'Compliance & Audit', section: 'Value-Based Care' },
  // CMS-0057-F provisions
  { key: 'coverage', label: 'Coverage & Benefits', section: 'CMS-0057-F' },
  { key: 'claims', label: 'Claims & EOBs', section: 'CMS-0057-F' },
  { key: 'payer-exchange', label: 'Payer Data Exchange', section: 'CMS-0057-F' },
  { key: 'return', label: 'Return to Cerner', section: 'Exit' },
];

interface CernerMenuProps {
  active: MenuKey;
  onSelect: (key: MenuKey) => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  badges?: Partial<Record<MenuKey, number>>;
}

export default function CernerMenu({
  active,
  onSelect,
  collapsed = false,
  onToggleCollapsed,
  badges = {},
}: CernerMenuProps) {
  let lastSection: string | undefined;
  return (
    <nav
      className={`bg-[#eef1f4] border-r border-[#b7c1ca] h-full overflow-y-auto shrink-0 transition-all ${
        collapsed ? 'w-8' : 'w-52'
      }`}
      aria-label="Chart menu"
    >
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-[#b7c1ca] bg-[#e3e8ec]">
        {!collapsed && (
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#5b6770]">
            Menu
          </span>
        )}
        <button
          className="text-[#5b6770] text-[12px] hover:text-[#1a1a1a]"
          onClick={onToggleCollapsed}
          title={collapsed ? 'Expand menu' : 'Collapse menu'}
        >
          {collapsed ? '»' : '«'}
        </button>
      </div>
      {!collapsed &&
        MENU_ITEMS.map((item) => {
          const sectionHeader =
            item.section && item.section !== lastSection ? (
              <div
                key={`sec-${item.section}`}
                className="px-3 pt-3 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-[#8a949c]"
              >
                {item.section}
              </div>
            ) : null;
          lastSection = item.section ?? lastSection;
          const isActive = active === item.key;
          const badge = badges[item.key];
          return (
            <React.Fragment key={item.key}>
              {sectionHeader}
              <button
                onClick={() => onSelect(item.key)}
                className={`w-full text-left px-3 py-[5px] text-[12.5px] leading-5 flex items-center justify-between border-l-[3px] ${
                  isActive
                    ? 'bg-white border-[#2d4a63] font-semibold text-[#1a1a1a]'
                    : 'border-transparent text-[#33404a] hover:bg-white/70'
                }`}
              >
                <span>{item.label}</span>
                {badge !== undefined && badge > 0 && (
                  <span className="ml-1 bg-[#c8102e] text-white rounded-full text-[10px] px-1.5 leading-4 font-bold">
                    {badge}
                  </span>
                )}
              </button>
            </React.Fragment>
          );
        })}
    </nav>
  );
}
