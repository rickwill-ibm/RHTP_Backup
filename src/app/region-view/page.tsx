'use client';
import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { getFhirMockMode, getFhirClient } from '@/lib/services/fhirClient';

interface RegionData {
  id: string;
  name: string;
  counties: string[];
  providers: number;
  patients: number;
  gapClosure: number;
  qualityScore: number;
  gainShare: string;
  gainShareNum: number;
  stateTarget: number;
  regionalAvg: number;
  status: 'Above Target' | 'On Track' | 'At Risk';
  providerCount: number;
  fqhcs: number;
  hospitals: number;
  pcpGroups: number;
  // Whole-person metrics
  socialScreeningRate: number;
  socialScreeningTarget: number;
  bhAccessRate: number;
  bhAccessTarget: number;
  dualNeedCohort: number;
  cboPartners: number;
}

const REGIONS: RegionData[] = [
  {
    id: 'region-west-river',
    name: 'West River Region',
    counties: ['Bennett', 'Oglala Lakota', 'Jackson', 'Haakon'],
    providers: 28,
    patients: 14820,
    gapClosure: 73,
    qualityScore: 81,
    gainShare: '$312K',
    gainShareNum: 312000,
    stateTarget: 75,
    regionalAvg: 68,
    status: 'Above Target',
    providerCount: 28,
    fqhcs: 2,
    hospitals: 1,
    pcpGroups: 3,
    socialScreeningRate: 68,
    socialScreeningTarget: 70,
    bhAccessRate: 71,
    bhAccessTarget: 70,
    dualNeedCohort: 2840,
    cboPartners: 12,
  },
  {
    id: 'region-southeast',
    name: 'Southeast SD Region',
    counties: ['Tripp', 'Fall River', 'Todd', 'Mellette'],
    providers: 44,
    patients: 22010,
    gapClosure: 64,
    qualityScore: 72,
    gainShare: '$476K',
    gainShareNum: 476000,
    stateTarget: 75,
    regionalAvg: 68,
    status: 'On Track',
    providerCount: 44,
    fqhcs: 1,
    hospitals: 2,
    pcpGroups: 2,
    socialScreeningRate: 54,
    socialScreeningTarget: 70,
    bhAccessRate: 58,
    bhAccessTarget: 70,
    dualNeedCohort: 4180,
    cboPartners: 18,
  },
  {
    id: 'region-northeast',
    name: 'Northeast SD Region',
    counties: ['Charles Mix', 'Brule', 'Buffalo', 'Jerauld'],
    providers: 26,
    patients: 11340,
    gapClosure: 58,
    qualityScore: 64,
    gainShare: '$198K',
    gainShareNum: 198000,
    stateTarget: 75,
    regionalAvg: 68,
    status: 'At Risk',
    providerCount: 26,
    fqhcs: 1,
    hospitals: 1,
    pcpGroups: 2,
    socialScreeningRate: 41,
    socialScreeningTarget: 70,
    bhAccessRate: 49,
    bhAccessTarget: 70,
    dualNeedCohort: 3120,
    cboPartners: 9,
  },
  {
    id: 'region-central',
    name: 'Missouri River Corridor',
    counties: ['Gregory', 'Lyman', 'Jones', 'Ziebach'],
    providers: 31,
    patients: 16200,
    gapClosure: 70,
    qualityScore: 77,
    gainShare: '$284K',
    gainShareNum: 284000,
    stateTarget: 75,
    regionalAvg: 68,
    status: 'On Track',
    providerCount: 31,
    fqhcs: 2,
    hospitals: 1,
    pcpGroups: 3,
    socialScreeningRate: 62,
    socialScreeningTarget: 70,
    bhAccessRate: 66,
    bhAccessTarget: 70,
    dualNeedCohort: 3480,
    cboPartners: 14,
  },
];

const BENCHMARKS = {
  stateTarget: 75,
  regionalAvg: 68,
  nationalHedis: 71,
  socialScreeningTarget: 70,
  bhAccessTarget: 70,
};

function BenchmarkBar({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-2xs text-carbon-gray-50 w-24 text-right flex-shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-carbon-gray-20">
        <div
          className="h-full transition-all"
          style={{ width: `${value}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-mono font-semibold w-10 flex-shrink-0" style={{ color }}>
        {value}%
      </span>
    </div>
  );
}

function StatusBadgeLocal({ status }: { status: RegionData['status'] }) {
  const map = {
    'Above Target': 'bg-[#defbe6] text-[#0e6027] border-[#a7f0ba]',
    'On Track': 'bg-[#d0e2ff] text-[#0043ce] border-[#97c1ff]',
    'At Risk': 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]',
  };
  return (
    <span className={`text-2xs font-semibold px-2 py-0.5 border ${map[status]}`}>{status}</span>
  );
}

function MetricBar({
  value,
  target,
  color,
  label,
}: {
  value: number;
  target: number;
  color: string;
  label: string;
}) {
  const isAbove = value >= target;
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-2xs text-carbon-gray-50">{label}</span>
        <span
          className="text-2xs font-mono font-semibold"
          style={{ color: isAbove ? '#24a148' : '#b45309' }}
        >
          {value}%
        </span>
      </div>
      <div className="relative h-1.5 bg-carbon-gray-20">
        <div
          className="h-full transition-all"
          style={{ width: `${value}%`, backgroundColor: color }}
        />
        {/* Target marker */}
        <div
          className="absolute top-0 h-full w-0.5 bg-carbon-gray-70"
          style={{ left: `${target}%` }}
        />
      </div>
      <p className="text-2xs text-carbon-gray-40">Target: {target}%</p>
    </div>
  );
}

function RegionViewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedRegion, setSelectedRegion] = useState<string | null>(searchParams.get('selected'));
  const [fhirSource, setFhirSource] = useState(false);
  const [fhirRegionCount, setFhirRegionCount] = useState(0);
  const fhirLoadedRef = useRef(false);

  useEffect(() => {
    if (getFhirMockMode() || fhirLoadedRef.current) return;
    fhirLoadedRef.current = true;
    getFhirClient()
      .search('Organization', { _count: 20 })
      .then((bundle: any) => {
        const count = (bundle?.entry ?? [])
          .map((e: any) => e?.resource)
          .filter(Boolean)
          .filter(
            (r: any) =>
              r?.resourceType === 'Organization' &&
              r?.extension?.some(
                (x: any) => x.url?.includes('org-type') && x.valueString === 'region'
              )
          ).length;
        if (count > 0) {
          setFhirRegionCount(count);
          setFhirSource(true);
        }
      })
      .catch(() => {});
  }, []);

  const totalPatients = REGIONS.reduce((a, r) => a + r.patients, 0);
  const totalProviders = REGIONS.reduce((a, r) => a + r.providers, 0);
  const avgGapClosure = Math.round(REGIONS.reduce((a, r) => a + r.gapClosure, 0) / REGIONS.length);
  const avgSocialScreening = Math.round(
    REGIONS.reduce((a, r) => a + r.socialScreeningRate, 0) / REGIONS.length
  );
  const avgBhAccess = Math.round(REGIONS.reduce((a, r) => a + r.bhAccessRate, 0) / REGIONS.length);
  const totalGainShareNum = REGIONS.reduce((a, r) => a + r.gainShareNum, 0);
  const totalGainShare =
    totalGainShareNum >= 1_000_000
      ? `$${(totalGainShareNum / 1_000_000).toFixed(2)}M`
      : `$${(totalGainShareNum / 1_000).toFixed(0)}K`;

  return (
    <AppLayout
      pageTitle="RHTP Regions — South Dakota"
      breadcrumbs={[
        { label: 'RHTP Overview', href: '/contract-program-selection' },
        { label: 'Regions' },
      ]}
      contextBanner={
        <div className="bg-[#defbe6] border-b border-[#a7f0ba] px-6 py-2 flex items-center gap-6 flex-wrap">
          <span className="text-xs font-semibold text-[#0e6027]">State: South Dakota DHSS</span>
          <span className="text-xs text-[#0e6027]">Program Year: 2026</span>
          <span className="text-xs text-[#0e6027]">4 Rural Regions · 14 Counties</span>
          <span className="text-xs text-[#0e6027]">Clinical · BH · Social benchmarking</span>
          <span className="ml-auto text-xs text-carbon-gray-50">Data as of May 29, 2026</span>
        </div>
      }
    >
      {fhirSource && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-carbon-gray-20">
          <span className="text-xs font-semibold px-1.5 py-0.5 bg-[#defbe6] text-[#0e6027] border border-[#a7f0ba]">
            FHIR R4
          </span>
          <span className="text-xs text-[#0e6027]">
            {fhirRegionCount} Region Organizations verified in HAPI FHIR
          </span>
        </div>
      )}
      {/* State-level KPI strip — now includes social + BH */}
      <div className="bg-white border-b border-carbon-gray-20 grid grid-cols-3 lg:grid-cols-6 divide-x divide-carbon-gray-20">
        {[
          {
            label: 'Attributed Lives',
            value: totalPatients.toLocaleString(),
            color: 'text-[#0043ce]',
            icon: 'UserGroupIcon',
          },
          {
            label: 'Total Providers',
            value: totalProviders,
            color: 'text-carbon-gray-100',
            icon: 'BuildingOffice2Icon',
          },
          {
            label: 'Avg Gap Closure',
            value: `${avgGapClosure}%`,
            color:
              avgGapClosure >= 75
                ? 'text-[#24a148]'
                : avgGapClosure >= 65
                  ? 'text-[#b45309]'
                  : 'text-[#da1e28]',
            icon: 'CheckCircleIcon',
          },
          {
            label: 'Social Screening',
            value: `${avgSocialScreening}%`,
            color: avgSocialScreening >= 70 ? 'text-[#24a148]' : 'text-[#b45309]',
            icon: 'ClipboardDocumentCheckIcon',
          },
          {
            label: 'BH Access Rate',
            value: `${avgBhAccess}%`,
            color: avgBhAccess >= 70 ? 'text-[#24a148]' : 'text-[#b45309]',
            icon: 'HeartIcon',
          },
          {
            label: 'Total Gain Share',
            value: totalGainShare,
            color: 'text-[#24a148]',
            icon: 'CurrencyDollarIcon',
          },
        ].map((kpi) => (
          <div key={kpi.label} className="px-4 py-3 flex items-center gap-2.5">
            <Icon name={kpi.icon as any} size={18} className="text-carbon-gray-30 flex-shrink-0" />
            <div>
              <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">{kpi.label}</p>
              <p className={`text-xl font-bold font-mono mt-0.5 ${kpi.color}`}>{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* Benchmarking panel — three domains */}
        <div className="bg-white border border-carbon-gray-20">
          <div className="px-5 py-3 border-b border-carbon-gray-20 flex items-center gap-2">
            <Icon name="ChartBarIcon" size={15} className="text-[#0043ce]" />
            <h3 className="text-sm font-semibold text-carbon-gray-100">
              State Benchmarking — Whole-Person Performance
            </h3>
            <span className="ml-auto text-2xs text-carbon-gray-50">Clinical · Social · BH</span>
          </div>
          <div className="px-5 py-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Clinical */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-bold text-[#0043ce]">
                  🩺 Clinical — Gap Closure Rate
                </span>
              </div>
              <div className="space-y-2">
                {REGIONS.map((r) => (
                  <BenchmarkBar
                    key={r.id}
                    value={r.gapClosure}
                    label={r.name.split(' ')[0]}
                    color={
                      r.gapClosure >= BENCHMARKS.stateTarget
                        ? '#24a148'
                        : r.gapClosure >= BENCHMARKS.regionalAvg
                          ? '#0043ce'
                          : '#b45309'
                    }
                  />
                ))}
                <div className="border-t border-carbon-gray-20 pt-2 space-y-1.5">
                  <BenchmarkBar
                    value={BENCHMARKS.regionalAvg}
                    label="Regional Avg"
                    color="#6929c4"
                  />
                  <BenchmarkBar
                    value={BENCHMARKS.stateTarget}
                    label="State Target"
                    color="#0043ce"
                  />
                </div>
              </div>
            </div>

            {/* Social */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-bold text-[#198038]">🤝 Social — Screening Rate</span>
              </div>
              <div className="space-y-2">
                {REGIONS.map((r) => (
                  <BenchmarkBar
                    key={r.id}
                    value={r.socialScreeningRate}
                    label={r.name.split(' ')[0]}
                    color={
                      r.socialScreeningRate >= BENCHMARKS.socialScreeningTarget
                        ? '#24a148'
                        : r.socialScreeningRate >= 55
                          ? '#198038'
                          : '#b45309'
                    }
                  />
                ))}
                <div className="border-t border-carbon-gray-20 pt-2">
                  <BenchmarkBar
                    value={BENCHMARKS.socialScreeningTarget}
                    label="State Target"
                    color="#198038"
                  />
                </div>
              </div>
            </div>

            {/* BH */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-bold text-[#9f1853]">🧠 BH — Access Rate</span>
              </div>
              <div className="space-y-2">
                {REGIONS.map((r) => (
                  <BenchmarkBar
                    key={r.id}
                    value={r.bhAccessRate}
                    label={r.name.split(' ')[0]}
                    color={
                      r.bhAccessRate >= BENCHMARKS.bhAccessTarget
                        ? '#24a148'
                        : r.bhAccessRate >= 55
                          ? '#9f1853'
                          : '#da1e28'
                    }
                  />
                ))}
                <div className="border-t border-carbon-gray-20 pt-2">
                  <BenchmarkBar
                    value={BENCHMARKS.bhAccessTarget}
                    label="State Target"
                    color="#9f1853"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Region cards */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-carbon-gray-100">
              Regions — Click to drill into program networks
            </h3>
            <span className="text-2xs text-carbon-gray-50">{REGIONS.length} regions</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {REGIONS.map((region) => (
              <div
                key={region.id}
                className={`bg-white border-2 transition-all cursor-pointer hover:shadow-carbon-md ${
                  selectedRegion === region.id
                    ? 'border-[#0043ce]'
                    : 'border-carbon-gray-20 hover:border-[#97c1ff]'
                }`}
                onClick={() => {
                  setSelectedRegion(region.id);
                  router.push(
                    `/provider-level?region=${region.id}&regionName=${encodeURIComponent(region.name)}&from=region-view`
                  );
                }}
              >
                {/* Card header */}
                <div className="px-5 py-3 border-b border-carbon-gray-20 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-[#0043ce] flex items-center justify-center flex-shrink-0">
                      <Icon name="MapPinIcon" size={14} className="text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-carbon-gray-100">{region.name}</p>
                      <p className="text-2xs text-carbon-gray-50">
                        {region.counties.join(' · ')} Counties
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadgeLocal status={region.status} />
                    <Icon name="ChevronRightIcon" size={14} className="text-carbon-gray-30" />
                  </div>
                </div>

                {/* Clinical metrics */}
                <div className="px-5 py-3 grid grid-cols-4 gap-3 border-b border-carbon-gray-10">
                  <div>
                    <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">Patients</p>
                    <p className="text-base font-bold font-mono text-carbon-gray-100 mt-0.5">
                      {region.patients.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">
                      Gap Closure
                    </p>
                    <p
                      className={`text-base font-bold font-mono mt-0.5 ${region.gapClosure >= 75 ? 'text-[#24a148]' : region.gapClosure >= 65 ? 'text-[#b45309]' : 'text-[#da1e28]'}`}
                    >
                      {region.gapClosure}%
                    </p>
                  </div>
                  <div>
                    <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">
                      Quality Score
                    </p>
                    <p
                      className={`text-base font-bold font-mono mt-0.5 ${region.qualityScore >= 80 ? 'text-[#24a148]' : region.qualityScore >= 70 ? 'text-[#0043ce]' : 'text-[#b45309]'}`}
                    >
                      {region.qualityScore}
                    </p>
                  </div>
                  <div>
                    <p className="text-2xs text-carbon-gray-50 uppercase tracking-wide">
                      Providers
                    </p>
                    <p className="text-base font-bold font-mono text-carbon-gray-100 mt-0.5">
                      {region.providers}
                    </p>
                  </div>
                </div>

                {/* All three domain metrics */}
                <div className="px-5 py-3 space-y-2">
                  <MetricBar
                    value={region.gapClosure}
                    target={region.stateTarget}
                    color="#0043ce"
                    label="🩺 Clinical Gap Closure"
                  />
                  <MetricBar
                    value={region.socialScreeningRate}
                    target={region.socialScreeningTarget}
                    color="#198038"
                    label="🤝 Social Screening Rate"
                  />
                  <MetricBar
                    value={region.bhAccessRate}
                    target={region.bhAccessTarget}
                    color="#9f1853"
                    label="🧠 BH Access Rate"
                  />
                </div>

                {/* Footer */}
                <div className="px-5 py-2.5 bg-carbon-gray-10 border-t border-carbon-gray-20 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="text-2xs text-carbon-gray-50">
                      {region.fqhcs} FQHCs · {region.hospitals} Hospital
                      {region.hospitals !== 1 ? 's' : ''} · {region.pcpGroups} PCP Groups
                    </span>
                    <span className="text-2xs text-carbon-gray-50">
                      {region.cboPartners} CBO Partners · {region.dualNeedCohort.toLocaleString()}{' '}
                      dual-need
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Icon name="CurrencyDollarIcon" size={13} className="text-[#24a148]" />
                    <span className="text-xs font-semibold text-[#24a148]">
                      {region.gainShare} gain share
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

export default function RegionViewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen text-carbon-gray-50 text-sm">
          Loading regions…
        </div>
      }
    >
      <RegionViewContent />
    </Suspense>
  );
}
