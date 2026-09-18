'use client';
import React, { useState, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import { carePlanTemplates, type CarePlanTemplate, type CarePlan } from '@/lib/mockData';
import type { GeneratedCarePlan } from '@/lib/services/carePlanGenerator';

interface CarePlanFormProps {
  mode: 'create' | 'edit';
  existingPlan?: CarePlan;
  generatedPlan?: GeneratedCarePlan;
  patientId: string;
  onSave: (plan: Partial<CarePlan>) => void;
  onCancel: () => void;
}

export default function CarePlanForm({
  mode,
  existingPlan,
  generatedPlan,
  patientId,
  onSave,
  onCancel,
}: CarePlanFormProps) {
  const [showTemplates, setShowTemplates] = useState(
    mode === 'create' && !existingPlan && !generatedPlan
  );
  const [selectedTemplate, setSelectedTemplate] = useState<CarePlanTemplate | null>(null);
  const [showGainshare, setShowGainshare] = useState(false); // Collapsed by default

  // Form state
  const [title, setTitle] = useState(existingPlan?.title || generatedPlan?.title || '');
  const [description, setDescription] = useState(
    existingPlan?.description || generatedPlan?.description || ''
  );
  const [addresses, setAddresses] = useState<string[]>(
    existingPlan?.addresses || generatedPlan?.addresses || []
  );
  const [newAddress, setNewAddress] = useState('');
  const [goals, setGoals] = useState(existingPlan?.goals || generatedPlan?.goals || []);
  const [interventions, setInterventions] = useState(
    existingPlan?.interventions || generatedPlan?.interventions || []
  );
  const [careTeam, setCareTeam] = useState(existingPlan?.careTeam || generatedPlan?.careTeam || []);
  const [shareWith, setShareWith] = useState<string[]>(
    existingPlan?.sharedWith || generatedPlan?.sharedWith || []
  );

  // Auto-populate when generatedPlan is provided
  useEffect(() => {
    if (generatedPlan) {
      setTitle(generatedPlan.title);
      setDescription(generatedPlan.description);
      setAddresses(generatedPlan.addresses);
      setGoals(generatedPlan.goals);
      setInterventions(generatedPlan.interventions);
      setCareTeam(generatedPlan.careTeam);
      setShareWith(generatedPlan.sharedWith);
      setShowTemplates(false);
    }
  }, [generatedPlan]);

  const handleTemplateSelect = (template: CarePlanTemplate) => {
    if (template === 'Custom') {
      setSelectedTemplate(template);
      setShowTemplates(false);
      return;
    }

    const templateData = carePlanTemplates[template as keyof typeof carePlanTemplates];
    if (!templateData) return;

    setSelectedTemplate(template);
    setTitle(templateData.title);

    // Pre-populate goals
    setGoals(
      templateData.defaultGoals.map((g, idx) => ({
        id: `goal-${Date.now()}-${idx}`,
        description: g.description,
        target: g.target,
        status: 'Not Started' as const,
        dueDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        progress: 0,
      }))
    );

    // Pre-populate interventions
    setInterventions(
      templateData.defaultInterventions.map((i, idx) => ({
        id: `intervention-${Date.now()}-${idx}`,
        type: i.type,
        description: i.description,
        status: 'Pending' as const,
        frequency: 'frequency' in i ? i.frequency : undefined,
      }))
    );

    setShowTemplates(false);
  };

  const handleAddAddress = () => {
    if (newAddress.trim()) {
      setAddresses([...addresses, newAddress.trim()]);
      setNewAddress('');
    }
  };

  const handleRemoveAddress = (index: number) => {
    setAddresses(addresses.filter((_, idx) => idx !== index));
  };

  const handleAddGoal = () => {
    setGoals([
      ...goals,
      {
        id: `goal-${Date.now()}`,
        description: '',
        target: '',
        status: 'Not Started',
        dueDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        progress: 0,
      },
    ]);
  };

  const handleRemoveGoal = (index: number) => {
    setGoals(goals.filter((_, idx) => idx !== index));
  };

  const handleAddIntervention = () => {
    setInterventions([
      ...interventions,
      {
        id: `intervention-${Date.now()}`,
        type: 'Referral',
        description: '',
        status: 'Pending',
      },
    ]);
  };

  const handleRemoveIntervention = (index: number) => {
    setInterventions(interventions.filter((_, idx) => idx !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const planData: Partial<CarePlan> = {
      title,
      description,
      addresses,
      goals,
      interventions,
      careTeam,
      sharedWith: shareWith,
      status: 'Active',
      template: selectedTemplate || undefined,
    };

    onSave(planData);
  };

  // Template selection view
  if (showTemplates) {
    return (
      <div className="bg-white border border-carbon-gray-20 p-6">
        <h3 className="text-lg font-semibold mb-4">Select Care Plan Template</h3>
        <p className="text-sm text-carbon-gray-70 mb-6">
          Choose a template to get started quickly, or create a custom plan from scratch.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(Object.keys(carePlanTemplates) as Array<keyof typeof carePlanTemplates>).map(
            (template) => {
              const templateData = carePlanTemplates[template];
              return (
                <button
                  key={template}
                  onClick={() => handleTemplateSelect(template)}
                  className="border-2 border-carbon-gray-30 p-4 text-left hover:border-[#0f62fe] hover:bg-[#edf5ff] transition-colors"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon
                      name={
                        template === 'Cardiology'
                          ? 'HeartIcon'
                          : template === 'Endocrinology'
                            ? 'BeakerIcon'
                            : template === 'Pulmonology'
                              ? 'CloudIcon'
                              : template === 'Nephrology'
                                ? 'SparklesIcon'
                                : template === 'Orthopedics'
                                  ? 'WrenchIcon'
                                  : template === 'Neurology'
                                    ? 'BoltIcon'
                                    : 'DocumentTextIcon'
                      }
                      size={20}
                      className="text-[#0f62fe]"
                    />
                    <span className="font-semibold">{template}</span>
                  </div>
                  <p className="text-xs text-carbon-gray-70 mb-3">{templateData.title}</p>

                  <div className="text-2xs text-carbon-gray-70 space-y-1">
                    <div>Pre-filled:</div>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li>{templateData.defaultGoals.length} goals</li>
                      <li>{templateData.defaultInterventions.length} interventions</li>
                    </ul>
                  </div>

                  <div className="mt-3 text-sm font-medium text-[#0f62fe]">Select →</div>
                </button>
              );
            }
          )}

          <button
            onClick={() => handleTemplateSelect('Custom')}
            className="border-2 border-dashed border-carbon-gray-30 p-4 text-left hover:border-[#0f62fe] hover:bg-[#edf5ff] transition-colors"
          >
            <div className="flex items-center gap-2 mb-2">
              <Icon name="SparklesIcon" size={20} className="text-[#0f62fe]" />
              <span className="font-semibold">Custom Plan</span>
            </div>
            <p className="text-xs text-carbon-gray-70 mb-3">Start from scratch</p>
            <div className="mt-3 text-sm font-medium text-[#0f62fe]">Select →</div>
          </button>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-carbon-gray-30 text-sm hover:bg-carbon-gray-10"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Form view
  return (
    <form onSubmit={handleSubmit} className="bg-white border border-carbon-gray-20">
      {/* AI-Generated Plan Header */}
      {generatedPlan && (
        <div className="bg-gradient-to-r from-[#d0e2ff] to-[#edf5ff] border-b border-[#0f62fe] p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <Icon name="SparklesIcon" size={24} className="text-[#0f62fe]" />
              <div>
                <h2 className="text-xl font-semibold text-carbon-gray-100">
                  AI-Generated Comprehensive Care Plan
                </h2>
                <p className="text-sm text-carbon-gray-70 mt-1">
                  Review and edit the auto-generated plan below, then approve to send to all
                  providers
                </p>
              </div>
            </div>
            <div className="px-3 py-1.5 bg-[#0f62fe] text-white text-xs font-semibold rounded">
              STEP 2 OF 3: REVIEW
            </div>
          </div>

          {/* Estimated Impact */}
          <div className="grid grid-cols-3 gap-4 mt-4 p-4 bg-white border border-[#0f62fe] rounded">
            <div>
              <div className="text-xs text-carbon-gray-70 mb-1">RAF Score Improvement</div>
              <div className="text-lg font-semibold text-[#0f62fe]">
                +{generatedPlan.estimatedImpact.rafDelta.toFixed(2)}
              </div>
              <div className="text-2xs text-carbon-gray-70 mt-1">
                Better documentation = Higher reimbursement
              </div>
            </div>
            <div>
              <div className="text-xs text-carbon-gray-70 mb-1">Potential Provider Gainshare</div>
              <div className="text-lg font-semibold text-[#24a148]">
                ${generatedPlan.estimatedImpact.providerGainshare.toLocaleString()}
              </div>
              <div className="text-2xs text-carbon-gray-70 mt-1">
                Quality bonuses + Shared savings
              </div>
            </div>
            <div>
              <div className="text-xs text-carbon-gray-70 mb-1">Quality Gaps Closed</div>
              <div className="text-lg font-semibold text-[#0f62fe]">
                {generatedPlan.estimatedImpact.qualityGapsClosed}
              </div>
              <div className="text-2xs text-carbon-gray-70 mt-1">HEDIS/STARS/MIPS measures</div>
            </div>
          </div>

          {/* Quality Measure Breakdown - Detailed gainshare by measure (Collapsible) */}
          {generatedPlan.estimatedImpact.qualityMeasureBreakdown.length > 0 && (
            <div className="mt-4 p-4 bg-white border border-carbon-gray-20 rounded">
              <button
                type="button"
                onClick={() => setShowGainshare(!showGainshare)}
                className="w-full flex items-center justify-between mb-3 hover:bg-carbon-gray-10 p-2 -m-2 rounded transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Icon name="CurrencyDollarIcon" size={18} className="text-[#24a148]" />
                  <h4 className="text-sm font-semibold text-carbon-gray-100">
                    Gainshare Breakdown by Quality Measure
                  </h4>
                  <span className="text-xs text-carbon-gray-70">
                    ({generatedPlan.estimatedImpact.qualityMeasureBreakdown.length} measures)
                  </span>
                </div>
                <Icon
                  name={showGainshare ? 'ChevronUpIcon' : 'ChevronDownIcon'}
                  size={20}
                  className="text-carbon-gray-70"
                />
              </button>

              {showGainshare && (
                <>
                  <div className="text-xs text-carbon-gray-70 mb-3">
                    Each quality gap closed generates a specific bonus payment based on the program
                    type
                  </div>
                  <div className="space-y-2">
                    {generatedPlan.estimatedImpact.qualityMeasureBreakdown.map((measure, idx) => {
                      // Find the actual goal and intervention objects
                      const linkedGoals = generatedPlan.goals.filter((g) =>
                        measure.relatedGoals.includes(g.id)
                      );
                      const linkedInterventions = generatedPlan.interventions.filter((i) =>
                        measure.relatedInterventions.includes(i.id)
                      );

                      return (
                        <div
                          key={measure.measureId}
                          className="p-3 bg-carbon-gray-10 border border-carbon-gray-20 rounded hover:bg-[#e8f4ff] transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 bg-[#0f62fe] text-white text-2xs font-semibold rounded">
                                  {measure.program}
                                </span>
                                <span className="text-sm font-medium text-carbon-gray-100">
                                  {measure.measureName}
                                </span>
                              </div>
                              <div className="text-xs text-carbon-gray-70 mt-1">
                                Measure ID: {measure.measureId}
                              </div>
                            </div>
                            <div className="text-right ml-4">
                              <div className="text-base font-semibold text-[#24a148]">
                                ${measure.estimatedBonus.toLocaleString()}
                              </div>
                              <div className="text-2xs text-carbon-gray-70">Quality bonus</div>
                            </div>
                          </div>

                          {/* Show linked care plan items */}
                          {(linkedGoals.length > 0 || linkedInterventions.length > 0) && (
                            <div className="mt-3 pt-3 border-t border-carbon-gray-30">
                              <div className="text-2xs font-semibold text-carbon-gray-70 mb-2">
                                Addressed by Care Plan:
                              </div>
                              <div className="space-y-1">
                                {linkedGoals.map((goal) => (
                                  <div key={goal.id} className="flex items-start gap-2 text-xs">
                                    <Icon
                                      name="CheckCircleIcon"
                                      size={14}
                                      className="text-[#0f62fe] mt-0.5 flex-shrink-0"
                                    />
                                    <span className="text-carbon-gray-70">
                                      <span className="font-medium">Goal:</span> {goal.description}
                                    </span>
                                  </div>
                                ))}
                                {linkedInterventions.map((intervention) => (
                                  <div
                                    key={intervention.id}
                                    className="flex items-start gap-2 text-xs"
                                  >
                                    <Icon
                                      name="ArrowRightIcon"
                                      size={14}
                                      className="text-[#24a148] mt-0.5 flex-shrink-0"
                                    />
                                    <span className="text-carbon-gray-70">
                                      <span className="font-medium">{intervention.type}:</span>{' '}
                                      {intervention.description}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 pt-3 border-t border-carbon-gray-20 flex justify-between items-center">
                    <span className="text-sm font-medium text-carbon-gray-100">
                      Total Quality Bonuses:
                    </span>
                    <span className="text-lg font-semibold text-[#24a148]">
                      $
                      {generatedPlan.estimatedImpact.qualityMeasureBreakdown
                        .reduce((sum, m) => sum + m.estimatedBonus, 0)
                        .toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-carbon-gray-70 italic">
                    + RAF shared savings (15% of documentation revenue) = Total Provider Gainshare
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Clinical Summary - Only for generated plans */}
      {generatedPlan && generatedPlan.clinicalSummary && (
        <div className="border-b border-carbon-gray-20 p-5 bg-carbon-gray-10">
          <div className="flex items-center gap-2 mb-4">
            <Icon name="DocumentTextIcon" size={20} className="text-[#0f62fe]" />
            <h3 className="text-lg font-semibold text-carbon-gray-100">Clinical Summary</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            {/* Conditions */}
            {generatedPlan.clinicalSummary.conditions.length > 0 && (
              <div className="bg-white p-3 border border-carbon-gray-20">
                <div className="font-semibold text-carbon-gray-100 mb-2">Patient Conditions:</div>
                <ul className="list-disc list-inside space-y-1 text-carbon-gray-70">
                  {generatedPlan.clinicalSummary.conditions.map((condition, idx) => (
                    <li key={idx}>{condition}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Needs */}
            {generatedPlan.clinicalSummary.needs.length > 0 && (
              <div className="bg-white p-3 border border-carbon-gray-20">
                <div className="font-semibold text-carbon-gray-100 mb-2">Patient Needs:</div>
                <ul className="list-disc list-inside space-y-1 text-carbon-gray-70">
                  {generatedPlan.clinicalSummary.needs.map((need, idx) => (
                    <li key={idx}>{need}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Goals */}
            {generatedPlan.clinicalSummary.goals.length > 0 && (
              <div className="bg-white p-3 border border-carbon-gray-20">
                <div className="font-semibold text-carbon-gray-100 mb-2">Key Goals:</div>
                <ul className="list-disc list-inside space-y-1 text-carbon-gray-70">
                  {generatedPlan.clinicalSummary.goals.map((goal, idx) => (
                    <li key={idx}>{goal}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Interventions */}
            {generatedPlan.clinicalSummary.interventions.length > 0 && (
              <div className="bg-white p-3 border border-carbon-gray-20">
                <div className="font-semibold text-carbon-gray-100 mb-2">Key Interventions:</div>
                <ul className="list-disc list-inside space-y-1 text-carbon-gray-70">
                  {generatedPlan.clinicalSummary.interventions.map((intervention, idx) => (
                    <li key={idx}>{intervention}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Specialist Referrals - Show care team members with network status */}
            {(() => {
              const specialists = generatedPlan.careTeam.filter(
                (member) =>
                  member.relationship === 'Consultant' || member.relationship === 'Specialist'
              );

              if (specialists.length === 0) return null;

              return (
                <div className="bg-white p-3 border border-carbon-gray-20 md:col-span-2">
                  <div className="font-semibold text-carbon-gray-100 mb-3">
                    Specialist Referrals:
                  </div>
                  <div className="space-y-2">
                    {specialists.map((specialist) => {
                      // Determine network badge color
                      const networkColor =
                        specialist.networkTier === 'Preferred'
                          ? 'bg-[#24a148] text-white'
                          : specialist.networkTier === 'In-Network'
                            ? 'bg-[#0f62fe] text-white'
                            : 'bg-[#da1e28] text-white';

                      return (
                        <div
                          key={specialist.id}
                          className="flex items-center justify-between p-2 bg-carbon-gray-10 border border-carbon-gray-20 rounded"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-carbon-gray-100">
                                {specialist.name}
                              </span>
                              <span
                                className={`px-2 py-0.5 text-2xs font-semibold rounded ${networkColor}`}
                              >
                                {specialist.networkTier || 'Out-of-Network'}
                              </span>
                            </div>
                            <div className="text-xs text-carbon-gray-70 mt-1">
                              {specialist.role} • {specialist.phone}
                              {specialist.npi && ` • NPI: ${specialist.npi}`}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      <div className="border-b border-carbon-gray-20 p-5">
        <h2 className="text-xl font-semibold">
          {generatedPlan
            ? 'Review & Edit Care Plan'
            : mode === 'create'
              ? 'Create Care Plan'
              : 'Edit Care Plan'}
          {selectedTemplate && selectedTemplate !== 'Custom' && !generatedPlan && (
            <span className="ml-2 text-sm font-normal text-carbon-gray-70">
              (Template: {selectedTemplate})
            </span>
          )}
        </h2>
      </div>

      <div className="p-5 space-y-6">
        {/* Basic Information */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-carbon-gray-100 mb-1">
              Care Plan Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full px-3 py-2 border border-carbon-gray-30 text-sm focus:outline-none focus:border-[#0f62fe]"
              placeholder="e.g., Hypertension Management"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-carbon-gray-100 mb-1">
              Description *
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={3}
              className="w-full px-3 py-2 border border-carbon-gray-30 text-sm focus:outline-none focus:border-[#0f62fe]"
              placeholder="Describe the purpose and scope of this care plan..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-carbon-gray-100 mb-1">
              Addresses (Conditions/Issues)
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddAddress())}
                className="flex-1 px-3 py-2 border border-carbon-gray-30 text-sm focus:outline-none focus:border-[#0f62fe]"
                placeholder="e.g., I10 - Essential Hypertension"
              />
              <button
                type="button"
                onClick={handleAddAddress}
                className="px-4 py-2 bg-[#0f62fe] text-white text-sm hover:bg-[#0043ce]"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {addresses.map((addr, idx) => (
                <span
                  key={idx}
                  className="px-2 py-1 bg-carbon-gray-10 text-xs flex items-center gap-2"
                >
                  {addr}
                  <button
                    type="button"
                    onClick={() => handleRemoveAddress(idx)}
                    className="text-carbon-gray-70 hover:text-carbon-gray-100"
                  >
                    <Icon name="XMarkIcon" size={12} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Root Cause Banner - Only for holistic plans */}
        {generatedPlan && (generatedPlan as any).rootCauseInsight && (
          <div className="bg-[#fff1f1] border-l-4 border-l-[#da1e28] px-5 py-4 mb-6">
            <div className="flex items-start gap-3">
              <svg
                className="w-6 h-6 text-[#da1e28] flex-shrink-0 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-[#da1e28] mb-2">
                  🎯 Root Cause Identified: Caregiver Burden
                </h3>
                <p className="text-xs text-carbon-gray-70 mb-3">
                  {(generatedPlan as any).rootCauseInsight}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white p-3 border border-carbon-gray-20 rounded">
                    <p className="text-2xs text-carbon-gray-50 mb-1">Caregiver Burden Score</p>
                    <p className="text-xl font-bold text-[#da1e28]">85/100</p>
                    <p className="text-2xs text-carbon-gray-50">CRITICAL</p>
                  </div>
                  <div className="bg-white p-3 border border-carbon-gray-20 rounded">
                    <p className="text-2xs text-carbon-gray-50 mb-1">Success Probability</p>
                    <p className="text-xl font-bold text-[#0f62fe]">
                      {(generatedPlan as any).holisticPlan?.successProbability || 85}%
                    </p>
                    <p className="text-2xs text-carbon-gray-50">With intervention</p>
                  </div>
                </div>
                <div className="mt-3 p-3 bg-[#d0e2ff] border border-[#97c1ff] rounded">
                  <p className="text-xs font-semibold text-[#0043ce] mb-1">
                    ✓ Care plan adapted to address root cause first
                  </p>
                  <p className="text-xs text-carbon-gray-70">
                    Tier 1 interventions focus on respite care and caregiver support. Clinical care
                    gaps will be addressed once foundation is established.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Goals with Interventions (FHIR-aligned) */}
        <div className="border border-carbon-gray-20 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold">Goals & Interventions</h3>
            <button
              type="button"
              onClick={handleAddGoal}
              className="text-sm text-[#0f62fe] hover:text-[#0043ce] font-medium"
            >
              + Add Goal
            </button>
          </div>

          <div className="space-y-4">
            {goals.map((goal, goalIdx) => {
              // Get interventions for this goal
              const goalInterventions = goal.interventions || [];

              return (
                <div key={goal.id} className="border border-carbon-gray-20 p-3 bg-carbon-gray-10">
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-sm font-medium text-[#0f62fe]">Goal {goalIdx + 1}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveGoal(goalIdx)}
                      className="text-carbon-gray-70 hover:text-[#da1e28]"
                    >
                      <Icon name="TrashIcon" size={16} />
                    </button>
                  </div>

                  {/* Goal Fields */}
                  <div className="space-y-2 mb-3">
                    <input
                      type="text"
                      value={goal.description}
                      onChange={(e) => {
                        const newGoals = [...goals];
                        newGoals[goalIdx].description = e.target.value;
                        setGoals(newGoals);
                      }}
                      className="w-full px-2 py-1.5 border border-carbon-gray-30 text-sm bg-white"
                      placeholder="Goal description"
                    />
                    <input
                      type="text"
                      value={goal.target}
                      onChange={(e) => {
                        const newGoals = [...goals];
                        newGoals[goalIdx].target = e.target.value;
                        setGoals(newGoals);
                      }}
                      className="w-full px-2 py-1.5 border border-carbon-gray-30 text-sm bg-white"
                      placeholder="Target (e.g., <140/90 mmHg)"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={goal.dueDate}
                        onChange={(e) => {
                          const newGoals = [...goals];
                          newGoals[goalIdx].dueDate = e.target.value;
                          setGoals(newGoals);
                        }}
                        className="px-2 py-1.5 border border-carbon-gray-30 text-sm bg-white"
                      />
                      <select
                        value={goal.status}
                        onChange={(e) => {
                          const newGoals = [...goals];
                          newGoals[goalIdx].status = e.target.value as any;
                          setGoals(newGoals);
                        }}
                        className="px-2 py-1.5 border border-carbon-gray-30 text-sm bg-white"
                      >
                        <option value="Not Started">Not Started</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Achieved">Achieved</option>
                        <option value="Cancelled">Cancelled</option>
                      </select>
                    </div>
                  </div>

                  {/* Interventions for this Goal */}
                  <div className="border-t border-carbon-gray-30 pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-carbon-gray-70">
                        Interventions to Achieve Goal
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const newGoals = [...goals];
                          if (!newGoals[goalIdx].interventions) {
                            newGoals[goalIdx].interventions = [];
                          }
                          newGoals[goalIdx].interventions!.push({
                            id: `intervention-${Date.now()}`,
                            type: 'Referral',
                            description: '',
                            status: 'Pending',
                          });
                          setGoals(newGoals);
                        }}
                        className="text-xs text-[#0f62fe] hover:text-[#0043ce] font-medium"
                      >
                        + Add Intervention
                      </button>
                    </div>

                    <div className="space-y-2">
                      {goalInterventions.map((intervention, intIdx) => (
                        <div
                          key={intervention.id}
                          className="bg-white border border-carbon-gray-20 p-2 rounded"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <span className="text-xs font-medium text-carbon-gray-70">
                              Intervention {intIdx + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const newGoals = [...goals];
                                newGoals[goalIdx].interventions = newGoals[
                                  goalIdx
                                ].interventions!.filter((_, i) => i !== intIdx);
                                setGoals(newGoals);
                              }}
                              className="text-carbon-gray-70 hover:text-[#da1e28]"
                            >
                              <Icon name="XMarkIcon" size={14} />
                            </button>
                          </div>

                          <div className="space-y-2">
                            <select
                              value={intervention.type}
                              onChange={(e) => {
                                const newGoals = [...goals];
                                newGoals[goalIdx].interventions![intIdx].type = e.target
                                  .value as any;
                                setGoals(newGoals);
                              }}
                              className="w-full px-2 py-1 border border-carbon-gray-30 text-xs"
                            >
                              <option value="Referral">Referral</option>
                              <option value="Monitoring">Monitoring</option>
                              <option value="Appointment">Appointment</option>
                              <option value="Medication">Medication</option>
                              <option value="Education">Education</option>
                              <option value="Procedure">Procedure</option>
                            </select>

                            <input
                              type="text"
                              value={intervention.description}
                              onChange={(e) => {
                                const newGoals = [...goals];
                                newGoals[goalIdx].interventions![intIdx].description =
                                  e.target.value;
                                setGoals(newGoals);
                              }}
                              className="w-full px-2 py-1 border border-carbon-gray-30 text-xs"
                              placeholder="Description"
                            />

                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="text"
                                value={intervention.frequency || ''}
                                onChange={(e) => {
                                  const newGoals = [...goals];
                                  newGoals[goalIdx].interventions![intIdx].frequency =
                                    e.target.value;
                                  setGoals(newGoals);
                                }}
                                className="px-2 py-1 border border-carbon-gray-30 text-xs"
                                placeholder="Frequency"
                              />
                              <select
                                value={intervention.status}
                                onChange={(e) => {
                                  const newGoals = [...goals];
                                  newGoals[goalIdx].interventions![intIdx].status = e.target
                                    .value as any;
                                  setGoals(newGoals);
                                }}
                                className="px-2 py-1 border border-carbon-gray-30 text-xs"
                              >
                                <option value="Pending">Pending</option>
                                <option value="Scheduled">Scheduled</option>
                                <option value="Active">Active</option>
                                <option value="Completed">Completed</option>
                                <option value="Cancelled">Cancelled</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      ))}

                      {goalInterventions.length === 0 && (
                        <p className="text-xs text-carbon-gray-70 text-center py-2 bg-white border border-carbon-gray-20 rounded">
                          No interventions yet. Click &quot;+ Add Intervention&quot; above.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {goals.length === 0 && (
              <p className="text-sm text-carbon-gray-70 text-center py-4">
                No goals added yet. Click &quot;Add Goal&quot; to get started.
              </p>
            )}
          </div>
        </div>

        {/* Share With */}
        <div className="border border-carbon-gray-20 p-4">
          <h3 className="text-base font-semibold mb-3">Share Care Plan With</h3>
          <div className="space-y-2">
            {['Specialist (via FHIR)', 'Patient Portal', 'Care Manager', 'Health Plan'].map(
              (option) => (
                <label key={option} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={shareWith.includes(option)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setShareWith([...shareWith, option]);
                      } else {
                        setShareWith(shareWith.filter((s) => s !== option));
                      }
                    }}
                    className="w-4 h-4"
                  />
                  {option}
                </label>
              )
            )}
          </div>
        </div>
      </div>

      {/* Care Team Preview */}
      {generatedPlan && careTeam.length > 0 && (
        <div className="border-t border-carbon-gray-20 p-5 bg-[#f4f4f4]">
          <h3 className="text-base font-semibold mb-3">Care Team & Distribution Preview</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-xs font-medium text-carbon-gray-70 mb-2">Care Team Members:</p>
              <div className="space-y-1">
                {careTeam.map((member) => (
                  <div key={member.id} className="flex items-center gap-2 text-sm">
                    <Icon name="UserIcon" size={14} className="text-carbon-gray-70" />
                    <span className="font-medium">{member.name}</span>
                    <span className="text-carbon-gray-70 text-xs">({member.role})</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-carbon-gray-70 mb-2">Will be shared with:</p>
              <div className="space-y-1">
                {shareWith.map((recipient, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm">
                    <Icon name="CheckCircleIcon" size={14} className="text-[#24a148]" />
                    <span>{recipient}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="p-3 bg-[#d0e2ff] border border-[#0f62fe] rounded text-sm">
            <div className="flex items-start gap-2">
              <Icon name="InformationCircleIcon" size={16} className="text-[#0f62fe] mt-0.5" />
              <div>
                <span className="font-medium">One-Click Distribution:</span> Clicking &quot;Approve
                & Send&quot; will automatically send this care plan to all {shareWith.length}{' '}
                recipient
                {shareWith.length !== 1 ? 's' : ''} via their preferred channels (FHIR, portal,
                email).
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Form Actions */}
      <div className="border-t border-carbon-gray-20 p-5 flex justify-between items-center">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-carbon-gray-30 text-sm hover:bg-carbon-gray-10"
        >
          Cancel
        </button>

        <div className="flex gap-3">
          {!generatedPlan && (
            <button
              type="button"
              className="px-4 py-2 border border-carbon-gray-30 text-sm hover:bg-carbon-gray-10"
            >
              Save as Draft
            </button>
          )}
          <button
            type="submit"
            className="px-6 py-2 bg-[#0f62fe] text-white text-sm font-semibold hover:bg-[#0043ce] flex items-center gap-2"
          >
            {generatedPlan ? (
              <>
                <Icon name="PaperAirplaneIcon" size={16} />
                Approve & Send to All Providers
              </>
            ) : mode === 'create' ? (
              'Create & Send Care Plan'
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </div>
    </form>
  );
}

// Made with Bob
