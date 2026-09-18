'use client';
import React, { useMemo } from 'react';
import { mockReferrals } from './ActiveReferralsTable';

interface AuditEntry {
  id: string;
  referralId: string;
  patientName: string;
  providerName: string;
  specialty: string;
  step: string;
  action: string;
  user: string;
  role: string;
  timestamp: string;
  notes: string;
}

const auditLog: AuditEntry[] = [
  {
    id: 'audit-001',
    referralId: 'ref-001',
    patientName: 'Margaret Okonkwo',
    providerName: 'Dr. Amara Osei',
    specialty: 'Cardiology',
    step: 'Select Provider',
    action: 'Provider assigned',
    user: 'Angela Torres',
    role: 'Care Manager',
    timestamp: '2026-04-10 09:14',
    notes: 'Preferred cardiologist selected based on quality score.',
  },
  {
    id: 'audit-002',
    referralId: 'ref-001',
    patientName: 'Margaret Okonkwo',
    providerName: 'Dr. Amara Osei',
    specialty: 'Cardiology',
    step: 'Submit to EMR',
    action: 'Referral submitted via Epic Direct',
    user: 'Angela Torres',
    role: 'Care Manager',
    timestamp: '2026-04-11 10:02',
    notes: 'Echo pre-authorization attached.',
  },
  {
    id: 'audit-003',
    referralId: 'ref-002',
    patientName: 'Delroy Hutchinson',
    providerName: 'Dr. Marcus Weatherington',
    specialty: 'Pulmonology',
    step: 'Select Provider',
    action: 'Provider assigned',
    user: 'Angela Torres',
    role: 'Care Manager',
    timestamp: '2026-04-08 14:30',
    notes: 'In-network pulmonologist with availability.',
  },
  {
    id: 'audit-004',
    referralId: 'ref-002',
    patientName: 'Delroy Hutchinson',
    providerName: 'Dr. Marcus Weatherington',
    specialty: 'Pulmonology',
    step: 'Submit to EMR',
    action: 'Referral submitted via Fax',
    user: 'Angela Torres',
    role: 'Care Manager',
    timestamp: '2026-04-09 08:45',
    notes: 'Spirometry results faxed with referral.',
  },
  {
    id: 'audit-005',
    referralId: 'ref-003',
    patientName: 'Rosa Evangelista',
    providerName: 'Dr. Priya Venkataraman',
    specialty: 'Nephrology',
    step: 'Select Provider',
    action: 'Provider assigned — STAT',
    user: 'Dr. James Whitfield',
    role: 'Physician',
    timestamp: '2026-04-12 11:00',
    notes: 'STAT referral — GFR critically low.',
  },
  {
    id: 'audit-006',
    referralId: 'ref-004',
    patientName: 'Bernard Thibodeau',
    providerName: 'Dr. Carlos Mendez-Ruiz',
    specialty: 'Cardiology',
    step: 'Select Provider',
    action: 'Provider assigned',
    user: 'Angela Torres',
    role: 'Care Manager',
    timestamp: '2026-04-05 13:22',
    notes: 'Routine HTN follow-up.',
  },
  {
    id: 'audit-007',
    referralId: 'ref-004',
    patientName: 'Bernard Thibodeau',
    providerName: 'Dr. Carlos Mendez-Ruiz',
    specialty: 'Cardiology',
    step: 'Submit to EMR',
    action: 'Referral submitted via Epic Direct',
    user: 'Angela Torres',
    role: 'Care Manager',
    timestamp: '2026-04-06 09:10',
    notes: 'BP log attached.',
  },
  {
    id: 'audit-008',
    referralId: 'ref-004',
    patientName: 'Bernard Thibodeau',
    providerName: 'Dr. Carlos Mendez-Ruiz',
    specialty: 'Cardiology',
    step: 'Closure',
    action: 'Referral closed — Outcome: Seen',
    user: 'Angela Torres',
    role: 'Care Manager',
    timestamp: '2026-04-13 16:00',
    notes: 'Patient seen. Follow-up in 3 months.',
  },
  {
    id: 'audit-009',
    referralId: 'ref-007',
    patientName: 'Margaret Okonkwo',
    providerName: 'Dr. Fatima Al-Rashidi',
    specialty: 'Ophthalmology',
    step: 'Select Provider',
    action: 'Provider assigned',
    user: 'Angela Torres',
    role: 'Care Manager',
    timestamp: '2026-04-01 10:00',
    notes: 'Preferred ophthalmologist.',
  },
  {
    id: 'audit-010',
    referralId: 'ref-007',
    patientName: 'Margaret Okonkwo',
    providerName: 'Dr. Fatima Al-Rashidi',
    specialty: 'Ophthalmology',
    step: 'Submit to EMR',
    action: 'Referral submitted via Epic Direct',
    user: 'Angela Torres',
    role: 'Care Manager',
    timestamp: '2026-04-02 08:30',
    notes: 'AMD staging notes attached.',
  },
  {
    id: 'audit-011',
    referralId: 'ref-007',
    patientName: 'Margaret Okonkwo',
    providerName: 'Dr. Fatima Al-Rashidi',
    specialty: 'Ophthalmology',
    step: 'Closure',
    action: 'Referral closed — Outcome: Seen',
    user: 'Angela Torres',
    role: 'Care Manager',
    timestamp: '2026-04-08 15:45',
    notes: 'OCT imaging completed. Monitoring plan established.',
  },
  {
    id: 'audit-012',
    referralId: 'ref-008',
    patientName: 'Sylvia Montecinos',
    providerName: 'Dr. Amara Osei',
    specialty: 'Cardiology',
    step: 'Select Provider',
    action: 'Provider assigned — STAT',
    user: 'Dr. James Whitfield',
    role: 'Physician',
    timestamp: '2026-04-13 07:55',
    notes: 'STAT — new-onset AFib.',
  },
  {
    id: 'audit-013',
    referralId: 'ref-008',
    patientName: 'Sylvia Montecinos',
    providerName: 'Dr. Amara Osei',
    specialty: 'Cardiology',
    step: 'Submit to EMR',
    action: 'Referral submitted via Epic Direct',
    user: 'Dr. James Whitfield',
    role: 'Physician',
    timestamp: '2026-04-13 08:10',
    notes: 'EKG strip attached.',
  },
  {
    id: 'audit-014',
    referralId: 'ref-009',
    patientName: 'Kwame Asantewaa',
    providerName: 'Dr. Jerome Blackwood',
    specialty: 'Orthopedics',
    step: 'Closure',
    action: 'Referral closed — Outcome: Seen',
    user: 'Angela Torres',
    role: 'Care Manager',
    timestamp: '2026-04-14 14:20',
    notes: 'X-ray reviewed. PT referral added.',
  },
  {
    id: 'audit-015',
    referralId: 'ref-010',
    patientName: 'Rosa Evangelista',
    providerName: 'Dr. Nkechi Eze-Williams',
    specialty: 'Endocrinology',
    step: 'Select Provider',
    action: 'Out-of-network provider selected — auth obtained',
    user: 'Angela Torres',
    role: 'Care Manager',
    timestamp: '2026-04-03 11:30',
    notes: 'No in-network endocrinologist available. Auth #A-2026-0403.',
  },
  {
    id: 'audit-016',
    referralId: 'ref-010',
    patientName: 'Rosa Evangelista',
    providerName: 'Dr. Nkechi Eze-Williams',
    specialty: 'Endocrinology',
    step: 'Closure',
    action: 'Referral closed — Outcome: Seen',
    user: 'Angela Torres',
    role: 'Care Manager',
    timestamp: '2026-04-10 17:00',
    notes: 'Insulin regimen adjusted. Follow-up in 6 weeks.',
  },
  {
    id: 'audit-017',
    referralId: 'ref-012',
    patientName: 'Delroy Hutchinson',
    providerName: 'Dr. Amara Osei',
    specialty: 'Cardiology',
    step: 'Closure',
    action: 'Referral closed — Outcome: Seen',
    user: 'Dr. James Whitfield',
    role: 'Physician',
    timestamp: '2026-04-04 13:00',
    notes: 'Stress test ordered. Results pending.',
  },
];

const stepColors: Record<string, string> = {
  'Select Provider': 'bg-[#d0e2ff] text-[#0043ce]',
  'Submit to EMR': 'bg-[#f6f2ff] text-[#6929c4]',
  Closure: 'bg-[#defbe6] text-[#0e6027]',
};

interface Props {
  selectedReferralId: string | null;
}

export default function ReferralAuditLog({ selectedReferralId }: Props) {
  const entries = useMemo(() => {
    if (selectedReferralId) {
      return auditLog.filter((e) => e.referralId === selectedReferralId);
    }
    return auditLog;
  }, [selectedReferralId]);

  const selectedReferral = selectedReferralId
    ? mockReferrals.find((r) => r.id === selectedReferralId)
    : null;

  return (
    <div className="bg-white border border-carbon-gray-20">
      <div className="px-4 py-3 border-b border-carbon-gray-20 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-carbon-gray-100">Referral Closure Audit Log</h2>
          {selectedReferral && (
            <span className="text-2xs font-semibold px-2 py-0.5 bg-[#edf5ff] text-[#0043ce] border border-[#97c1ff]">
              Filtered: {selectedReferral.patientName} — {selectedReferral.specialty}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {selectedReferralId && (
            <span className="text-xs text-carbon-gray-50">
              {entries.length} event{entries.length !== 1 ? 's' : ''}
            </span>
          )}
          <span className="text-2xs text-carbon-gray-40 italic">Immutable — append-only</span>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-carbon-gray-50">
          No audit events for the selected referral.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-carbon-gray-10 border-b border-carbon-gray-20">
                {[
                  'Timestamp',
                  'Patient',
                  'Provider',
                  'Specialty',
                  'Step',
                  'Action',
                  'User',
                  'Role',
                  'Notes',
                ].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2 text-left text-2xs font-semibold text-carbon-gray-50 uppercase tracking-wide whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e, idx) => (
                <tr
                  key={e.id}
                  className={`border-b border-carbon-gray-10 ${idx % 2 === 0 ? 'bg-white' : 'bg-carbon-gray-10'}`}
                >
                  <td className="px-3 py-2.5 font-mono text-xs text-carbon-gray-70 whitespace-nowrap">
                    {e.timestamp}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-carbon-gray-100 whitespace-nowrap">
                    {e.patientName}
                  </td>
                  <td className="px-3 py-2.5 text-carbon-gray-70 whitespace-nowrap">
                    {e.providerName}
                  </td>
                  <td className="px-3 py-2.5 text-carbon-gray-70 whitespace-nowrap">
                    {e.specialty}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-flex items-center text-2xs font-semibold px-2 py-0.5 ${stepColors[e.step] ?? 'bg-carbon-gray-10 text-carbon-gray-70'}`}
                    >
                      {e.step}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-carbon-gray-70 whitespace-nowrap">{e.action}</td>
                  <td className="px-3 py-2.5 text-carbon-gray-70 whitespace-nowrap">{e.user}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`text-2xs font-medium px-1.5 py-0.5 ${e.role === 'Physician' ? 'bg-[#f6f2ff] text-[#6929c4]' : 'bg-[#d0e2ff] text-[#0043ce]'}`}
                    >
                      {e.role}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-carbon-gray-70 max-w-xs">{e.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
