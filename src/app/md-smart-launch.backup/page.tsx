'use client';
import React, { useState, useCallback, useRef } from 'react';
import SmartLaunchHandler from './components/SmartLaunchHandler';

import MdSmartSummaryScreen from './components/MdSmartSummaryScreen';
import CdsCardRenderer from './components/CdsCardRenderer';
import OrderEntryModule from './components/OrderEntryModule';
import CareTeamAssignmentModule from './components/CareTeamAssignmentModule';
import CernerReturnFlow from './components/CernerReturnFlow';
import AuditLogPanel, { AuditEvent, AuditEventType } from './components/AuditLogPanel';
import CarePlanPanel from './components/CarePlanPanel';
import ActiveReferralsPanel from './components/ActiveReferralsPanel';
import ComplianceDashboard from './components/ComplianceDashboard';
import SmartErrorBoundary, {
  SmartInlineAlert,
  TokenExpiryBanner,
  type SmartError,
} from './components/SmartErrorBoundary';
import RhtpPlatformHeader from './components/RhtpPlatformHeader';
import type {
  SmartLaunchContext,
  CdsCard,
  MdOrder,
  CareTeamAssignment,
  FhirServiceRequest,
} from '@/lib/smartFhirTypes';
import { mockCdsCards } from '@/lib/smartFhirMockData';
import Icon from '@/components/ui/AppIcon';
import AppLogo from '@/components/ui/AppLogo';
import { useAppContext } from '@/lib/appContext';
import { useDemoStore } from '@/uhg/store/demoStore';
import { resolveFhirToPlatformId, getPatientById } from '@/lib/patientRegistry';

type ActiveTab =
  | 'summary'
  | 'cds'
  | 'orders'
  | 'team'
  | 'careplan'
  | 'referrals'
  | 'return'
  | 'audit'
  | 'compliance';

const TABS: Array<{ key: ActiveTab; label: string; icon: string }> = [
  { key: 'summary', label: 'Patient Summary', icon: 'UserIcon' },
  { key: 'cds', label: 'CDS Alerts', icon: 'BellAlertIcon' },
  { key: 'orders', label: 'Order Entry', icon: 'ClipboardDocumentCheckIcon' },
  { key: 'team', label: 'Care Team', icon: 'UserGroupIcon' },
  { key: 'careplan', label: 'Care Plan', icon: 'ClipboardDocumentListIcon' },
  { key: 'referrals', label: 'Active Referrals', icon: 'ArrowTopRightOnSquareIcon' },
  { key: 'return', label: 'Return to Cerner', icon: 'ArrowRightOnRectangleIcon' },
  { key: 'audit', label: 'Audit Log', icon: 'ShieldCheckIcon' },
  { key: 'compliance', label: 'Compliance', icon: 'DocumentCheckIcon' },
];

let auditSeq = 0;
function makeAuditId(): string {
  auditSeq += 1;
  return `AUD-${Date.now().toString(36).toUpperCase()}-${String(auditSeq).padStart(3, '0')}`;
}

export default function MdSmartLaunchPage() {
  const { entryContext } = useAppContext();
  const setActiveCitizen = useDemoStore((s) => s.setActiveCitizen);
  const [launchReady, setLaunchReady] = useState(false);
  const [launchContext, setLaunchContext] = useState<SmartLaunchContext | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('summary');
  const [cdsCards, setCdsCards] = useState<CdsCard[]>(mockCdsCards);
  const [completedOrders, setCompletedOrders] = useState<MdOrder[]>([]);
  const [confirmedAssignments, setConfirmedAssignments] = useState<CareTeamAssignment[]>([]);
  const [closedGapIds] = useState<string[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);

  // ── Inline error state ────────────────────────────────────────────────────
  const [inlineErrors, setInlineErrors] = useState<SmartError[]>([]);
  const [fhirTimeoutError, setFhirTimeoutError] = useState<SmartError | null>(null);
  const [orderValidationError, setOrderValidationError] = useState<SmartError | null>(null);
  const [missingPatientDataError, setMissingPatientDataError] = useState<SmartError | null>(null);

  const launchContextRef = useRef<SmartLaunchContext | null>(null);

  const dismissInlineError = useCallback((code: string) => {
    setInlineErrors((prev) => prev.filter((e) => e.code !== code));
    if (code === 'FHIR_TIMEOUT') setFhirTimeoutError(null);
    if (code === 'ORDER_VALIDATION_FAILED') setOrderValidationError(null);
    if (code === 'MISSING_PATIENT_DATA') setMissingPatientDataError(null);
  }, []);

  // ── Audit helper ──────────────────────────────────────────────────────────
  const pushAudit = useCallback(
    (
      eventType: AuditEventType,
      action: string,
      details: Record<string, string | number | boolean | undefined>,
      outcome: AuditEvent['outcome'] = 'success',
      ctx?: SmartLaunchContext | null
    ) => {
      const context = ctx ?? launchContextRef.current;
      const event: AuditEvent = {
        id: makeAuditId(),
        eventType,
        timestamp: new Date().toISOString(),
        userId: context?.practitionerId ?? 'unknown',
        userName: context?.practitionerName ?? 'Unknown User',
        patientId: context?.patientId ?? 'unknown',
        encounterId: context?.encounterId ?? 'unknown',
        action,
        details,
        outcome,
      };
      setAuditEvents((prev) => [...prev, event]);
    },
    []
  );

  // ── Launch ────────────────────────────────────────────────────────────────
  const handleLaunchReady = useCallback(
    (ctx: SmartLaunchContext) => {
      launchContextRef.current = ctx;
      setLaunchContext(ctx);
      setLaunchReady(true);

      // Check for missing patient data after launch
      if (!ctx.patientId || ctx.patientId === 'unknown') {
        const err: SmartError = {
          code: 'MISSING_PATIENT_DATA',
          message: 'Patient ID was not returned in the FHIR launch context.',
          detail: 'patientId is null or undefined in SmartLaunchContext',
          timestamp: new Date().toISOString(),
          retryable: true,
        };
        setMissingPatientDataError(err);
        pushAudit(
          'smart-launch',
          'SMART launch completed with missing patient data',
          { patientId: ctx.patientId },
          'failure',
          ctx
        );
        return;
      }

      // ── FHIR ID → Platform ID resolution ──────────────────────────────────
      // Resolve the EHR FHIR patient ID to the platform patient ID
      // and set the global active patient context
      const resolvedPlatformId = resolveFhirToPlatformId(ctx.patientId);
      if (resolvedPlatformId) {
        setActiveCitizen(resolvedPlatformId);
        // Load patient-specific CDS cards from registry
        const registryPatient = getPatientById(resolvedPlatformId);
        if (registryPatient?.cdsCards && registryPatient.cdsCards.length > 0) {
          const patientCdsCards: CdsCard[] = registryPatient.cdsCards.map((c) => ({
            id: c.id,
            hookType: 'patient-view' as const,
            cardType:
              c.indicator === 'critical'
                ? 'critical'
                : c.indicator === 'warning'
                  ? 'warning'
                  : 'info',
            summary: c.summary,
            detail: c.detail,
            source: 'CDS Hooks / Patient Registry',
            indicator: c.indicator,
            timestamp: new Date().toISOString(),
          }));
          setCdsCards(patientCdsCards);
        }
        pushAudit(
          'smart-launch',
          `SMART launch: FHIR ID resolved to platform patient ${resolvedPlatformId}`,
          {
            fhirPatientId: ctx.patientId,
            platformPatientId: resolvedPlatformId,
            patientName: registryPatient?.name ?? 'Unknown',
          },
          'success',
          ctx
        );
      } else {
        // No mapping found — keep default CDS cards, log warning
        pushAudit(
          'smart-launch',
          `SMART launch: FHIR ID ${ctx.patientId} not mapped to platform patient`,
          { fhirPatientId: ctx.patientId },
          'info',
          ctx
        );
      }

      pushAudit(
        'smart-launch',
        'SMART on FHIR launch completed',
        {
          launchToken: ctx.launchToken,
          fhirBaseUrl: ctx.fhirBaseUrl,
          patientName: ctx.patientName,
          encounterType: ctx.encounterType,
          smartAppVersion: '1.0.0',
        },
        'success',
        ctx
      );
    },
    [pushAudit, setActiveCitizen]
  );

  // ── CDS interactions ──────────────────────────────────────────────────────
  const handleAcceptSuggestion = useCallback(
    (cardId: string, suggestionId: string) => {
      const card = cdsCards.find((c) => c.id === cardId);
      setCdsCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, acknowledged: true } : c)));
      pushAudit('cds-suggestion-accepted', `CDS suggestion accepted: ${card?.summary ?? cardId}`, {
        cardId,
        suggestionId,
        cardType: card?.cardType,
        hookType: card?.hookType,
        summary: card?.summary,
      });
    },
    [cdsCards, pushAudit]
  );

  const handleDismiss = useCallback(
    (cardId: string) => {
      const card = cdsCards.find((c) => c.id === cardId);
      setCdsCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, acknowledged: true } : c)));
      pushAudit('cds-card-dismissed', `CDS card dismissed: ${card?.summary ?? cardId}`, {
        cardId,
        cardType: card?.cardType,
        hookType: card?.hookType,
        summary: card?.summary,
      });
    },
    [cdsCards, pushAudit]
  );

  const handleSnooze = useCallback(
    (cardId: string) => {
      const until = new Date(Date.now() + 86400000).toISOString();
      const card = cdsCards.find((c) => c.id === cardId);
      setCdsCards((prev) =>
        prev.map((c) => (c.id === cardId ? { ...c, acknowledged: true, snoozedUntil: until } : c))
      );
      pushAudit('cds-card-snoozed', `CDS card snoozed: ${card?.summary ?? cardId}`, {
        cardId,
        cardType: card?.cardType,
        hookType: card?.hookType,
        summary: card?.summary,
        snoozedUntil: until,
      });
    },
    [cdsCards, pushAudit]
  );

  const handleAcknowledge = useCallback(
    (cardId: string, reason: string) => {
      const card = cdsCards.find((c) => c.id === cardId);
      setCdsCards((prev) =>
        prev.map((c) =>
          c.id === cardId ? { ...c, acknowledged: true, overrideReason: reason } : c
        )
      );
      pushAudit(
        'cds-card-acknowledged',
        `Critical CDS alert acknowledged with override: ${card?.summary ?? cardId}`,
        {
          cardId,
          cardType: card?.cardType,
          hookType: card?.hookType,
          summary: card?.summary,
          overrideReason: reason,
        }
      );
    },
    [cdsCards, pushAudit]
  );

  const handleOpenSmartLink = useCallback((_cardId: string, _url: string) => {
    // In production: open SMART app panel or navigate
  }, []);

  // ── Orders ────────────────────────────────────────────────────────────────
  const handleOrderSigned = useCallback(
    (orders: MdOrder[], _serviceRequests: FhirServiceRequest[]) => {
      // Simulate order validation — flag stat orders without a note
      const invalidOrders = orders.filter((o) => o.priority === 'stat' && !o.note);
      if (invalidOrders.length > 0) {
        const validationErr: SmartError = {
          code: 'ORDER_VALIDATION_FAILED',
          message: `${invalidOrders.length} STAT order${invalidOrders.length > 1 ? 's' : ''} missing required clinical indication note.`,
          detail: `Order IDs: ${invalidOrders.map((o) => o.id).join(', ')}`,
          timestamp: new Date().toISOString(),
          retryable: true,
        };
        setOrderValidationError(validationErr);
        pushAudit(
          'order-signed',
          `Order validation failed: ${invalidOrders.length} order(s) missing required fields`,
          { orderCount: orders.length, invalidCount: invalidOrders.length },
          'failure'
        );
        return;
      }

      setOrderValidationError(null);
      setCompletedOrders(orders);
      pushAudit(
        'order-signed',
        `${orders.length} order${orders.length !== 1 ? 's' : ''} signed and submitted to Cerner`,
        {
          orderCount: orders.length,
          orderIds: orders.map((o) => o.id).join(', '),
          orderDisplays: orders.map((o) => o.display).join(' | '),
          categories: [...new Set(orders.map((o) => o.category))].join(', '),
          priorities: [...new Set(orders.map((o) => o.priority))].join(', '),
          fhirResourceType: 'ServiceRequest',
        }
      );
      setTimeout(() => setActiveTab('return'), 1500);
    },
    [pushAudit]
  );

  // ── Team assignment ───────────────────────────────────────────────────────
  const handleAssignmentConfirmed = useCallback(
    (assignments: CareTeamAssignment[]) => {
      setConfirmedAssignments(assignments);
      pushAudit(
        'team-assignment-confirmed',
        `Care team assignment confirmed: ${assignments.length} provider${assignments.length !== 1 ? 's' : ''} assigned`,
        {
          assignmentCount: assignments.length,
          assignmentIds: assignments.map((a) => a.id).join(', '),
          providerNames: assignments.map((a) => a.providerName).join(' | '),
          specialties: assignments.map((a) => a.specialty).join(' | '),
          networkTiers: assignments.map((a) => a.networkTier).join(' | '),
          fhirResourceType: 'ServiceRequest',
        }
      );
      setTimeout(() => setActiveTab('return'), 1500);
    },
    [pushAudit]
  );

  // ── Cerner return ─────────────────────────────────────────────────────────
  const handleReturnInitiated = useCallback(() => {
    pushAudit(
      'cerner-return-initiated',
      'Return to Cerner initiated — encounter handoff complete',
      {
        completedOrderCount: completedOrders.length,
        confirmedAssignmentCount: confirmedAssignments.length,
        closedGapCount: closedGapIds.length,
        handoffTarget: 'Cerner PowerChart',
      }
    );
  }, [pushAudit, completedOrders, confirmedAssignments, closedGapIds]);

  // ── Token re-auth ─────────────────────────────────────────────────────────
  const handleReauth = useCallback(() => {
    pushAudit('smart-launch', 'Re-authentication initiated due to token expiry', {}, 'info');
    // In production: trigger OAuth re-auth flow
    setLaunchReady(false);
    setLaunchContext(null);
  }, [pushAudit]);

  const activeCdsCount = cdsCards.filter((c) => !c.acknowledged).length;
  const criticalCdsCount = cdsCards.filter(
    (c) => !c.acknowledged && c.cardType === 'critical'
  ).length;
  const activeReferralsCount =
    completedOrders.filter((o) => o.category === 'referral').length + confirmedAssignments.length;

  // Show launch handler if not ready
  if (!launchReady || !launchContext) {
    return (
      <SmartErrorBoundary
        errorCode="SMART_LAUNCH_FAILED"
        onReturnToCerner={() => (window.location.href = '/')}
      >
        <SmartLaunchHandler onLaunchReady={handleLaunchReady} />
      </SmartErrorBoundary>
    );
  }

  // Token expiry: simulate 30-min session from launch timestamp
  const tokenExpiry = launchContext.tokenExpiry ?? Date.now() + 30 * 60 * 1000;

  return (
    <SmartErrorBoundary
      errorCode="UNKNOWN_ERROR"
      onRetry={() => setLaunchReady(false)}
      onReturnToCerner={() => (window.location.href = '/')}
    >
      <div className="flex h-screen overflow-hidden bg-carbon-gray-10">
        {/* Slim sidebar — MD context */}
        <aside className="w-14 bg-carbon-sidebar flex flex-col flex-shrink-0">
          <div className="flex items-center justify-center py-4 border-b border-carbon-gray-80">
            <AppLogo size={26} />
          </div>
          <nav className="flex-1 flex flex-col items-center py-4 gap-1">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              const hasBadge = tab.key === 'cds' && activeCdsCount > 0;
              const isCritical = tab.key === 'cds' && criticalCdsCount > 0;
              const hasAuditBadge = tab.key === 'audit' && auditEvents.length > 0;
              const hasReferralBadge = tab.key === 'referrals' && activeReferralsCount > 0;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  title={tab.label}
                  className={`relative w-10 h-10 flex items-center justify-center transition-colors ${
                    isActive
                      ? 'bg-[#6929c4] text-white'
                      : 'text-carbon-gray-50 hover:text-white hover:bg-carbon-gray-80'
                  }`}
                >
                  <Icon name={tab.icon as any} size={18} />
                  {hasBadge && (
                    <span
                      className={`absolute top-1 right-1 w-2 h-2 rounded-full ${isCritical ? 'bg-[#da1e28]' : 'bg-[#f1c21b]'}`}
                    />
                  )}
                  {hasAuditBadge && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#6929c4]" />
                  )}
                  {hasReferralBadge && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#24a148]" />
                  )}
                </button>
              );
            })}
          </nav>
          {/* Cerner badge */}
          <div className="pb-4 flex flex-col items-center gap-2">
            <div
              className="w-8 h-8 bg-[#6929c4]/20 border border-[#6929c4]/40 flex items-center justify-center"
              title="SMART on FHIR Active"
            >
              <Icon name="BoltIcon" size={14} className="text-[#a56eff]" />
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Token expiry banner — top of everything */}
          <TokenExpiryBanner tokenExpiry={tokenExpiry} onReauth={handleReauth} />

          {/* RHTP Platform Header */}
          <RhtpPlatformHeader launchContext={launchContext} />

          {/* Top bar */}
          <header className="bg-white border-b border-carbon-gray-20 px-5 h-14 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-2xs font-bold px-2 py-1 bg-[#f6f2ff] text-[#6929c4] border border-[#d4bbff]">
                  ⚡ SMART on FHIR
                </span>
                <span className="text-2xs text-carbon-gray-50">Cerner PowerChart</span>
              </div>
              <div className="w-px h-4 bg-carbon-gray-20" />
              <div>
                <p className="text-sm font-semibold text-carbon-gray-100">
                  {TABS.find((t) => t.key === activeTab)?.label}
                </p>
                <p className="text-2xs text-carbon-gray-50">
                  {launchContext.practitionerName} · Enc:{' '}
                  <span className="font-mono">{launchContext.encounterId}</span>
                </p>
              </div>
            </div>

            {/* Tab nav in header */}
            <div className="flex items-center gap-0.5">
              {TABS.map((tab) => {
                const isActive = activeTab === tab.key;
                const hasBadge = tab.key === 'cds' && activeCdsCount > 0;
                const isCritical = tab.key === 'cds' && criticalCdsCount > 0;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-[#6929c4] text-white'
                        : 'text-carbon-gray-70 hover:bg-carbon-gray-10 hover:text-carbon-gray-100'
                    }`}
                  >
                    <Icon name={tab.icon as any} size={13} />
                    <span className="hidden md:inline">{tab.label}</span>
                    {hasBadge && (
                      <span
                        className={`text-2xs font-bold px-1 min-w-[16px] text-center ${isCritical ? 'bg-[#da1e28] text-white' : 'bg-[#f1c21b] text-[#b45309]'}`}
                      >
                        {activeCdsCount}
                      </span>
                    )}
                    {tab.key === 'referrals' && activeReferralsCount > 0 && (
                      <span className="text-2xs font-bold px-1 min-w-[16px] text-center bg-[#24a148] text-white">
                        {activeReferralsCount}
                      </span>
                    )}
                    {tab.key === 'audit' && auditEvents.length > 0 && (
                      <span className="text-2xs font-bold px-1 min-w-[16px] text-center bg-[#6929c4]/20 text-[#6929c4]">
                        {auditEvents.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </header>

          {/* Content area */}
          <main className="flex-1 overflow-y-auto p-5">
            {/* CDS critical banner — always visible */}
            {criticalCdsCount > 0 && activeTab !== 'cds' && (
              <div
                className="bg-[#da1e28] text-white px-4 py-2.5 mb-4 flex items-center gap-3 cursor-pointer hover:bg-[#b81922] transition-colors"
                onClick={() => setActiveTab('cds')}
              >
                <Icon name="ShieldExclamationIcon" size={16} />
                <span className="text-sm font-semibold">
                  {criticalCdsCount} critical CDS alert{criticalCdsCount !== 1 ? 's' : ''} require
                  acknowledgment before signing orders
                </span>
                <Icon name="ChevronRightIcon" size={14} className="ml-auto" />
              </div>
            )}

            {/* ── Inline error alerts ─────────────────────────────────────── */}
            {missingPatientDataError && (
              <SmartInlineAlert
                error={missingPatientDataError}
                onDismiss={() => dismissInlineError('MISSING_PATIENT_DATA')}
                onRetry={() => {
                  setLaunchReady(false);
                  setLaunchContext(null);
                }}
                className="mb-4"
              />
            )}

            {fhirTimeoutError && (
              <SmartInlineAlert
                error={fhirTimeoutError}
                onDismiss={() => dismissInlineError('FHIR_TIMEOUT')}
                onRetry={() => dismissInlineError('FHIR_TIMEOUT')}
                className="mb-4"
              />
            )}

            {orderValidationError && activeTab === 'orders' && (
              <SmartInlineAlert
                error={orderValidationError}
                onDismiss={() => dismissInlineError('ORDER_VALIDATION_FAILED')}
                onRetry={() => dismissInlineError('ORDER_VALIDATION_FAILED')}
                className="mb-4"
              />
            )}

            {inlineErrors.map((err) => (
              <SmartInlineAlert
                key={err.code}
                error={err}
                onDismiss={() => dismissInlineError(err.code)}
                className="mb-4"
              />
            ))}

            {activeTab === 'summary' && (
              <SmartErrorBoundary
                errorCode="MISSING_PATIENT_DATA"
                onRetry={() => setLaunchReady(false)}
              >
                <div className="h-[calc(100vh-8rem)] -m-5">
                  <MdSmartSummaryScreen
                    launchContext={launchContext}
                    cdsCards={cdsCards}
                    onAuditEntry={(action, details) => pushAudit('smart-launch', action, details)}
                    onOpenOrderEntry={() => setActiveTab('orders')}
                  />
                </div>
              </SmartErrorBoundary>
            )}

            {activeTab === 'cds' && (
              <SmartErrorBoundary errorCode="FHIR_TIMEOUT">
                <div className="max-w-3xl">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-semibold text-carbon-gray-100">
                        CDS Hooks Alerts
                      </h2>
                      <p className="text-xs text-carbon-gray-50 mt-0.5">
                        {activeCdsCount} active · {cdsCards.filter((c) => c.acknowledged).length}{' '}
                        acknowledged
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-2xs text-carbon-gray-50">
                      {(
                        [
                          'patient-view',
                          'encounter-start',
                          'order-select',
                          'order-sign',
                          'care-gap-closure',
                        ] as const
                      ).map((hook) => {
                        const count = cdsCards.filter(
                          (c) => c.hookType === hook && !c.acknowledged
                        ).length;
                        return count > 0 ? (
                          <span
                            key={hook}
                            className="px-2 py-0.5 bg-carbon-gray-10 border border-carbon-gray-20 font-mono"
                          >
                            {hook}: {count}
                          </span>
                        ) : null;
                      })}
                    </div>
                  </div>
                  <CdsCardRenderer
                    cards={cdsCards}
                    onAcceptSuggestion={handleAcceptSuggestion}
                    onDismiss={handleDismiss}
                    onSnooze={handleSnooze}
                    onAcknowledge={handleAcknowledge}
                    onOpenSmartLink={handleOpenSmartLink}
                  />
                </div>
              </SmartErrorBoundary>
            )}

            {activeTab === 'orders' && (
              <SmartErrorBoundary errorCode="ORDER_VALIDATION_FAILED">
                <div className="max-w-4xl">
                  <OrderEntryModule
                    patientId={launchContext.patientId}
                    encounterId={launchContext.encounterId}
                    practitionerId={launchContext.practitionerId}
                    onOrderSigned={handleOrderSigned}
                  />
                </div>
              </SmartErrorBoundary>
            )}

            {activeTab === 'team' && (
              <SmartErrorBoundary errorCode="FHIR_TIMEOUT">
                <div className="max-w-2xl">
                  <CareTeamAssignmentModule
                    patientId={launchContext.patientId}
                    encounterId={launchContext.encounterId}
                    onAssignmentConfirmed={handleAssignmentConfirmed}
                  />
                </div>
              </SmartErrorBoundary>
            )}

            {activeTab === 'careplan' && (
              <SmartErrorBoundary errorCode="MISSING_PATIENT_DATA">
                <div className="max-w-4xl">
                  <CarePlanPanel
                    launchContext={launchContext}
                    completedOrders={completedOrders}
                    confirmedAssignments={confirmedAssignments}
                  />
                </div>
              </SmartErrorBoundary>
            )}

            {activeTab === 'referrals' && (
              <SmartErrorBoundary errorCode="FHIR_TIMEOUT">
                <div className="max-w-4xl">
                  <ActiveReferralsPanel
                    launchContext={launchContext}
                    completedOrders={completedOrders}
                    confirmedAssignments={confirmedAssignments}
                  />
                </div>
              </SmartErrorBoundary>
            )}

            {activeTab === 'return' && (
              <SmartErrorBoundary errorCode="SMART_LAUNCH_FAILED">
                <div className="max-w-xl">
                  <CernerReturnFlow
                    launchContext={launchContext}
                    completedOrders={completedOrders}
                    confirmedAssignments={confirmedAssignments}
                    closedGapIds={closedGapIds}
                    onReturnInitiated={handleReturnInitiated}
                  />
                </div>
              </SmartErrorBoundary>
            )}

            {activeTab === 'audit' && (
              <div className="h-[calc(100vh-8rem)]">
                <AuditLogPanel events={auditEvents} />
              </div>
            )}

            {activeTab === 'compliance' && (
              <SmartErrorBoundary errorCode="UNKNOWN_ERROR">
                <div className="max-w-4xl">
                  <ComplianceDashboard launchContext={launchContext} />
                </div>
              </SmartErrorBoundary>
            )}
          </main>
        </div>
      </div>
    </SmartErrorBoundary>
  );
}
