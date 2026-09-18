'use client';
import React, { useState } from 'react';
import type { CdsCard, CdsCardType } from '@/lib/smartFhirTypes';
import Icon from '@/components/ui/AppIcon';
import { useGapClosureStore } from '@/lib/patientContext';

interface CdsCardRendererProps {
  cards: CdsCard[];
  onAcceptSuggestion: (cardId: string, suggestionId: string) => void;
  onDismiss: (cardId: string) => void;
  onSnooze: (cardId: string) => void;
  onAcknowledge: (cardId: string, reason: string) => void;
  onOpenSmartLink: (cardId: string, url: string) => void;
}

const CARD_CONFIG: Record<
  CdsCardType,
  {
    bg: string;
    border: string;
    headerBg: string;
    iconColor: string;
    icon: string;
    label: string;
    badgeBg: string;
    badgeText: string;
  }
> = {
  info: {
    bg: 'bg-[#edf5ff]',
    border: 'border-[#97c1ff]',
    headerBg: 'bg-[#d0e2ff]',
    iconColor: 'text-[#0043ce]',
    icon: 'InformationCircleIcon',
    label: 'Informational',
    badgeBg: 'bg-[#d0e2ff]',
    badgeText: 'text-[#0043ce]',
  },
  warning: {
    bg: 'bg-[#fdf6dd]',
    border: 'border-[#f1c21b]',
    headerBg: 'bg-[#fef7c3]',
    iconColor: 'text-[#b45309]',
    icon: 'ExclamationTriangleIcon',
    label: 'Warning',
    badgeBg: 'bg-[#fef7c3]',
    badgeText: 'text-[#b45309]',
  },
  critical: {
    bg: 'bg-[#fff1f1]',
    border: 'border-[#da1e28]',
    headerBg: 'bg-[#ffe0e0]',
    iconColor: 'text-[#da1e28]',
    icon: 'ShieldExclamationIcon',
    label: 'Critical',
    badgeBg: 'bg-[#ffe0e0]',
    badgeText: 'text-[#da1e28]',
  },
  suggestion: {
    bg: 'bg-[#defbe6]',
    border: 'border-[#a7f0ba]',
    headerBg: 'bg-[#c6f6d5]',
    iconColor: 'text-[#0e6027]',
    icon: 'LightBulbIcon',
    label: 'Suggestion',
    badgeBg: 'bg-[#defbe6]',
    badgeText: 'text-[#0e6027]',
  },
  'smart-link': {
    bg: 'bg-[#f6f2ff]',
    border: 'border-[#d4bbff]',
    headerBg: 'bg-[#e8daff]',
    iconColor: 'text-[#6929c4]',
    icon: 'ArrowTopRightOnSquareIcon',
    label: 'Smart Link',
    badgeBg: 'bg-[#e8daff]',
    badgeText: 'text-[#6929c4]',
  },
};

const HOOK_LABELS: Record<string, string> = {
  'patient-view': 'patient-view',
  'encounter-start': 'encounter-start',
  'order-select': 'order-select',
  'order-sign': 'order-sign',
  'care-gap-closure': 'care-gap-closure',
};

// ─── HbA1c Inline Close Workflow ──────────────────────────────────────────────
function HbA1cInlineCloseWorkflow({
  onClose,
  onCancel,
}: {
  onClose: () => void;
  onCancel: () => void;
}) {
  const { submitClosure, isGapClosed } = useGapClosureStore();
  const [dateOfService, setDateOfService] = useState('');
  const [performingProvider, setPerformingProvider] = useState('Bennett County Health PCP');
  const [placeOfService, setPlaceOfService] = useState('Lab');
  const [resultValue, setResultValue] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const hedisCompliance = resultValue ? (parseFloat(resultValue) < 8.0 ? 'MET' : 'NOT_MET') : null;
  const canSubmit = dateOfService && performingProvider && placeOfService && resultValue;

  const handleSubmit = () => {
    if (!canSubmit) return;
    submitClosure({
      gapId: 'CG_MARIA_001',
      status: 'CLOSED',
      closedFrom: 'SMART_LAUNCH',
      dateOfService,
      performingProvider,
      placeOfService,
      procedureCode: '83036',
      resultValue: parseFloat(resultValue),
      resultUnit: '%',
      gainshare: 8100,
      fhirObservationId: `OBS-HBAIC-SMART-${Date.now()}`,
    });
    setSubmitted(true);
    setTimeout(onClose, 1800);
  };

  if (submitted) {
    return (
      <div className="p-4 bg-[#defbe6] border border-[#a7f0ba] space-y-2">
        <div className="flex items-center gap-2">
          <Icon name="CheckCircleIcon" size={18} className="text-[#24a148]" />
          <p className="text-sm font-bold text-[#0e6027]">HbA1c gap closed · HEDIS CDC updated</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-white border border-[#a7f0ba] p-2">
            <p className="text-xs font-bold text-[#24a148]">{resultValue}%</p>
            <p className="text-2xs text-[#0e6027]">A1C Result</p>
          </div>
          <div className="bg-white border border-[#a7f0ba] p-2">
            <p className="text-xs font-bold text-[#24a148]">
              {hedisCompliance === 'MET' ? 'MET ✓' : 'NOT MET'}
            </p>
            <p className="text-2xs text-[#0e6027]">HEDIS CDC</p>
          </div>
          <div className="bg-white border border-[#a7f0ba] p-2">
            <p className="text-xs font-bold text-[#24a148]">$8,100</p>
            <p className="text-2xs text-[#0e6027]">Gainshare</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-white border border-[#f1c21b] space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon name="BeakerIcon" size={14} className="text-[#b45309]" />
        <p className="text-xs font-semibold text-[#b45309]">Close HbA1c Gap — HEDIS CDC Evidence</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-2xs text-carbon-gray-50 block mb-1">
            Date of Service <span className="text-[#da1e28]">*</span>
          </label>
          <input
            type="date"
            value={dateOfService}
            onChange={(e) => setDateOfService(e.target.value)}
            className="w-full border border-carbon-gray-30 px-2 py-1.5 text-xs font-mono text-carbon-gray-100 focus:outline-none focus:border-[#b45309] bg-white"
          />
        </div>
        <div>
          <label className="text-2xs text-carbon-gray-50 block mb-1">
            Place of Service <span className="text-[#da1e28]">*</span>
          </label>
          <select
            value={placeOfService}
            onChange={(e) => setPlaceOfService(e.target.value)}
            className="w-full border border-carbon-gray-30 px-2 py-1.5 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#b45309] bg-white"
          >
            <option value="Lab">Lab</option>
            <option value="Office">Office</option>
            <option value="Home">Home</option>
            <option value="Telehealth">Telehealth</option>
          </select>
        </div>
      </div>

      <div>
        <label className="text-2xs text-carbon-gray-50 block mb-1">
          Performing Provider <span className="text-[#da1e28]">*</span>
        </label>
        <input
          type="text"
          value={performingProvider}
          onChange={(e) => setPerformingProvider(e.target.value)}
          className="w-full border border-carbon-gray-30 px-2 py-1.5 text-xs text-carbon-gray-100 focus:outline-none focus:border-[#b45309] bg-white"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-2xs text-carbon-gray-50 block mb-1">Procedure Code</label>
          <input
            type="text"
            value="83036 · LOINC 4548-4"
            readOnly
            className="w-full border border-carbon-gray-20 px-2 py-1.5 text-xs font-mono text-carbon-gray-50 bg-carbon-gray-10 cursor-not-allowed"
          />
        </div>
        <div>
          <label className="text-2xs text-carbon-gray-50 block mb-1">
            Result Value (%) <span className="text-[#da1e28]">*</span>
          </label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.1"
              min="3"
              max="20"
              value={resultValue}
              onChange={(e) => setResultValue(e.target.value)}
              className="flex-1 border border-carbon-gray-30 px-2 py-1.5 text-xs font-mono text-carbon-gray-100 focus:outline-none focus:border-[#b45309] bg-white"
              placeholder="6.8"
            />
            <span className="text-xs font-semibold text-carbon-gray-70">%</span>
          </div>
        </div>
      </div>

      {/* HEDIS auto-calc */}
      {resultValue && (
        <div
          className={`flex items-center gap-2 p-2 border text-xs ${hedisCompliance === 'MET' ? 'bg-[#defbe6] border-[#a7f0ba] text-[#0e6027]' : 'bg-[#fff1f1] border-[#ffb3b8] text-[#da1e28]'}`}
        >
          <Icon
            name={hedisCompliance === 'MET' ? 'CheckBadgeIcon' : 'ExclamationCircleIcon'}
            size={13}
          />
          <span className="font-semibold">
            HEDIS CDC — {hedisCompliance === 'MET' ? 'COMPLIANT (MET)' : 'NOT MET'}
          </span>
          <span className="text-2xs ml-1">
            {hedisCompliance === 'MET' ? `${resultValue}% < 8.0%` : `${resultValue}% ≥ 8.0%`}
          </span>
          {hedisCompliance === 'MET' && <span className="ml-auto font-bold">$8,100 gainshare</span>}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="flex items-center gap-1.5 px-3 py-2 bg-[#24a148] text-white text-xs font-semibold hover:bg-[#1a7a38] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Icon name="CheckIcon" size={13} />
          Submit Closure
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-2 text-xs text-carbon-gray-70 border border-carbon-gray-20 hover:bg-carbon-gray-10 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function SingleCdsCard({
  card,
  onAcceptSuggestion,
  onDismiss,
  onSnooze,
  onAcknowledge,
  onOpenSmartLink,
}: {
  card: CdsCard;
  onAcceptSuggestion: (cardId: string, suggestionId: string) => void;
  onDismiss: (cardId: string) => void;
  onSnooze: (cardId: string) => void;
  onAcknowledge: (cardId: string, reason: string) => void;
  onOpenSmartLink: (cardId: string, url: string) => void;
}) {
  const [expanded, setExpanded] = useState(card.cardType === 'critical');
  const [showOverrideMenu, setShowOverrideMenu] = useState(false);
  const [showHbA1cWorkflow, setShowHbA1cWorkflow] = useState(false);
  const { isGapClosed } = useGapClosureStore();
  const cfg = CARD_CONFIG[card.cardType];

  const isHbA1cCard = card.id === 'cds-hba1c-001';
  const hbA1cAlreadyClosed = isHbA1cCard && isGapClosed('CG_MARIA_001');

  if (card.acknowledged) return null;

  // If HbA1c gap was closed from another entry point, show closed state
  if (hbA1cAlreadyClosed) {
    return (
      <div className="border border-[#a7f0ba] bg-[#defbe6] overflow-hidden">
        <div className="bg-[#c6f6d5] px-4 py-2.5 flex items-center gap-3">
          <Icon name="CheckCircleIcon" size={16} className="text-[#0e6027]" />
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-2xs font-bold px-1.5 py-0.5 bg-[#defbe6] text-[#0e6027] uppercase tracking-wide">
                CLOSED
              </span>
              <span className="text-2xs text-carbon-gray-50 font-mono">care-gap-closure</span>
            </div>
            <p className="text-sm font-semibold text-[#0e6027]">
              HbA1c gap closed · HEDIS CDC updated · $8,100 attributed
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`border ${cfg.border} ${cfg.bg} overflow-hidden`}>
      {/* Header */}
      <div className={`${cfg.headerBg} px-4 py-2.5 flex items-start gap-3`}>
        <Icon
          name={cfg.icon as any}
          size={16}
          className={`${cfg.iconColor} flex-shrink-0 mt-0.5`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span
              className={`text-2xs font-bold px-1.5 py-0.5 ${cfg.badgeBg} ${cfg.badgeText} uppercase tracking-wide`}
            >
              {cfg.label}
            </span>
            <span className="text-2xs text-carbon-gray-50 font-mono">
              {HOOK_LABELS[card.hookType]}
            </span>
            {card.cardType === 'critical' && (
              <span className="text-2xs font-bold text-[#da1e28] animate-pulse">
                ⚠ MUST ACKNOWLEDGE
              </span>
            )}
            {isHbA1cCard && (
              <span className="text-2xs font-bold text-[#b45309] bg-[#fef7c3] px-1.5 py-0.5">
                38d · HEDIS CDC
              </span>
            )}
          </div>
          <p className={`text-sm font-semibold ${cfg.iconColor} leading-snug`}>{card.summary}</p>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className={`${cfg.iconColor} opacity-60 hover:opacity-100 flex-shrink-0`}
        >
          <Icon name={expanded ? 'ChevronUpIcon' : 'ChevronDownIcon'} size={14} />
        </button>
      </div>

      {/* Body */}
      {expanded && (
        <div className="px-4 py-3">
          {card.detail && !showHbA1cWorkflow && (
            <p className="text-xs text-carbon-gray-70 leading-relaxed mb-3">{card.detail}</p>
          )}

          {/* Source */}
          {!showHbA1cWorkflow && (
            <p className="text-2xs text-carbon-gray-50 mb-3">
              Source: <span className="font-medium">{card.source}</span>
            </p>
          )}

          {/* HbA1c inline close workflow */}
          {isHbA1cCard && showHbA1cWorkflow && (
            <HbA1cInlineCloseWorkflow
              onClose={() => {
                setShowHbA1cWorkflow(false);
                onDismiss(card.id);
              }}
              onCancel={() => setShowHbA1cWorkflow(false)}
            />
          )}

          {/* Suggestions */}
          {!showHbA1cWorkflow && card.suggestions && card.suggestions.length > 0 && (
            <div className="mb-3 space-y-1.5">
              <p className="text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1">
                Suggested Actions
              </p>
              {card.suggestions.map((sug) => (
                <button
                  key={sug.id}
                  onClick={() => {
                    if (isHbA1cCard && sug.id === 'sug-hba1c-close') {
                      setShowHbA1cWorkflow(true);
                    } else {
                      onAcceptSuggestion(card.id, sug.id);
                    }
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-white border border-carbon-gray-20 hover:border-[#0043ce] hover:bg-[#edf5ff] transition-colors text-left group"
                >
                  <Icon
                    name={isHbA1cCard ? 'BeakerIcon' : 'PlusCircleIcon'}
                    size={14}
                    className={
                      isHbA1cCard ? 'text-[#b45309] flex-shrink-0' : 'text-[#0043ce] flex-shrink-0'
                    }
                  />
                  <span className="text-xs font-medium text-carbon-gray-100 group-hover:text-[#0043ce]">
                    {sug.label}
                  </span>
                  <Icon
                    name="ChevronRightIcon"
                    size={12}
                    className="text-carbon-gray-30 ml-auto group-hover:text-[#0043ce]"
                  />
                </button>
              ))}
            </div>
          )}

          {/* Smart links */}
          {!showHbA1cWorkflow && card.links && card.links.length > 0 && (
            <div className="mb-3 space-y-1.5">
              {card.links.map((link, idx) => (
                <button
                  key={`link-${idx}`}
                  onClick={() => onOpenSmartLink(card.id, link.url)}
                  className="flex items-center gap-2 text-xs text-[#6929c4] hover:underline font-medium"
                >
                  <Icon name="ArrowTopRightOnSquareIcon" size={13} />
                  {link.label}
                </button>
              ))}
            </div>
          )}

          {/* Actions */}
          {!showHbA1cWorkflow && (
            <div className="flex items-center gap-2 pt-2 border-t border-current/10 flex-wrap">
              {/* Critical — must acknowledge with reason */}
              {card.cardType === 'critical' && card.overrideReasons && (
                <div className="flex-1">
                  {!showOverrideMenu ? (
                    <button
                      onClick={() => setShowOverrideMenu(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#da1e28] text-white text-xs font-semibold hover:bg-[#b81922] transition-colors"
                    >
                      <Icon name="CheckIcon" size={13} />
                      Acknowledge & Override
                    </button>
                  ) : (
                    <div className="space-y-1.5">
                      <p className="text-2xs font-semibold text-carbon-gray-70">
                        Select override reason:
                      </p>
                      {card.overrideReasons.map((reason) => (
                        <button
                          key={reason}
                          onClick={() => {
                            onAcknowledge(card.id, reason);
                          }}
                          className="block w-full text-left px-3 py-1.5 text-xs bg-white border border-carbon-gray-20 hover:border-[#da1e28] hover:bg-[#fff1f1] transition-colors"
                        >
                          {reason}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Warning — snooze option */}
              {card.cardType === 'warning' && (
                <>
                  <button
                    onClick={() => onSnooze(card.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-carbon-gray-20 text-xs text-carbon-gray-70 hover:border-[#b45309] hover:text-[#b45309] transition-colors"
                  >
                    <Icon name="ClockIcon" size={13} />
                    Snooze 24h
                  </button>
                  <button
                    onClick={() => onDismiss(card.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-carbon-gray-50 hover:text-carbon-gray-100 transition-colors"
                  >
                    Dismiss
                  </button>
                </>
              )}

              {/* Info / suggestion / smart-link — dismissible */}
              {(card.cardType === 'info' ||
                card.cardType === 'suggestion' ||
                card.cardType === 'smart-link') && (
                <button
                  onClick={() => onDismiss(card.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-carbon-gray-50 hover:text-carbon-gray-100 transition-colors ml-auto"
                >
                  <Icon name="XMarkIcon" size={13} />
                  Dismiss
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CdsCardRenderer({
  cards,
  onAcceptSuggestion,
  onDismiss,
  onSnooze,
  onAcknowledge,
  onOpenSmartLink,
}: CdsCardRendererProps) {
  const activeCards = cards.filter((c) => !c.acknowledged);
  const criticalCards = activeCards.filter((c) => c.cardType === 'critical');
  const otherCards = activeCards.filter((c) => c.cardType !== 'critical');

  if (activeCards.length === 0) {
    return (
      <div className="bg-[#defbe6] border border-[#a7f0ba] px-4 py-3 flex items-center gap-2">
        <Icon name="CheckCircleIcon" size={16} className="text-[#0e6027]" />
        <span className="text-sm text-[#0e6027] font-medium">
          No active CDS alerts for this encounter
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Critical cards always first */}
      {criticalCards.map((card) => (
        <SingleCdsCard
          key={card.id}
          card={card}
          onAcceptSuggestion={onAcceptSuggestion}
          onDismiss={onDismiss}
          onSnooze={onSnooze}
          onAcknowledge={onAcknowledge}
          onOpenSmartLink={onOpenSmartLink}
        />
      ))}
      {otherCards.map((card) => (
        <SingleCdsCard
          key={card.id}
          card={card}
          onAcceptSuggestion={onAcceptSuggestion}
          onDismiss={onDismiss}
          onSnooze={onSnooze}
          onAcknowledge={onAcknowledge}
          onOpenSmartLink={onOpenSmartLink}
        />
      ))}
    </div>
  );
}
