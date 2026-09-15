'use client';
import React, { useState, useEffect, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import {
  ENROLLMENTS,
  ENROLLMENT_STATUS_CONFIG,
  PROGRAM_DOMAIN_COLORS,
  type Enrollment,
} from '@/lib/socialMockData';
import { getFhirMockMode, getFhirClient } from '@/lib/services/fhirClient';

// ─── FHIR Coverage → Enrollment mapper ───────────────────────────────────────

const FHIR_STATUS_MAP: Record<string, Enrollment['status']> = {
  active: 'active',
  draft: 'pending',
  cancelled: 'expired',
  'entered-in-error': 'expired',
};

function ext(resource: any, key: string): string {
  return (
    resource.extension?.find(
      (e: any) => e.url === `http://tcoc.example.org/fhir/StructureDefinition/${key}`
    )?.valueString ?? ''
  );
}

function mapFhirCoverage(resource: any): Enrollment {
  const beneficiary = resource.beneficiary ?? {};
  const patientDisplay: string = beneficiary.display ?? '';
  const patientRef: string = beneficiary.reference ?? '';
  const fhirId = patientRef.replace('Patient/', '');

  const patientIdMap: Record<string, string> = {
    'patient-dorothy-042': 'PAT-0042',
    'patient-james-087': 'PAT-0087',
    'patient-robert-103': 'PAT-0103',
    'patient-lisa-156': 'PAT-0156',
    'patient-maria-001': 'MARIA_SD_001',
  };
  const patientId = patientIdMap[fhirId] ?? fhirId;
  const mrn = patientId.replace('PAT', 'MRN').replace('MARIA_SD_001', 'MRN-SD-001');

  const program = resource.class?.[0]?.name ?? resource.id ?? 'Unknown Program';
  const period = resource.period ?? {};
  const renewalDeadline = ext(resource, 'coverage-renewal-deadline') || '—';
  const daysToRenewal = parseInt(ext(resource, 'coverage-days-to-renewal') || '999', 10);
  const coverageGap = ext(resource, 'coverage-gap') || undefined;
  const status = FHIR_STATUS_MAP[resource.status] ?? 'pending';

  return {
    id: resource.id ?? '',
    patientId,
    patient: patientDisplay,
    mrn,
    program,
    domain: ext(resource, 'coverage-domain') || 'Other',
    fundingSource: ext(resource, 'coverage-funding') || resource.payor?.[0]?.display || '—',
    status,
    startDate: period.start ?? '—',
    endDate: period.end ?? '—',
    renewalDeadline,
    daysToRenewal,
    benefitValue: ext(resource, 'coverage-benefit-value') || '—',
    caseWorker: ext(resource, 'coverage-case-worker') || '—',
    ...(coverageGap ? { coverageGap } : {}),
  };
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function BenefitEnrollmentPage() {
  const [enrollments, setEnrollments] = useState<Enrollment[]>(ENROLLMENTS);
  const [fhirSource, setFhirSource] = useState(false);
  const [patientFilter, setPatientFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const fhirLoadedRef = useRef(false);

  // Live FHIR: fetch all Coverage resources on mount
  useEffect(() => {
    if (getFhirMockMode() || fhirLoadedRef.current) return;
    fhirLoadedRef.current = true;
    getFhirClient()
      .search('Coverage', { _count: 50 })
      .then((bundle: any) => {
        const resources = (bundle?.entry ?? [])
          .map((e: any) => e?.resource)
          .filter(Boolean)
          .filter((r: any) => r?.resourceType === 'Coverage');
        if (resources.length > 0) {
          setEnrollments(resources.map(mapFhirCoverage));
          setFhirSource(true);
        }
      })
      .catch(() => {
        /* non-fatal — keep mock data */
      });
  }, []);

  // Act Now / Renew — POST a ServiceRequest to FHIR (fire-and-forget)
  function handleEnrollmentAction(enrollment: Enrollment, action: 'enroll' | 'renew') {
    if (!getFhirMockMode()) {
      getFhirClient()
        .create({
          resourceType: 'ServiceRequest',
          status: 'active',
          intent: 'order',
          category: [
            {
              coding: [
                {
                  system: 'http://tcoc.example.org/fhir/CodeSystem/service-category',
                  code: 'enrollment',
                  display: 'Benefit Enrollment',
                },
              ],
            },
          ],
          code: { text: `${action === 'renew' ? 'Renewal' : 'Enrollment'}: ${enrollment.program}` },
          subject: { display: enrollment.patient },
          requester: { display: 'Care Manager' },
          note: [
            {
              text: `${action === 'renew' ? 'Renewal' : 'Enrollment'} action initiated from Benefit Enrollment Tracker. Program: ${enrollment.program}, Funding: ${enrollment.fundingSource}`,
            },
          ],
          extension: [
            {
              url: 'http://tcoc.example.org/fhir/StructureDefinition/enrollment-patient-id',
              valueString: enrollment.patientId,
            },
            {
              url: 'http://tcoc.example.org/fhir/StructureDefinition/enrollment-program',
              valueString: enrollment.program,
            },
            {
              url: 'http://tcoc.example.org/fhir/StructureDefinition/enrollment-action',
              valueString: action,
            },
          ],
        })
        .catch(() => {
          /* non-fatal */
        });
    }
  }

  const patients = ['All', ...Array.from(new Set(enrollments.map((e) => e.patient)))];
  const filtered = enrollments.filter(
    (e) =>
      (patientFilter === 'All' || e.patient === patientFilter) &&
      (statusFilter === 'All' || e.status === statusFilter)
  );

  const gaps = enrollments.filter((e) => e.coverageGap);
  const expiringSoon = enrollments.filter((e) => e.daysToRenewal > 0 && e.daysToRenewal <= 60);

  return (
    <AppLayout
      pageTitle="Benefit Enrollment Tracker"
      breadcrumbs={[
        { label: 'Whole Person Care', href: '/social-needs-screening' },
        { label: 'Benefit Enrollment' },
      ]}
    >
      {/* FHIR badge */}
      {fhirSource && (
        <div className="flex items-center gap-2 mb-3 px-1">
          <span className="text-xs font-semibold px-1.5 py-0.5 bg-[#defbe6] text-[#0e6027] border border-[#a7f0ba]">
            FHIR R4
          </span>
          <span className="text-xs text-[#0e6027]">
            {enrollments.length} Coverage resources loaded from HAPI FHIR
          </span>
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[
          {
            label: 'Active Enrollments',
            value: String(enrollments.filter((e) => e.status === 'active').length),
            sub: 'Across all patients',
            color: '#0e6027',
            icon: 'CheckBadgeIcon',
          },
          {
            label: 'Coverage Gaps',
            value: String(gaps.length),
            sub: 'Needs immediate action',
            color: '#da1e28',
            icon: 'ExclamationTriangleIcon',
          },
          {
            label: 'Expiring in 60 Days',
            value: String(expiringSoon.length),
            sub: 'Renewal action required',
            color: '#b45309',
            icon: 'ClockIcon',
          },
          {
            label: 'Pending Enrollments',
            value: String(enrollments.filter((e) => e.status === 'pending').length),
            sub: 'Awaiting approval',
            color: '#0043ce',
            icon: 'ArrowPathIcon',
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="bg-white border border-carbon-gray-20 p-4 flex items-start gap-3"
          >
            <div className="w-8 h-8 flex items-center justify-center bg-carbon-gray-10 flex-shrink-0">
              <Icon name={kpi.icon as any} size={16} style={{ color: kpi.color }} />
            </div>
            <div>
              <p className="font-mono text-xl font-bold leading-tight" style={{ color: kpi.color }}>
                {kpi.value}
              </p>
              <p className="text-xs font-semibold text-carbon-gray-100">{kpi.label}</p>
              <p className="text-2xs text-carbon-gray-50">{kpi.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Coverage Gap Alerts */}
      {gaps.length > 0 && (
        <div className="bg-[#fff1f1] border border-[#da1e28] p-4 mb-4 space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="ExclamationTriangleIcon" size={16} style={{ color: '#da1e28' }} />
            <p className="text-xs font-semibold text-[#da1e28]">Coverage Gaps Requiring Action</p>
          </div>
          {gaps.map((e) => (
            <div key={e.id} className="flex items-start gap-3 text-xs">
              <div className="flex-shrink-0 w-44">
                <span className="font-semibold text-carbon-gray-100">{e.patient}</span>
                <span className="ml-1 font-mono text-carbon-gray-50 text-2xs">({e.patientId})</span>
              </div>
              <span className="text-[#da1e28]">{e.coverageGap}</span>
              <button
                onClick={() => handleEnrollmentAction(e, 'enroll')}
                className="ml-auto px-2 py-0.5 text-2xs font-semibold bg-[#da1e28] text-white hover:bg-[#b81922] transition-colors flex-shrink-0"
              >
                Act Now
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2">
          <p className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide">
            Patient:
          </p>
          <div className="flex gap-1 flex-wrap">
            {patients.map((p) => (
              <button
                key={p}
                onClick={() => setPatientFilter(p)}
                className={`px-3 py-1.5 text-xs font-semibold border transition-colors ${patientFilter === p ? 'bg-[#0043ce] text-white border-[#0043ce]' : 'bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10'}`}
              >
                {p === 'All' ? 'All' : p.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide">
            Status:
          </p>
          <div className="flex gap-1">
            {['All', 'active', 'pending', 'expired'].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 text-xs font-semibold border transition-colors ${statusFilter === s ? 'bg-[#0043ce] text-white border-[#0043ce]' : 'bg-white text-carbon-gray-70 border-carbon-gray-20 hover:bg-carbon-gray-10'}`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {fhirSource && (
          <div className="ml-auto flex items-center">
            <span className="text-xs font-semibold px-1.5 py-0.5 bg-[#defbe6] text-[#0e6027] border border-[#a7f0ba]">
              FHIR R4
            </span>
          </div>
        )}
      </div>

      {/* Enrollment Table */}
      <div className="bg-white border border-carbon-gray-20">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-carbon-gray-10 border-b border-carbon-gray-20">
              <th className="text-left px-4 py-2.5 font-semibold text-carbon-gray-70">Patient</th>
              <th className="text-left px-4 py-2.5 font-semibold text-carbon-gray-70">Program</th>
              <th className="text-left px-4 py-2.5 font-semibold text-carbon-gray-70">Domain</th>
              <th className="text-left px-4 py-2.5 font-semibold text-carbon-gray-70">Funding</th>
              <th className="text-center px-4 py-2.5 font-semibold text-carbon-gray-70">Status</th>
              <th className="text-left px-4 py-2.5 font-semibold text-carbon-gray-70">Start</th>
              <th className="text-left px-4 py-2.5 font-semibold text-carbon-gray-70">End</th>
              <th className="text-left px-4 py-2.5 font-semibold text-carbon-gray-70">Renewal</th>
              <th className="text-right px-4 py-2.5 font-semibold text-carbon-gray-70">
                Benefit Value
              </th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => {
              const cfg = ENROLLMENT_STATUS_CONFIG[e.status];
              const domainColor = PROGRAM_DOMAIN_COLORS[e.domain] ?? '#6f6f6f';
              const urgentRenewal = e.daysToRenewal > 0 && e.daysToRenewal <= 60;
              return (
                <tr
                  key={e.id}
                  className={`border-b border-carbon-gray-10 hover:bg-carbon-gray-10 transition-colors ${e.coverageGap ? 'bg-[#fff8f8]' : ''}`}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-carbon-gray-100">{e.patient}</p>
                    <p className="font-mono text-2xs text-carbon-gray-50">
                      {e.patientId} · {e.mrn}
                    </p>
                  </td>
                  <td className="px-4 py-3 font-medium text-carbon-gray-100">{e.program}</td>
                  <td className="px-4 py-3">
                    <span
                      className="px-2 py-0.5 text-2xs font-bold text-white"
                      style={{ backgroundColor: domainColor }}
                    >
                      {e.domain}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-carbon-gray-50 font-mono text-2xs">
                    {e.fundingSource}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className="px-2 py-0.5 text-2xs font-bold inline-flex items-center gap-1"
                      style={{ backgroundColor: cfg.bg, color: cfg.text }}
                    >
                      <Icon name={cfg.icon as any} size={10} />
                      {cfg.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-carbon-gray-70">{e.startDate}</td>
                  <td className="px-4 py-3 font-mono text-carbon-gray-70">{e.endDate}</td>
                  <td className="px-4 py-3">
                    {e.renewalDeadline !== '—' ? (
                      <span
                        className={`font-mono ${urgentRenewal ? 'text-[#b45309] font-bold' : 'text-carbon-gray-70'}`}
                      >
                        {e.renewalDeadline}
                        {urgentRenewal && (
                          <span className="ml-1 text-2xs">({e.daysToRenewal}d)</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-carbon-gray-30">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-carbon-gray-100">
                    {e.benefitValue}
                  </td>
                  <td className="px-4 py-3">
                    {(e.status === 'expired' || urgentRenewal) && (
                      <button
                        onClick={() => handleEnrollmentAction(e, 'renew')}
                        className="px-2 py-1 text-2xs font-semibold bg-[#da1e28] text-white hover:bg-[#b81922] transition-colors"
                      >
                        {e.status === 'expired' ? 'Renew' : 'Renew Soon'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}
