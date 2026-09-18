'use client';
import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import ProviderSearchBar from './components/ProviderSearchBar';
import ProviderDirectoryTable from './components/ProviderDirectoryTable';
import ProviderActionBar from './components/ProviderActionBar';

export interface ProviderFilters {
  search: string;
  specialty: string;
  tier: string;
  sort: string;
  accepting: boolean;
  vbcOnly: boolean;
}

export default function ProviderSelectionPage() {
  const [filters, setFilters] = useState<ProviderFilters>({
    search: '',
    specialty: 'All Specialties',
    tier: 'All Tiers',
    sort: 'Quality Score',
    accepting: false,
    vbcOnly: false,
  });

  return (
    <AppLayout
      pageTitle="Provider Directory — Network Selection"
      breadcrumbs={[
        { label: 'Contracts', href: '/contract-program-selection' },
        { label: 'Medicaid RHTP Track 3', href: '/panel-cohort-view' },
        { label: 'Provider Selection' },
      ]}
      contextBanner={
        <div className="bg-[#d0e2ff] border-b border-[#97c1ff] px-6 py-2 flex items-center gap-6 flex-wrap">
          <span className="text-xs font-semibold text-[#0043ce]">Referring for: Maria Redhawk</span>
          <span className="text-xs text-[#0043ce]">Contract Network: Medicaid RHTP Track 3</span>
          <span className="text-xs text-[#0043ce]">
            Referral Specialty: Endocrinology / Family Medicine
          </span>
          <span className="text-xs text-[#0043ce]">
            Patient Location: Martin, SD 57551 (Bennett County)
          </span>
          <span className="text-xs font-semibold text-[#b45309]">
            ⚠ Frontier county — nearest specialist 47–198 miles
          </span>
        </div>
      }
    >
      <ProviderActionBar />
      <ProviderSearchBar filters={filters} onFiltersChange={setFilters} />
      <ProviderDirectoryTable filters={filters} />
    </AppLayout>
  );
}
