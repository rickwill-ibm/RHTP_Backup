'use client';
import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import type { ReferralUrgency } from '@/lib/mockData';

interface CareGap {
  id: string;
  name: string;
  program: string;
  cmsMips: string;
  priority: string;
  status: string;
  daysOpen: number;
}

interface ReferralModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (referralData: ReferralFormData) => void;
  careGaps: CareGap[];
  patientName: string;
  patientId: string;
}

export interface ReferralFormData {
  careGapId: string;
  careGapName: string;
  specialistType: string;
  clinicalNotes: string;
  priority: ReferralUrgency;
}

const SPECIALIST_TYPES = [
  'Endocrinology',
  'Cardiology',
  'Nephrology',
  'Pulmonology',
  'Neurology',
  'Orthopedics',
  'Gastroenterology',
  'Rheumatology',
  'Dermatology',
  'Psychiatry',
];

export default function ReferralModal({
  isOpen,
  onClose,
  onSubmit,
  careGaps,
  patientName,
  patientId,
}: ReferralModalProps) {
  const [selectedGapId, setSelectedGapId] = useState('');
  const [specialistType, setSpecialistType] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [priority, setPriority] = useState<ReferralUrgency>('routine');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const selectedGap = careGaps.find((g) => g.id === selectedGapId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedGapId || !specialistType || !clinicalNotes) {
      alert('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 500));

    onSubmit({
      careGapId: selectedGapId,
      careGapName: selectedGap?.name || '',
      specialistType,
      clinicalNotes,
      priority,
    });

    // Reset form
    setSelectedGapId('');
    setSpecialistType('');
    setClinicalNotes('');
    setPriority('routine');
    setIsSubmitting(false);
  };

  const handleCancel = () => {
    setSelectedGapId('');
    setSpecialistType('');
    setClinicalNotes('');
    setPriority('routine');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="bg-[#0043ce] text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Icon name="PaperAirplaneIcon" size={24} />
            <div>
              <h2 className="text-xl font-bold">Create Referral</h2>
              <p className="text-sm text-blue-100">Patient: {patientName}</p>
            </div>
          </div>
          <button
            onClick={handleCancel}
            className="text-white hover:text-blue-200 transition-colors"
            disabled={isSubmitting}
          >
            <Icon name="XMarkIcon" size={24} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Care Gap Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Care Gap to Address <span className="text-red-600">*</span>
            </label>
            <select
              value={selectedGapId}
              onChange={(e) => setSelectedGapId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              disabled={isSubmitting}
            >
              <option value="">Select a care gap...</option>
              {careGaps.map((gap) => (
                <option key={gap.id} value={gap.id}>
                  {gap.name} ({gap.program} - {gap.cmsMips}) - {gap.daysOpen} days open
                </option>
              ))}
            </select>
            {selectedGap && (
              <div className="mt-2 p-3 bg-blue-50 border border-blue-200 text-sm">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-blue-900">Selected Gap:</span>
                  <span className="text-blue-700">{selectedGap.name}</span>
                </div>
                <div className="text-blue-600">
                  Priority: {selectedGap.priority} | Status: {selectedGap.status} | Days Open:{' '}
                  {selectedGap.daysOpen}
                </div>
              </div>
            )}
          </div>

          {/* Specialist Type */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Specialist Type <span className="text-red-600">*</span>
            </label>
            <select
              value={specialistType}
              onChange={(e) => setSpecialistType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              disabled={isSubmitting}
            >
              <option value="">Select specialist type...</option>
              {SPECIALIST_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Priority <span className="text-red-600">*</span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(['routine', 'urgent', 'asap', 'stat'] as ReferralUrgency[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  disabled={isSubmitting}
                  className={`px-4 py-2 text-sm font-semibold transition-colors ${
                    priority === p
                      ? p === 'stat' || p === 'urgent'
                        ? 'bg-red-600 text-white'
                        : p === 'asap'
                          ? 'bg-amber-600 text-white'
                          : 'bg-blue-600 text-white'
                      : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {p.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Clinical Notes */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Clinical Notes <span className="text-red-600">*</span>
            </label>
            <textarea
              value={clinicalNotes}
              onChange={(e) => setClinicalNotes(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter clinical context, reason for referral, relevant history, and any specific questions for the specialist..."
              required
              disabled={isSubmitting}
            />
            <p className="mt-1 text-xs text-gray-500">
              Include relevant clinical information to help the specialist prepare for the
              consultation
            </p>
          </div>

          {/* Info Box */}
          <div className="bg-green-50 border border-green-200 p-4">
            <div className="flex items-start gap-3">
              <Icon
                name="InformationCircleIcon"
                size={20}
                className="text-green-600 flex-shrink-0 mt-0.5"
              />
              <div className="text-sm text-green-800">
                <p className="font-semibold mb-1">Gainshare Eligible Referral</p>
                <p>
                  This referral is eligible for gainshare incentives when the care gap is
                  successfully closed. The specialist will receive notification and can document
                  service completion in the Specialist Portal.
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={handleCancel}
              disabled={isSubmitting}
              className="px-6 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !selectedGapId || !specialistType || !clinicalNotes}
              className="px-6 py-2 text-sm font-semibold text-white bg-[#0043ce] hover:bg-[#0035b3] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Icon name="ArrowPathIcon" size={16} className="animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Icon name="PaperAirplaneIcon" size={16} />
                  Submit Referral
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Made with Bob
