'use client';
import React, { useState, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/AppIcon';
import { referralStore, type GainshareRecord, type QualityMetrics } from '@/lib/mockData';

interface GapClosureMetricsPanelProps {
  patientId: string;
  patientName: string;
}

export default function GapClosureMetricsPanel({
  patientId,
  patientName,
}: GapClosureMetricsPanelProps) {
  const [gainshareRecords, setGainshareRecords] = useState<GainshareRecord[]>([]);
  const [qualityMetrics, setQualityMetrics] = useState<QualityMetrics[]>([]);
  const [closedReferrals, setClosedReferrals] = useState<any[]>([]);

  const loadMetrics = useCallback(() => {
    // Get all gainshare records for this patient
    const allGainshare = referralStore.getGainshareRecords();
    const patientGainshare = allGainshare.filter((g) => g.patientId === patientId);
    setGainshareRecords(patientGainshare);

    // Get quality metrics
    const metrics = referralStore.getQualityMetrics();
    setQualityMetrics(metrics);

    // Get closed referrals for this patient
    const allReferrals = referralStore.getAllReferrals();
    const closed = allReferrals.filter(
      (r) => r.patientId === patientId && r.status === 'completed'
    );
    setClosedReferrals(closed);
  }, [patientId]);

  useEffect(() => {
    loadMetrics();
    const unsubscribe = referralStore.subscribe(() => {
      loadMetrics();
    });

    return unsubscribe;
  }, [loadMetrics]);

  // Calculate totals
  const totalProviderGainshare = gainshareRecords.reduce((sum, r) => sum + r.providerShare, 0);
  const totalSpecialistGainshare = gainshareRecords.reduce((sum, r) => sum + r.specialistShare, 0);
  const totalGainshare = gainshareRecords.reduce((sum, r) => sum + r.totalAmount, 0);
  const gapsClosed = gainshareRecords.length;

  // Don't show panel if no gaps have been closed
  if (gapsClosed === 0) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-300 p-4 mb-4 shadow-lg">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon name="CheckCircleIcon" size={20} className="text-green-700" />
          <h3 className="text-base font-bold text-gray-900">Gap Closure Success - {patientName}</h3>
        </div>
        <span className="bg-green-700 text-white text-xs font-bold px-3 py-1 rounded-full">
          {gapsClosed} Gap{gapsClosed !== 1 ? 's' : ''} Closed
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        {/* Provider Gainshare */}
        <div className="bg-white border border-green-200 p-3 rounded">
          <div className="flex items-center gap-2 mb-1">
            <Icon name="UserIcon" size={14} className="text-blue-600" />
            <p className="text-xs font-semibold text-gray-600">Referring Provider</p>
          </div>
          <p className="text-2xl font-bold text-green-700">${totalProviderGainshare}</p>
          <p className="text-xs text-gray-500">60% share</p>
        </div>

        {/* Specialist Gainshare */}
        <div className="bg-white border border-green-200 p-3 rounded">
          <div className="flex items-center gap-2 mb-1">
            <Icon name="UserGroupIcon" size={14} className="text-purple-600" />
            <p className="text-xs font-semibold text-gray-600">Specialist</p>
          </div>
          <p className="text-2xl font-bold text-green-700">${totalSpecialistGainshare}</p>
          <p className="text-xs text-gray-500">40% share</p>
        </div>

        {/* Total Gainshare */}
        <div className="bg-white border border-green-200 p-3 rounded">
          <div className="flex items-center gap-2 mb-1">
            <Icon name="CurrencyDollarIcon" size={14} className="text-green-600" />
            <p className="text-xs font-semibold text-gray-600">Total Gainshare</p>
          </div>
          <p className="text-2xl font-bold text-green-700">${totalGainshare}</p>
          <p className="text-xs text-gray-500">Combined</p>
        </div>
      </div>

      {/* Closed Gaps List */}
      <div className="bg-white border border-green-200 p-3 rounded mb-3">
        <p className="text-xs font-bold text-gray-700 mb-2 flex items-center gap-2">
          <Icon name="ClipboardDocumentCheckIcon" size={14} className="text-green-600" />
          Closed Care Gaps
        </p>
        <div className="space-y-2">
          {closedReferrals.map((referral, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between text-xs bg-green-50 p-2 rounded"
            >
              <div className="flex-1">
                <p className="font-semibold text-gray-900">{referral.careGap?.description}</p>
                <p className="text-gray-600">{referral.careGap?.measure}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-green-700">${referral.careGap?.gainshareAmount}</p>
                <p className="text-gray-500">Closed</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quality Metrics Impact */}
      <div className="bg-white border border-blue-200 p-3 rounded">
        <p className="text-xs font-bold text-gray-700 mb-2 flex items-center gap-2">
          <Icon name="ChartBarIcon" size={14} className="text-blue-600" />
          Quality Metrics Impact
        </p>
        <div className="grid grid-cols-2 gap-2">
          {qualityMetrics.slice(0, 4).map((metric, idx) => (
            <div key={idx} className="text-xs">
              <p className="font-semibold text-gray-700">{metric.measureName}</p>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 bg-gray-200 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${metric.rate >= metric.target ? 'bg-green-600' : 'bg-blue-600'}`}
                    style={{ width: `${metric.rate * 100}%` }}
                  />
                </div>
                <span className="font-mono font-bold text-gray-900">
                  {(metric.rate * 100).toFixed(1)}%
                </span>
              </div>
              <p className="text-gray-500 mt-0.5">
                {metric.gapsClosed} closed | Target: {(metric.target * 100).toFixed(0)}%
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Gainshare Details */}
      {gainshareRecords.length > 0 && (
        <div className="mt-3 pt-3 border-t border-green-200">
          <p className="text-xs font-bold text-gray-700 mb-2">Gainshare Distribution Details</p>
          <div className="space-y-1">
            {gainshareRecords.map((record, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between text-xs bg-blue-50 p-2 rounded"
              >
                <div>
                  <p className="font-semibold text-gray-900">{record.measureName}</p>
                  <p className="text-gray-600">Closed: {record.closureDate}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-blue-700">
                    Provider: ${record.providerShare} | Specialist: ${record.specialistShare}
                  </p>
                  <p className="text-gray-500">{record.status}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Made with Bob
