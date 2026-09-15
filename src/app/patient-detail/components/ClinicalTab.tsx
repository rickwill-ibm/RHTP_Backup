'use client';
import React from 'react';

import Icon from '@/components/ui/AppIcon';
import FreshnessIndicator from '@/components/ui/FreshnessIndicator';
import StatusBadge from '@/components/ui/StatusBadge';
import { usePatientContext } from '@/lib/patientContext';
import { getFhirMockMode } from '@/lib/services/fhirClient';
import type { ConditionEntry, MedicationEntry, OrderEntry } from '@/lib/patientRegistry';

// ── Fallback data (Dorothy Simmons) shown when registry has no clinical data ──
const FALLBACK_CONDITIONS: ConditionEntry[] = [
  {
    key: 'cond-001',
    code: 'I50.32',
    name: 'Chronic diastolic heart failure',
    onset: '2019-03',
    status: 'Active',
    source: 'EMR',
  },
  {
    key: 'cond-002',
    code: 'E11.65',
    name: 'Type 2 diabetes mellitus with hyperglycemia',
    onset: '2014-07',
    status: 'Active',
    source: 'EMR',
  },
  {
    key: 'cond-003',
    code: 'J44.1',
    name: 'COPD with acute exacerbation',
    onset: '2021-11',
    status: 'Active',
    source: 'HIE',
  },
  {
    key: 'cond-004',
    code: 'I10',
    name: 'Essential (primary) hypertension',
    onset: '2012-03',
    status: 'Active',
    source: 'EMR',
  },
  {
    key: 'cond-005',
    code: 'E66.01',
    name: 'Morbid obesity due to excess calories',
    onset: '2016-05',
    status: 'Active',
    source: 'EMR',
  },
  {
    key: 'cond-006',
    code: 'N18.3',
    name: 'Chronic kidney disease, stage 3',
    onset: '2022-09',
    status: 'Active',
    source: 'Claims',
  },
  {
    key: 'cond-007',
    code: 'F32.1',
    name: 'Major depressive disorder, single episode',
    onset: '2023-02',
    status: 'Active',
    source: 'EMR',
  },
];

const FALLBACK_MEDICATIONS: MedicationEntry[] = [
  {
    key: 'med-001',
    name: 'Furosemide',
    dose: '40mg',
    frequency: 'Daily',
    prescriber: 'Dr. Whitfield',
    lastFill: '2026-04-01',
    adherence: 0.92,
    ddi: false,
  },
  {
    key: 'med-002',
    name: 'Metformin HCl',
    dose: '1000mg',
    frequency: 'BID',
    prescriber: 'Dr. Whitfield',
    lastFill: '2026-03-28',
    adherence: 0.71,
    ddi: false,
  },
  {
    key: 'med-003',
    name: 'Warfarin Sodium',
    dose: '5mg',
    frequency: 'Daily',
    prescriber: 'Dr. Whitfield',
    lastFill: '2026-04-08',
    adherence: 0.95,
    ddi: true,
  },
  {
    key: 'med-004',
    name: 'Tiotropium bromide',
    dose: '18mcg',
    frequency: 'Daily inhaled',
    prescriber: 'Dr. Nakamura',
    lastFill: '2026-03-15',
    adherence: 0.68,
    ddi: false,
  },
  {
    key: 'med-005',
    name: 'Lisinopril',
    dose: '20mg',
    frequency: 'Daily',
    prescriber: 'Dr. Whitfield',
    lastFill: '2026-04-01',
    adherence: 0.89,
    ddi: false,
  },
  {
    key: 'med-006',
    name: 'Atorvastatin',
    dose: '40mg',
    frequency: 'Nightly',
    prescriber: 'Dr. Whitfield',
    lastFill: '2026-03-20',
    adherence: 0.84,
    ddi: false,
  },
  {
    key: 'med-007',
    name: 'Ibuprofen OTC',
    dose: '400mg',
    frequency: 'PRN',
    prescriber: 'OTC',
    lastFill: '2026-04-10',
    adherence: null,
    ddi: true,
  },
];

const FALLBACK_ORDERS: OrderEntry[] = [
  {
    key: 'ord-001',
    type: 'Lab',
    name: 'HbA1c',
    result: '9.2%',
    date: '2026-03-15',
    status: 'Resulted',
    flag: 'High',
  },
  {
    key: 'ord-002',
    type: 'Lab',
    name: 'BNP',
    result: '842 pg/mL',
    date: '2026-03-28',
    status: 'Resulted',
    flag: 'Critical',
  },
  {
    key: 'ord-003',
    type: 'Imaging',
    name: 'Cardiac MRI',
    result: 'Pending',
    date: '2026-04-14',
    status: 'Ordered',
    flag: null,
  },
  {
    key: 'ord-004',
    type: 'Referral',
    name: 'Ophthalmology',
    result: 'Awaiting scheduling',
    date: '2026-02-14',
    status: 'Pending',
    flag: null,
  },
  {
    key: 'ord-005',
    type: 'Lab',
    name: 'eGFR / BMP',
    result: '38 mL/min',
    date: '2026-03-15',
    status: 'Resulted',
    flag: 'Low',
  },
  {
    key: 'ord-006',
    type: 'Procedure',
    name: 'Echocardiogram',
    result: 'EF 35%',
    date: '2026-03-12',
    status: 'Resulted',
    flag: 'Low',
  },
];

export default function ClinicalTab() {
  const { patient } = usePatientContext();
  const isLiveFhir = !getFhirMockMode();

  const conditions: ConditionEntry[] = patient?.conditions ?? FALLBACK_CONDITIONS;
  const medications: MedicationEntry[] = patient?.medications ?? FALLBACK_MEDICATIONS;
  const recentOrders: OrderEntry[] = patient?.recentOrders ?? FALLBACK_ORDERS;

  // True when the data came from FHIR (fields are defined on the patient context)
  const conditionsFromFhir = isLiveFhir && !!patient?.conditions?.length;
  const medicationsFromFhir = isLiveFhir && !!patient?.medications?.length;
  const ordersFromFhir = isLiveFhir && !!patient?.recentOrders?.length;

  const ddiCount = medications.filter((m) => m.ddi).length;

  return (
    <div className="space-y-6">
      {/* Active Conditions */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-carbon-gray-100 flex items-center gap-2">
            <Icon name="HeartIcon" size={16} className="text-[#da1e28]" />
            Active Conditions ({conditions.length})
            {conditionsFromFhir && (
              <span className="text-2xs font-semibold px-1.5 py-0.5 bg-[#defbe6] text-[#0e6027] border border-[#a7f0ba]">
                FHIR R4
              </span>
            )}
          </h3>
          <FreshnessIndicator source={conditionsFromFhir ? 'FHIR' : 'EMR'} date="2026-04-15" />
        </div>
        <div className="border border-carbon-gray-20 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-carbon-gray-10 border-b border-carbon-gray-20">
              <tr>
                {['ICD-10', 'Condition', 'Onset', 'Status', 'Source'].map((h) => (
                  <th
                    key={`ch-${h}`}
                    className="px-4 py-2.5 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon-gray-20">
              {conditions.map((c) => (
                <tr key={c.key} className="hover:bg-carbon-gray-10">
                  <td className="px-4 py-2.5 font-mono text-xs text-carbon-gray-70">{c.code}</td>
                  <td className="px-4 py-2.5 text-xs font-medium text-carbon-gray-100">{c.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-carbon-gray-50">{c.onset}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge label={c.status} variant="success" size="sm" />
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-2xs font-mono text-carbon-gray-50 bg-carbon-gray-10 px-2 py-0.5">
                      {c.source}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Medications */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-carbon-gray-100 flex items-center gap-2">
            <Icon name="BeakerIcon" size={16} className="text-[#0043ce]" />
            Medications ({medications.length})
            {ddiCount > 0 && (
              <span className="text-xs text-[#da1e28] bg-[#fff1f1] px-2 py-0.5 border border-[#ffb3b8] font-medium">
                {ddiCount} DDI flag{ddiCount !== 1 ? 's' : ''}
              </span>
            )}
            {medicationsFromFhir && (
              <span className="text-2xs font-semibold px-1.5 py-0.5 bg-[#defbe6] text-[#0e6027] border border-[#a7f0ba]">
                FHIR R4
              </span>
            )}
          </h3>
          <FreshnessIndicator source={medicationsFromFhir ? 'FHIR' : 'Claims'} date="2026-04-10" />
        </div>
        <div className="border border-carbon-gray-20 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-carbon-gray-10 border-b border-carbon-gray-20">
              <tr>
                {[
                  'Medication',
                  'Dose',
                  'Frequency',
                  'Prescriber',
                  'Last Fill',
                  'PDC Adherence',
                  'DDI',
                ].map((h) => (
                  <th
                    key={`mh-${h}`}
                    className="px-4 py-2.5 text-left text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon-gray-20">
              {medications.map((m) => (
                <tr
                  key={m.key}
                  className={`hover:bg-carbon-gray-10 ${m.ddi ? 'bg-[#fff8f8]' : ''}`}
                >
                  <td className="px-4 py-2.5 font-medium text-xs text-carbon-gray-100">{m.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-carbon-gray-70">{m.dose}</td>
                  <td className="px-4 py-2.5 text-xs text-carbon-gray-70">{m.frequency}</td>
                  <td className="px-4 py-2.5 text-xs text-carbon-gray-70">{m.prescriber}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-carbon-gray-50">
                    {m.lastFill}
                  </td>
                  <td className="px-4 py-2.5">
                    {m.adherence !== null ? (
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-carbon-gray-20">
                          <div
                            className={`h-full ${m.adherence >= 0.8 ? 'bg-[#24a148]' : m.adherence >= 0.7 ? 'bg-[#f1c21b]' : 'bg-[#da1e28]'}`}
                            style={{ width: `${m.adherence * 100}%` }}
                          />
                        </div>
                        <span
                          className={`text-xs font-mono tabular-nums ${m.adherence >= 0.8 ? 'text-[#24a148]' : m.adherence >= 0.7 ? 'text-[#b45309]' : 'text-[#da1e28]'}`}
                        >
                          {Math.round(m.adherence * 100)}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-2xs text-carbon-gray-30">N/A</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {m.ddi ? (
                      <span className="flex items-center gap-1 text-2xs text-[#da1e28] font-semibold">
                        <Icon name="ExclamationCircleIcon" size={12} />
                        DDI Risk
                      </span>
                    ) : (
                      <span className="text-2xs text-carbon-gray-30">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent Orders */}
      <section>
        <h3 className="text-base font-semibold text-carbon-gray-100 flex items-center gap-2 mb-3">
          <Icon name="ClipboardDocumentListIcon" size={16} className="text-carbon-gray-70" />
          Recent Orders &amp; Results
          {ordersFromFhir && (
            <span className="text-2xs font-semibold px-1.5 py-0.5 bg-[#defbe6] text-[#0e6027] border border-[#a7f0ba]">
              FHIR R4
            </span>
          )}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {recentOrders.map((o) => (
            <div
              key={o.key}
              className="flex items-center justify-between px-4 py-3 bg-carbon-gray-10 border border-carbon-gray-20"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xs font-semibold px-1.5 py-0.5 bg-carbon-gray-20 text-carbon-gray-70">
                    {o.type}
                  </span>
                  <span className="text-xs font-medium text-carbon-gray-100">{o.name}</span>
                </div>
                <p className="text-2xs text-carbon-gray-50 mt-0.5 font-mono">{o.date}</p>
              </div>
              <div className="text-right">
                <p
                  className={`text-xs font-mono font-semibold ${
                    o.flag === 'Critical'
                      ? 'text-[#da1e28]'
                      : o.flag === 'High'
                        ? 'text-[#b45309]'
                        : o.flag === 'Low'
                          ? 'text-[#0043ce]'
                          : 'text-carbon-gray-70'
                  }`}
                >
                  {o.result}
                </p>
                <StatusBadge
                  label={o.status}
                  variant={
                    o.status === 'Resulted'
                      ? 'success'
                      : o.status === 'Ordered'
                        ? 'info'
                        : 'warning'
                  }
                  size="sm"
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
