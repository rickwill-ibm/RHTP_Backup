'use client';
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { Patient } from '@/lib/mockData';
import type { PanelFilters } from '../page';
import RiskBadge from '@/components/ui/RiskBadge';
import StatusBadge from '@/components/ui/StatusBadge';
import Icon from '@/components/ui/AppIcon';
import { toast } from 'sonner';
import PatientRowActions from './PatientRowActions';
import { exportPanelCSV } from '@/lib/exportUtils';
import { useAppContext } from '@/lib/appContext';
import { useActiveCitizen } from '@/uhg/store/useActiveCitizen';
import { getAllPatients } from '@/lib/patientRegistry';
import type { RegistryPatient } from '@/lib/patientRegistry';
import { getFhirClient } from '@/lib/services/fhirClient';

// ─── Sub-components ───────────────────────────────────────────────────────────

function ErRiskBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 70 ? 'bg-[#da1e28]' : pct >= 40 ? 'bg-[#f1c21b]' : 'bg-[#24a148]';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-carbon-gray-20 flex-shrink-0">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span
        className={`text-xs font-mono tabular-nums ${pct >= 70 ? 'text-[#da1e28]' : pct >= 40 ? 'text-[#b45309]' : 'text-[#24a148]'}`}
      >
        {pct}%
      </span>
    </div>
  );
}

function AttributionBadge({ status }: { status: Patient['attributionStatus'] }) {
  const map: Record<
    Patient['attributionStatus'],
    { v: 'success' | 'info' | 'warning' | 'danger' | 'neutral'; label: string }
  > = {
    Confirmed: { v: 'success', label: 'Confirmed' },
    Provisional: { v: 'warning', label: 'Provisional' },
    Disputed: { v: 'danger', label: 'Disputed' },
    Dropped: { v: 'neutral', label: 'Dropped' },
  };
  const { v, label } = map[status] ?? { v: 'neutral' as const, label: status ?? '—' };
  return <StatusBadge label={label} variant={v} size="sm" />;
}

// ─── Three-column attribution ─────────────────────────────────────────────────

// Deterministic attribution data per patient
function getPatientAttribution(patient: Patient): {
  clinicalPcp: string;
  assignedChw: string;
  bhProvider: string;
} {
  const hash = patient.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const pcps = ['Dr. Whitfield', 'Dr. Okonkwo', 'Dr. Castillo', 'Dr. Torres', 'Dr. Chen'];
  const chws = ['M. Johnson CHW', 'R. Gutierrez CHW', 'T. Brown CHW', 'D. Washington CHW', '—'];
  const bhs = ['K. Morales LCSW', 'Dr. Diallo PsyD', 'Y. Pierce LMFT', '—', '—'];
  return {
    clinicalPcp: pcps[hash % pcps.length],
    assignedChw: chws[hash % chws.length],
    bhProvider: bhs[(hash + 2) % bhs.length],
  };
}

function AttributionTriple({ patient }: { patient: Patient }) {
  const attr = getPatientAttribution(patient);
  return (
    <div className="space-y-0.5 min-w-[160px]">
      <div className="flex items-center gap-1.5">
        <span className="text-2xs text-[#0043ce] font-semibold w-4 flex-shrink-0">🩺</span>
        <span
          className="text-2xs text-carbon-gray-70 truncate"
          title={`Clinical PCP: ${attr.clinicalPcp}`}
        >
          {attr.clinicalPcp}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-2xs text-[#198038] font-semibold w-4 flex-shrink-0">🤝</span>
        <span
          className={`text-2xs truncate ${attr.assignedChw === '—' ? 'text-carbon-gray-30' : 'text-carbon-gray-70'}`}
          title={`Assigned CHW: ${attr.assignedChw}`}
        >
          {attr.assignedChw}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-2xs text-[#9f1853] font-semibold w-4 flex-shrink-0">🧠</span>
        <span
          className={`text-2xs truncate ${attr.bhProvider === '—' ? 'text-carbon-gray-30' : 'text-carbon-gray-70'}`}
          title={`BH Provider: ${attr.bhProvider}`}
        >
          {attr.bhProvider}
        </span>
      </div>
    </div>
  );
}

// ─── Episode indicator ────────────────────────────────────────────────────────

const EPISODE_TYPES = ['Acute', 'Chronic', 'Specialist', 'Preventive'] as const;
type EpisodeType = (typeof EPISODE_TYPES)[number];

function getEpisodeForPatient(patient: Patient): { type: EpisodeType; active: boolean } | null {
  const hash = patient.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  if (hash % 5 === 0) return null;
  const types: EpisodeType[] = ['Acute', 'Chronic', 'Specialist', 'Preventive'];
  const type = types[hash % 4];
  const active = hash % 3 !== 0;
  return { type, active };
}

const EPISODE_COLORS: Record<EpisodeType, string> = {
  Acute: 'bg-[#fff1f1] text-[#da1e28] border-[#ffb3b8]',
  Chronic: 'bg-[#fdf6dd] text-[#b45309] border-[#f1c21b]',
  Specialist: 'bg-[#f6f2ff] text-[#6929c4] border-[#d4bbff]',
  Preventive: 'bg-[#defbe6] text-[#0e6027] border-[#a7f0ba]',
};

function EpisodeBadge({
  patient,
  onEpisodeClick,
}: {
  patient: Patient;
  onEpisodeClick?: (e: React.MouseEvent) => void;
}) {
  const episode = getEpisodeForPatient(patient);
  if (!episode) return <span className="text-2xs text-carbon-gray-30">—</span>;
  return (
    <div className="flex flex-col gap-0.5">
      <button
        className={`inline-flex items-center text-2xs font-semibold px-1.5 py-0.5 border hover:opacity-80 transition-opacity cursor-pointer ${EPISODE_COLORS[episode.type]}`}
        onClick={onEpisodeClick}
        title="View patient episodes"
      >
        {episode.type}
      </button>
      <span
        className={`text-2xs font-medium ${episode.active ? 'text-[#24a148]' : 'text-carbon-gray-50'}`}
      >
        {episode.active ? '● Active' : '○ Closed'}
      </span>
    </div>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const month = MONTHS[d.getUTCMonth()];
  const day = d.getUTCDate();
  const year = String(d.getUTCFullYear()).slice(-2);
  return `${month} ${day}, ${year}`;
}

// ─── Column definitions ───────────────────────────────────────────────────────

type SortableCol =
  | 'name'
  | 'riskTier'
  | 'rafScore'
  | 'predictedErRisk'
  | 'openHCCSuspects'
  | 'openCareGaps'
  | 'pmpmCost'
  | 'lastContactDate'
  | 'attributionStatus';

interface ColDef {
  key:
    | SortableCol
    | 'erRisk'
    | 'carePlanStatus'
    | 'primaryCareProvider'
    | 'actions'
    | 'episode'
    | 'attribution';
  label: string;
}

const columns: ColDef[] = [
  { key: 'name', label: 'Patient' },
  { key: 'riskTier', label: 'Risk Tier' },
  { key: 'rafScore', label: 'RAF Score' },
  { key: 'erRisk', label: 'ER Risk (30d)' },
  { key: 'openHCCSuspects', label: 'HCC Suspects' },
  { key: 'openCareGaps', label: 'Care Gaps' },
  { key: 'episode', label: 'Episode' },
  { key: 'pmpmCost', label: 'PMPM Cost' },
  { key: 'attributionStatus', label: 'Attribution' },
  { key: 'attribution', label: '🩺 PCP / 🤝 CHW / 🧠 BH' },
  { key: 'lastContactDate', label: 'Last Contact' },
  { key: 'carePlanStatus', label: 'Care Plan' },
  { key: 'actions', label: '' },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface PatientPanelTableProps {
  filters: PanelFilters;
  onFiltersChange: (f: PanelFilters) => void;
  selectedPatients: Set<string>;
  onSelectionChange: (s: Set<string>) => void;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PatientPanelTable({
  filters,
  onFiltersChange,
  selectedPatients,
  onSelectionChange,
  physicianName,
}: PatientPanelTableProps & { physicianName?: string }) {
  const router = useRouter();
  const { useMockData } = useAppContext();
  const { activeCitizenId, setActiveCitizen } = useActiveCitizen();
  const activeRowRef = useRef<HTMLTableRowElement | null>(null);
  const [page, setPage] = useState(1);
  const perPage = 10;

  // In Live FHIR mode, fetch the patient list from HAPI FHIR and overlay it
  // over the registry so RAF scores, gaps, and risk tiers reflect server state.
  const [fhirPatients, setFhirPatients] = useState<RegistryPatient[]>([]);
  useEffect(() => {
    if (useMockData) {
      setFhirPatients([]);
      return;
    }
    getFhirClient()
      .getAllRegistryPatients()
      .then((pts) => {
        if (pts.length > 0) setFhirPatients(pts);
      })
      .catch((err) => console.warn('[PatientPanelTable] FHIR patient list load failed:', err));
  }, [useMockData]);

  // In Live FHIR mode use the server list; otherwise fall back to registry.
  const sourcePatients: RegistryPatient[] =
    !useMockData && fhirPatients.length > 0 ? fhirPatients : getAllPatients();

  // Build a Patient-shaped list so existing filter/sort logic works unchanged.
  const registryAsMockPatients: Patient[] = sourcePatients.map((rp) => ({
    id: rp.platformId,
    name: rp.name,
    dob: rp.dob,
    mrn: rp.ehrMrn,
    age: rp.age,
    gender: rp.gender,
    contractId: 'contract-001',
    riskTier: rp.riskTier as Patient['riskTier'],
    rafScore: rp.rafScore,
    rafScoreDelta: 0,
    predictedErRisk: rp.erRiskPct / 100,
    openHCCSuspects: rp.hccSuspects,
    hccSuspectValue: rp.hccValue,
    openCareGaps: rp.openCareGaps,
    pmpmCost: rp.pmpm,
    pmpmTarget: rp.pmpmTarget,
    attributionStatus: (rp.attribution ?? 'Provisional') as Patient['attributionStatus'],
    lastContactDate: rp.lastContact || new Date().toISOString(),
    primaryCareProvider: rp.pcp,
    payer: rp.organization || 'Unknown',
    carePlanStatus: (rp.episodeStatus === 'Active'
      ? 'Active'
      : rp.episodeStatus === 'Closed'
        ? 'None'
        : 'Pending') as Patient['carePlanStatus'],
    phone: rp.phone ?? '',
    address: rp.location ?? '',
    insuranceId: '',
    enrollmentDate: '',
    activeAlerts: rp.cdsCards?.filter((c) => c.indicator === 'critical').length ?? 0,
  }));

  // Registry is the single source of truth (matches the top-bar patient switcher).
  // The legacy mock-data filler was removed: it injected demo patients absent from the
  // registry (e.g. a duplicate 'Maria Reyes' distinct from the golden-demo Maria Redhawk),
  // so the panel disagreed with every other screen about who the members are.
  const basePatients = registryAsMockPatients;

  const filteredPatients = useMemo(() => {
    let result = [...basePatients];

    // Scope to the attributed physician panel when drilled from a physician row
    if (physicianName) {
      result = result.filter((p) => p.primaryCareProvider === physicianName);
    }

    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (p) => p.name.toLowerCase().includes(q) || p.mrn.toLowerCase().includes(q)
      );
    }
    if (filters.risk !== 'All') result = result.filter((p) => p.riskTier === filters.risk);
    if (filters.gap === 'Has Open Gaps') result = result.filter((p) => p.openCareGaps > 0);
    else if (filters.gap === 'No Gaps') result = result.filter((p) => p.openCareGaps === 0);
    if (filters.hcc === 'Has Suspects') result = result.filter((p) => p.openHCCSuspects > 0);
    else if (filters.hcc === 'No Suspects') result = result.filter((p) => p.openHCCSuspects === 0);
    if (filters.alert === 'Has Alerts') result = result.filter((p) => p.predictedErRisk >= 0.4);
    else if (filters.alert === 'No Alerts') result = result.filter((p) => p.predictedErRisk < 0.4);
    if (filters.attribution !== 'All')
      result = result.filter((p) => p.attributionStatus === filters.attribution);

    const riskOrder: Record<string, number> = { Critical: 0, High: 1, Moderate: 2, Low: 3 };
    const attrOrder: Record<string, number> = {
      Confirmed: 0,
      Provisional: 1,
      Disputed: 2,
      Dropped: 3,
    };
    const dir = filters.sortDir === 'desc' ? -1 : 1;

    result.sort((a, b) => {
      switch (filters.sort) {
        case 'Risk Tier':
        case 'riskTier':
          return dir * ((riskOrder[a.riskTier] ?? 4) - (riskOrder[b.riskTier] ?? 4));
        case 'RAF Score':
        case 'rafScore':
          return dir * (a.rafScore - b.rafScore);
        case 'PMPM Cost':
        case 'pmpmCost':
          return dir * (a.pmpmCost - b.pmpmCost);
        case 'ER Risk':
        case 'predictedErRisk':
          return dir * (a.predictedErRisk - b.predictedErRisk);
        case 'Last Contact':
        case 'lastContactDate':
          return (
            dir * (new Date(a.lastContactDate).getTime() - new Date(b.lastContactDate).getTime())
          );
        case 'name':
          return dir * a.name.localeCompare(b.name);
        case 'openHCCSuspects':
          return dir * (a.openHCCSuspects - b.openHCCSuspects);
        case 'openCareGaps':
          return dir * (a.openCareGaps - b.openCareGaps);
        case 'attributionStatus':
          return (
            dir * ((attrOrder[a.attributionStatus] ?? 4) - (attrOrder[b.attributionStatus] ?? 4))
          );
        default:
          return 0;
      }
    });

    return result;
  }, [filters, basePatients]);

  React.useEffect(() => {
    setPage(1);
  }, [filters]);

  const toggleRow = useCallback(
    (id: string) => {
      const next = new Set(selectedPatients);
      next[next.has(id) ? 'delete' : 'add'](id);
      onSelectionChange(next);
    },
    [selectedPatients, onSelectionChange]
  );

  const toggleAll = useCallback(() => {
    if (selectedPatients.size === filteredPatients.length) onSelectionChange(new Set());
    else onSelectionChange(new Set(filteredPatients.map((p) => p.id)));
  }, [selectedPatients, filteredPatients, onSelectionChange]);

  const handleExportPanel = () => {
    exportPanelCSV(
      filteredPatients.map((p) => ({
        name: p.name,
        riskTier: p.riskTier,
        rafScore: p.rafScore,
        rafScoreDelta: p.rafScoreDelta,
        predictedErRisk: p.predictedErRisk,
        openHCCSuspects: p.openHCCSuspects,
        openCareGaps: p.openCareGaps,
        pmpmCost: p.pmpmCost,
        pmpmTarget: p.pmpmTarget,
        attributionStatus: p.attributionStatus,
        lastContactDate: p.lastContactDate,
        primaryCareProvider: p.primaryCareProvider,
        payer: p.payer,
      }))
    );
    toast.success('Panel exported', {
      description: `${filteredPatients.length} patients exported to CSV.`,
    });
  };

  // Follow the active/selected patient (Maria by default): jump to their page and scroll
  // their row into view. Additive only — no data change; keyed on activeCitizenId so manual
  // pagination still works freely once a different page is selected.
  useEffect(() => {
    if (!activeCitizenId) return;
    const idx = filteredPatients.findIndex((pt) => pt.id === activeCitizenId);
    if (idx >= 0) setPage(Math.floor(idx / perPage) + 1);
  }, [activeCitizenId, filteredPatients]);

  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeCitizenId, page]);

  const totalPages = Math.ceil(filteredPatients.length / perPage);
  const paged = filteredPatients.slice((page - 1) * perPage, page * perPage);

  // Follow the active/selected patient (Maria by default): jump to their page and scroll
  // their row into view. Additive only — no data change; keyed on activeCitizenId so manual
  // pagination is never fought.
  useEffect(() => {
    if (!activeCitizenId) return;
    const idx = filteredPatients.findIndex((pt) => pt.id === activeCitizenId);
    if (idx < 0) return;
    const targetPage = Math.floor(idx / perPage) + 1;
    setPage((prev) => (prev !== targetPage ? targetPage : prev));
  }, [activeCitizenId, filteredPatients]);

  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeCitizenId, page]);

  return (
    <div className="bg-white border border-carbon-gray-20 overflow-x-auto scrollbar-thin">
      {/* Attribution legend */}
      <div className="px-4 py-2 border-b border-carbon-gray-10 bg-carbon-gray-10 flex items-center gap-6 flex-wrap">
        <span className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-widest">
          Attribution:
        </span>
        <span className="text-2xs text-carbon-gray-70 flex items-center gap-1">
          <span>🩺</span> Clinical PCP — primary care attribution
        </span>
        <span className="text-2xs text-carbon-gray-70 flex items-center gap-1">
          <span>🤝</span> Assigned CHW — social program assignment
        </span>
        <span className="text-2xs text-carbon-gray-70 flex items-center gap-1">
          <span>🧠</span> BH Provider — behavioral health enrollment
        </span>
      </div>

      <div className="flex items-center justify-between px-4 py-3 border-b border-carbon-gray-20">
        <p className="text-sm font-medium text-carbon-gray-100">
          {filteredPatients.length} patient{filteredPatients.length !== 1 ? 's' : ''}
          {filteredPatients.length !== basePatients.length
            ? ` (filtered from ${basePatients.length})`
            : ' attributed'}
          {selectedPatients.size > 0 && (
            <span className="ml-2 text-xs text-[#0043ce] font-semibold">
              · {selectedPatients.size} selected
            </span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <button className="carbon-btn-secondary text-xs py-1.5" onClick={handleExportPanel}>
            <Icon name="ArrowDownTrayIcon" size={14} />
            Export Panel
          </button>
        </div>
      </div>

      {filteredPatients.length === 0 ? (
        <div className="px-5 py-12 text-center text-carbon-gray-50 text-sm">
          No patients match the current filters.
        </div>
      ) : (
        <table className="w-full text-sm min-w-[1500px]">
          <thead className="bg-carbon-gray-10 border-b border-carbon-gray-20">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={
                    selectedPatients.size === filteredPatients.length && filteredPatients.length > 0
                  }
                  onChange={toggleAll}
                  className="accent-carbon-blue"
                />
              </th>
              {columns.map((col) => (
                <th
                  key={`col-${col.key}`}
                  className="px-3 py-3 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide whitespace-nowrap"
                  style={col.key === 'attribution' ? { color: '#0043ce' } : {}}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-carbon-gray-20">
            {paged.map((patient) => (
              <tr
                key={patient.id}
                ref={patient.id === activeCitizenId ? activeRowRef : undefined}
                className={`group hover:bg-[#edf5ff] transition-colors cursor-pointer ${patient.id === activeCitizenId ? 'bg-[#d0e2ff] ring-2 ring-inset ring-[#0f62fe]' : selectedPatients.has(patient.id) ? 'bg-[#d0e2ff]/30' : ''}`}
                onClick={() => {
                  setActiveCitizen(patient.id);
                  router.push(`/patient-detail?id=${patient.id}`);
                }}
              >
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedPatients.has(patient.id)}
                    onChange={() => toggleRow(patient.id)}
                    className="accent-carbon-blue"
                  />
                </td>
                <td className="px-3 py-3">
                  <button
                    className="text-left hover:text-carbon-blue transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveCitizen(patient.id);
                      router.push(`/patient-detail?id=${patient.id}`);
                    }}
                  >
                    <p className="font-medium text-carbon-gray-100 group-hover:text-carbon-blue whitespace-nowrap">
                      {patient.name}
                    </p>
                    <p className="text-2xs text-carbon-gray-50 font-mono">
                      {patient.mrn} · {patient.age}y {patient.gender}
                    </p>
                  </button>
                </td>
                <td className="px-3 py-3">
                  <RiskBadge tier={patient.riskTier} size="sm" />
                </td>
                <td className="px-3 py-3">
                  <span className="font-mono text-sm tabular-nums text-carbon-gray-100">
                    {patient.rafScore.toFixed(2)}
                  </span>
                  <span
                    className={`ml-1 text-2xs font-mono ${patient.rafScoreDelta >= 0 ? 'text-[#24a148]' : 'text-[#da1e28]'}`}
                  >
                    {patient.rafScoreDelta >= 0 ? '+' : ''}
                    {patient.rafScoreDelta.toFixed(2)}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <ErRiskBar score={patient.predictedErRisk} />
                </td>
                <td className="px-3 py-3">
                  {patient.openHCCSuspects > 0 ? (
                    <div>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#fdf6dd] text-[#b45309] border border-[#f1c21b] text-xs font-semibold">
                        {patient.openHCCSuspects} suspect{patient.openHCCSuspects > 1 ? 's' : ''}
                      </span>
                      <p className="text-2xs text-carbon-gray-50 mt-0.5 font-mono">
                        ${(patient.hccSuspectValue / 1000).toFixed(1)}K value
                      </p>
                    </div>
                  ) : (
                    <span className="text-2xs text-carbon-gray-30">—</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  {patient.openCareGaps > 0 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#d0e2ff] text-[#0043ce] border border-[#97c1ff] text-xs font-semibold">
                      {patient.openCareGaps} open
                    </span>
                  ) : (
                    <span className="text-2xs text-[#24a148] font-medium">All closed</span>
                  )}
                </td>
                <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                  <EpisodeBadge
                    patient={patient}
                    onEpisodeClick={(e) => {
                      e.stopPropagation();
                      router.push(
                        `/patient-episode-summary?patientId=${patient.id}&patientName=${encodeURIComponent(patient.name)}&mrn=${patient.mrn}&from=panel`
                      );
                    }}
                  />
                </td>
                <td className="px-3 py-3">
                  <span
                    className={`font-mono text-sm tabular-nums ${patient.pmpmCost > patient.pmpmTarget ? 'text-[#da1e28]' : 'text-[#24a148]'}`}
                  >
                    ${patient.pmpmCost.toLocaleString()}
                  </span>
                  <p className="text-2xs text-carbon-gray-50 font-mono">
                    target ${patient.pmpmTarget}
                  </p>
                </td>
                <td className="px-3 py-3">
                  <AttributionBadge status={patient.attributionStatus} />
                </td>
                {/* Three-column attribution */}
                <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                  <AttributionTriple patient={patient} />
                </td>
                <td className="px-3 py-3">
                  <span className="text-xs text-carbon-gray-70 font-mono whitespace-nowrap">
                    {formatDate(patient.lastContactDate)}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <StatusBadge
                    label={patient.carePlanStatus}
                    variant={
                      patient.carePlanStatus === 'Active'
                        ? 'success'
                        : patient.carePlanStatus === 'Pending'
                          ? 'warning'
                          : 'neutral'
                    }
                    size="sm"
                  />
                </td>
                <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    <button
                      title="Open patient detail"
                      className="p-1.5 text-carbon-gray-50 hover:text-carbon-blue hover:bg-[#d0e2ff] transition-colors opacity-0 group-hover:opacity-100"
                      onClick={() => {
                        setActiveCitizen(patient.id);
                        router.push(`/patient-detail?id=${patient.id}`);
                      }}
                    >
                      <Icon name="EyeIcon" size={14} />
                    </button>
                    <PatientRowActions patient={patient} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Pagination */}
      {filteredPatients.length > 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-carbon-gray-20 bg-carbon-gray-10">
          <p className="text-xs text-carbon-gray-50">
            Showing {(page - 1) * perPage + 1}–{Math.min(page * perPage, filteredPatients.length)}{' '}
            of {filteredPatients.length} patients
          </p>
          <div className="flex items-center gap-1">
            <button
              className="p-1.5 text-carbon-gray-50 hover:text-carbon-gray-100 disabled:opacity-30"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <Icon name="ChevronLeftIcon" size={14} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={`page-${p}`}
                onClick={() => setPage(p)}
                className={`w-7 h-7 text-xs font-medium transition-colors ${page === p ? 'bg-carbon-blue text-white' : 'text-carbon-gray-70 hover:bg-carbon-gray-20'}`}
              >
                {p}
              </button>
            ))}
            <button
              className="p-1.5 text-carbon-gray-50 hover:text-carbon-gray-100 disabled:opacity-30"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              <Icon name="ChevronRightIcon" size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
