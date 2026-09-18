'use client';
import React, { useState } from 'react';
import type { CdsCard, CdsCardType } from '@/lib/smartFhirTypes';
import Icon from '@/components/ui/AppIcon';

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
  const [selectedReason, setSelectedReason] = useState('');
  const cfg = CARD_CONFIG[card.cardType];

  if (card.acknowledged) return null;

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
          {card.detail && (
            <p className="text-xs text-carbon-gray-70 leading-relaxed mb-3">{card.detail}</p>
          )}

          {/* Source */}
          <p className="text-2xs text-carbon-gray-50 mb-3">
            Source: <span className="font-medium">{card.source}</span>
          </p>

          {/* Suggestions */}
          {card.suggestions && card.suggestions.length > 0 && (
            <div className="mb-3 space-y-1.5">
              <p className="text-2xs font-semibold text-carbon-gray-70 uppercase tracking-wide mb-1">
                Suggested Actions
              </p>
              {card.suggestions.map((sug) => (
                <button
                  key={sug.id}
                  onClick={() => onAcceptSuggestion(card.id, sug.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-white border border-carbon-gray-20 hover:border-[#0043ce] hover:bg-[#edf5ff] transition-colors text-left group"
                >
                  <Icon name="PlusCircleIcon" size={14} className="text-[#0043ce] flex-shrink-0" />
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
          {card.links && card.links.length > 0 && (
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
                          setSelectedReason(reason);
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
