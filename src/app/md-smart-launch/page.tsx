'use client';
/**
 * MD SmartApp — Cerner PowerChart-style clinical visit workflow.
 *
 * Launched from Cerner via CDS Hooks → SMART on FHIR. Persistent patient
 * banner + left chart Menu + Provider View workflow MPage. All clinical
 * content is FHIR R4 (mock fixtures or live HAPI via the same client).
 * VBC features (quality, CDI/HCC, compliance) retained under the Menu.
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import SmartLaunchHandler from './components/SmartLaunchHandler';
import CdsCardRenderer from './components/CdsCardRenderer';
import OrderEntryModule from './components/OrderEntryModule';
import CareTeamAssignmentModule from './components/CareTeamAssignmentModule';
import CernerReturnFlow from './components/CernerReturnFlow';
import AuditLogPanel, { AuditEvent, AuditEventType } from './components/AuditLogPanel';
import CarePlanPanel from './components/CarePlanPanel';
import ActiveReferralsPanel from './components/ActiveReferralsPanel';
import ComplianceDashboard from './components/ComplianceDashboard';
import GapClosureMetricsPanel from './components/GapClosureMetricsPanel';
import SdohGapPanel from './components/SdohGapPanel';
import MdPatientSummary from './components/MdPatientSummary';
import FhirResourceViewer from './components/FhirResourceViewer';
import SmartErrorBoundary, { TokenExpiryBanner } from './components/SmartErrorBoundary';
import PatientBanner from './components/cerner/PatientBanner';
import CernerMenu, { type MenuKey } from './components/cerner/CernerMenu';
import ProviderViewReview from './components/cerner/ProviderViewReview';
import ProviderViewAct, { type DerivedGap } from './components/cerner/ProviderViewAct';
import ProviderViewDocument from './components/cerner/ProviderViewDocument';
import {
  ResultsReviewPage,
  MedicationListPage,
  ProblemsPage,
  AllergiesPage,
  VitalsPage,
  DocumentationPage,
  HistoriesPage,
  ImmunizationsPage,
  CarePlanFhirPage,
} from './components/cerner/ChartPages';
import type {
  SmartLaunchContext,
  CdsCard,
  MdOrder,
  CareTeamAssignment,
  FhirServiceRequest,
} from '@/lib/smartFhirTypes';
import { mockCdsCards, buildCdsCardsForMember } from '@/lib/smartFhirMockData';
import { useAppContext } from '@/lib/appContext';
import { useFhirModeSync } from '@/lib/hooks/useFhirModeSync';
import { useDataModeFromUrl } from '@/lib/hooks/useDataModeFromUrl';
import { getFhirClient, getFhirMockMode } from '@/lib/services/fhirClient';
import { invokePatientViewHook } from '@/lib/fhir/cdsHooks';
import { resolveIds } from './lib/resolveIds';
import { useCdsFlagsEffect } from './hooks/useCdsFlagsEffect';
import AppLayout from '@/components/AppLayout';

let auditSeq = 0;
function makeAuditId(): string {
  auditSeq += 1;
  return `AUD-${Date.now().toString(36).toUpperCase()}-${String(auditSeq).padStart(3, '0')}`;
}

interface ViewerTarget {
  resourceType: string;
  resourceId: string;
  label: string;
}

export default function MdSmartLaunchPage() {
  const router = useRouter();
  const { useMockData, setUseMockData } = useAppContext();

  // Inherit data mode from RHTP platform (?dataMode=mock|live) before the
  // launch sequence fires. Must run before useFhirModeSync().
  useDataModeFromUrl();
  useFhirModeSync();

  const [launchReady, setLaunchReady] = useState(false);
  const [launchContext, setLaunchContext] = useState<SmartLaunchContext | null>(null);
  const [activeMenu, setActiveMenu] = useState<MenuKey>('provider-view');
  const [cdsCards, setCdsCards] = useState<CdsCard[]>(mockCdsCards);
  const [cdsPanelOpen, setCdsPanelOpen] = useState(false);
  const [completedOrders, setCompletedOrders] = useState<MdOrder[]>([]);
  const [confirmedAssignments, setConfirmedAssignments] = useState<CareTeamAssignment[]>([]);
  const [closedGapIds, setClosedGapIds] = useState<string[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [sessionActions, setSessionActions] = useState<string[]>([]);
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});
  const [viewer, setViewer] = useState<ViewerTarget | null>(null);

  const launchContextRef = useRef<SmartLaunchContext | null>(null);

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

  const addSessionAction = useCallback((text: string) => {
    setSessionActions((prev) => [...prev, text]);
  }, []);

  // ── Launch ────────────────────────────────────────────────────────────────
  const handleLaunchReady = useCallback(
    (ctx: SmartLaunchContext) => {
      launchContextRef.current = ctx;
      setLaunchContext(ctx);
      setLaunchReady(true);
      pushAudit(
        'smart-launch',
        'SMART on FHIR launch completed',
        {
          fhirBaseUrl: ctx.fhirBaseUrl,
          patientId: ctx.patientId,
          encounterId: ctx.encounterId,
          practitionerName: ctx.practitionerName,
          smartAppVersion: '2.0.0-cerner',
        },
        'success',
        ctx
      );
    },
    [pushAudit]
  );

  // ── FHIR AuditEvent for CDS interactions (live mode) ──────────────────────
  const postCdsAuditEvent = useCallback(
    (action: string, subtype: string, cardSummary: string, detail?: string) => {
      if (getFhirMockMode()) return;
      getFhirClient()
        .create({
          resourceType: 'AuditEvent',
          type: {
            system: 'http://terminology.hl7.org/CodeSystem/audit-event-type',
            code: 'rest',
            display: 'RESTful Operation',
          },
          subtype: [
            { system: 'http://hl7.org/fhir/restful-interaction', code: subtype, display: subtype },
          ],
          action: 'E',
          recorded: new Date().toISOString(),
          outcome: '0',
          agent: [
            { who: { display: launchContext?.practitionerName ?? 'Unknown' }, requestor: true },
          ],
          source: { observer: { display: 'MD-SMART-CDS' } },
          entity: [
            {
              what: { display: cardSummary },
              type: { code: '4', display: 'Other' },
              detail: detail ? [{ type: 'cds-action', valueBase64Binary: btoa(detail) }] : [],
            },
          ],
        })
        .catch((err) => console.warn('[AuditEvent] CDS audit POST failed:', err));
    },
    [launchContext]
  );

  // ── CDS interactions ──────────────────────────────────────────────────────
  const handleAcceptSuggestion = useCallback(
    (cardId: string, suggestionId: string) => {
      const card = cdsCards.find((c) => c.id === cardId);
      setCdsCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, acknowledged: true } : c)));
      pushAudit('cds-suggestion-accepted', `CDS suggestion accepted: ${card?.summary ?? cardId}`, {
        cardId,
        suggestionId,
        summary: card?.summary,
      });
      postCdsAuditEvent('accept', 'create', card?.summary ?? cardId, `suggestion:${suggestionId}`);
      addSessionAction(`CDS suggestion accepted — ${card?.summary ?? cardId}`);
    },
    [cdsCards, pushAudit, postCdsAuditEvent, addSessionAction]
  );

  const handleDismiss = useCallback(
    (cardId: string) => {
      const card = cdsCards.find((c) => c.id === cardId);
      setCdsCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, acknowledged: true } : c)));
      pushAudit('cds-card-dismissed', `CDS card dismissed: ${card?.summary ?? cardId}`, {
        cardId,
        summary: card?.summary,
      });
      postCdsAuditEvent('dismiss', 'delete', card?.summary ?? cardId);
    },
    [cdsCards, pushAudit, postCdsAuditEvent]
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
        snoozedUntil: until,
      });
      postCdsAuditEvent('snooze', 'patch', card?.summary ?? cardId, `until:${until}`);
    },
    [cdsCards, pushAudit, postCdsAuditEvent]
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
        { cardId, overrideReason: reason }
      );
      postCdsAuditEvent(
        'acknowledge-override',
        'update',
        card?.summary ?? cardId,
        `override-reason:${reason}`
      );
    },
    [cdsCards, pushAudit, postCdsAuditEvent]
  );

  // ── Chart review actions ──────────────────────────────────────────────────
  const handleMarkReviewed = useCallback(
    (what: string, resourceIds: string[]) => {
      const key = what.toLowerCase().includes('problem')
        ? 'problems'
        : what.toLowerCase().includes('medication')
          ? 'medications'
          : 'results';
      setReviewed((prev) => ({ ...prev, [key]: true }));
      pushAudit('patient-chart-viewed', `${what} reviewed`, {
        resourceCount: resourceIds.length,
        resourceIds: resourceIds.join(', '),
      });
      addSessionAction(`${what} reviewed (${resourceIds.length} resources)`);
    },
    [pushAudit, addSessionAction]
  );

  const handleCloseGap = useCallback(
    (gap: DerivedGap) => {
      setClosedGapIds((prev) => [...prev, gap.id]);
      pushAudit('care-gap-closed', `Care gap addressed: ${gap.name}`, {
        gapId: gap.id,
        program: gap.program,
        measure: gap.measure,
        evidence: gap.evidence,
      });
      addSessionAction(`Care gap addressed — ${gap.name} (${gap.program} ${gap.measure})`);
    },
    [pushAudit, addSessionAction]
  );

  const handleWriteComplete = useCallback(
    (kind: 'note' | 'order' | 'referral', display: string, resourceId: string) => {
      const labels = {
        note: 'DocumentReference',
        order: 'ServiceRequest',
        referral: 'ServiceRequest (referral)',
      } as const;
      pushAudit('order-signed', `${display} → FHIR ${labels[kind]} created`, {
        resourceId,
        fhirResourceType: labels[kind],
      });
      addSessionAction(`${display} → ${labels[kind]}/${resourceId}`);
    },
    [pushAudit, addSessionAction]
  );

  // ── Point-of-care clinical writes ─────────────────────────────────────────
  const handleClinicalWrite = useCallback(
    (
      kind: 'condition-added' | 'allergy-added' | 'medication-added',
      display: string,
      resourceId: string
    ) => {
      const fhirTypes = {
        'condition-added': 'Condition',
        'allergy-added': 'AllergyIntolerance',
        'medication-added': 'MedicationRequest',
      } as const;
      pushAudit(kind, `${display} added to patient record`, {
        resourceId,
        fhirResourceType: fhirTypes[kind],
        dateOfService: new Date().toISOString().slice(0, 10),
        attendingPhysician: launchContext?.practitionerName ?? 'Unknown',
        attendingId: launchContext?.practitionerId ?? 'unknown',
      });
      addSessionAction(`${display} → ${fhirTypes[kind]}/${resourceId}`);
    },
    [pushAudit, addSessionAction, launchContext]
  );

  // ── Legacy order module ───────────────────────────────────────────────────
  const handleOrderSigned = useCallback(
    (orders: MdOrder[], _serviceRequests: FhirServiceRequest[]) => {
      setCompletedOrders(orders);
      pushAudit('order-signed', `${orders.length} order(s) signed and submitted to Cerner`, {
        orderCount: orders.length,
        orderDisplays: orders.map((o) => o.display).join(' | '),
      });
      orders.forEach((o) => addSessionAction(`Order signed — ${o.display}`));
    },
    [pushAudit, addSessionAction]
  );

  const handleAssignmentConfirmed = useCallback(
    (assignments: CareTeamAssignment[]) => {
      setConfirmedAssignments(assignments);
      pushAudit(
        'team-assignment-confirmed',
        `Care team assignment confirmed: ${assignments.length} provider(s)`,
        {
          assignmentCount: assignments.length,
          providerNames: assignments.map((a) => a.providerName).join(' | '),
        }
      );
      assignments.forEach((a) =>
        addSessionAction(`Care team — ${a.providerName} (${a.specialty})`)
      );
    },
    [pushAudit, addSessionAction]
  );

  const handleReturnInitiated = useCallback(
    (payload: { patientId?: string }) => {
      pushAudit(
        'cerner-return-initiated',
        'Return to Cerner initiated — encounter handoff complete',
        {
          completedOrderCount: completedOrders.length,
          closedGapCount: closedGapIds.length,
          sessionActionCount: sessionActions.length,
          returnPatientId: payload?.patientId,
        }
      );
    },
    [pushAudit, completedOrders, closedGapIds, sessionActions]
  );

  const handleReauth = useCallback(() => {
    pushAudit('smart-launch', 'Re-authentication initiated due to token expiry', {}, 'info');
    setLaunchReady(false);
    setLaunchContext(null);
  }, [pushAudit]);

  const openResource = useCallback((resourceType: string, resourceId: string, label: string) => {
    setViewer({ resourceType, resourceId, label });
  }, []);

  // ── CDS cards: layered fallback ───────────────────────
  // Layer 1 (default): each launched member shows their OWN registry-derived
  // cards (care gaps / BH / RAF); Maria keeps her authored mockCdsCards. A member
  // never shows another member's cards under their name.
  useEffect(() => {
    if (!launchReady || !launchContext?.patientId) return;
    setCdsCards(buildCdsCardsForMember(launchContext.patientId.replace(/^patient\//, '')));
  }, [launchReady, launchContext]);
  // Layer 2 (override): non-Maria members with live FHIR Flags get flag-derived
  // cards instead — only when such flags exist, else Layer 1 stands.
  useCdsFlagsEffect({ launchReady, launchContext, useMockData, setCdsCards });

  // ── Live CDS Hooks invocation (patient-view) with demo-card fallback ──────
  useEffect(() => {
    if (!launchReady || !launchContext || useMockData) return;
    let cancelled = false;
    const ids = resolveIds(launchContext, false);
    invokePatientViewHook(
      ids.patientId,
      ids.encounterId,
      launchContext.practitionerId,
      launchContext.fhirBaseUrl
    ).then((liveCards) => {
      if (!cancelled && liveCards) {
        setCdsCards(liveCards);
        pushAudit('smart-launch', 'CDS Hooks patient-view invoked — live cards received', {
          cardCount: liveCards.length,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [launchReady, launchContext, useMockData, pushAudit]);

  // ── Launch gate (inside RHTP chrome so the platform menu stays visible) ───
  if (!launchReady || !launchContext) {
    return (
      <AppLayout pageTitle="MD Smart Launch">
        <SmartErrorBoundary
          errorCode="SMART_LAUNCH_FAILED"
          onReturnToCerner={() => (window.location.href = '/')}
        >
          <SmartLaunchHandler onLaunchReady={handleLaunchReady} />
        </SmartErrorBoundary>
      </AppLayout>
    );
  }

  const { patientId, encounterId } = resolveIds(launchContext, useMockData);
  const tokenExpiry = launchContext.tokenExpiry ?? Date.now() + 30 * 60 * 1000;
  const activeCdsCount = cdsCards.filter((c) => !c.acknowledged).length;

  // Visit progress rail state
  const steps = [
    { label: 'Review', done: !!(reviewed.problems || reviewed.medications || reviewed.results) },
    { label: 'Document', done: sessionActions.some((a) => a.includes('DocumentReference')) },
    {
      label: 'Order',
      done: sessionActions.some((a) => a.includes('ServiceRequest')) || completedOrders.length > 0,
    },
    { label: 'Sign', done: false },
  ];

  const pageProps = { patientId, onOpenResource: openResource };

  return (
    <AppLayout pageTitle="MD Smart Launch">
      <SmartErrorBoundary
        errorCode="UNKNOWN_ERROR"
        onRetry={() => setLaunchReady(false)}
        onReturnToCerner={() => (window.location.href = '/')}
      >
        {/* Full-bleed inside AppLayout's padded content area */}
        <div className="-mx-6 lg:-mx-8 xl:-mx-10 -my-6">
          <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden bg-[#dfe4e8]">
            <TokenExpiryBanner tokenExpiry={tokenExpiry} onReauth={handleReauth} />

            {/* ── App bar ── */}
            <header className="bg-[#1d3346] text-white px-3 h-9 flex items-center justify-between shrink-0 text-[12px]">
              <div className="flex items-center gap-3">
                <span className="font-bold tracking-wide">MD SmartApp</span>
                <span className="text-white/60 hidden sm:inline">
                  SMART on FHIR · launched from Cerner PowerChart
                </span>
              </div>
              <div className="flex items-center gap-2">
                {/* Visit progress rail */}
                <div className="hidden md:flex items-center gap-1 mr-2">
                  {steps.map((s, i) => (
                    <React.Fragment key={s.label}>
                      {i > 0 && <span className="text-white/40">→</span>}
                      <span
                        className={`px-1.5 rounded-sm leading-5 ${
                          s.done ? 'bg-[#1e7e34] text-white' : 'bg-white/10 text-white/70'
                        }`}
                      >
                        {s.done ? '✓ ' : ''}
                        {s.label}
                      </span>
                    </React.Fragment>
                  ))}
                </div>
                <span className="text-white/80">{launchContext.practitionerName}</span>
                <button
                  onClick={() => setUseMockData(!useMockData)}
                  title={
                    useMockData ? 'Switch to live FHIR server' : 'Switch to mock FHIR fixtures'
                  }
                  className={`px-2 leading-5 rounded-sm font-semibold border ${
                    useMockData
                      ? 'bg-[#fff4e5] text-[#8a5300] border-[#e8a33d]'
                      : 'bg-[#e6f4ea] text-[#1e7e34] border-[#1e7e34]'
                  }`}
                >
                  {useMockData ? 'Mock FHIR' : 'Live FHIR'}
                </button>
                <button
                  onClick={() => router.push(`/patient-detail?id=${launchContext.patientId}`)}
                  className="px-2 leading-5 rounded-sm bg-white/10 border border-white/30 hover:bg-white/20"
                  title="Open RHTP Citizen Detail"
                >
                  RHTP
                </button>
              </div>
            </header>

            {/* ── Patient banner ── */}
            <PatientBanner
              patientId={patientId}
              encounterId={encounterId}
              finNumber={encounterId}
              onOpenResource={openResource}
            />

            {/* ── Menu + content ── */}
            <div className="flex flex-1 min-h-0">
              <CernerMenu
                active={activeMenu}
                onSelect={(k) => {
                  setActiveMenu(k);
                  pushAudit('patient-chart-viewed', `Chart section opened: ${k}`, { section: k });
                }}
                badges={{ 'provider-view': activeCdsCount }}
              />

              <main className="flex-1 overflow-y-auto p-3 min-w-0">
                {activeMenu === 'provider-view' && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
                    <ProviderViewReview
                      patientId={patientId}
                      encounterId={encounterId}
                      launchContext={launchContext}
                      onOpenResource={openResource}
                      onMarkReviewed={handleMarkReviewed}
                      onClinicalWrite={handleClinicalWrite}
                      reviewed={reviewed}
                    />
                    <ProviderViewAct
                      patientId={patientId}
                      cdsCards={cdsCards.filter((c) => !c.acknowledged)}
                      closedGapIds={closedGapIds}
                      onOpenResource={openResource}
                      onCloseGap={handleCloseGap}
                      onOpenCdsCard={() => setCdsPanelOpen(true)}
                    />
                    <ProviderViewDocument
                      patientId={patientId}
                      encounterId={encounterId}
                      launchContext={launchContext}
                      sessionActions={sessionActions}
                      onWriteComplete={handleWriteComplete}
                      onOpenResource={openResource}
                      onSignAndReturn={() => setActiveMenu('return')}
                    />
                  </div>
                )}

                {activeMenu === 'results' && <ResultsReviewPage {...pageProps} />}
                {activeMenu === 'medications' && (
                  <MedicationListPage
                    {...pageProps}
                    launchContext={launchContext}
                    encounterId={encounterId}
                    onClinicalWrite={handleClinicalWrite}
                  />
                )}
                {activeMenu === 'problems' && (
                  <ProblemsPage
                    {...pageProps}
                    launchContext={launchContext}
                    encounterId={encounterId}
                    onClinicalWrite={handleClinicalWrite}
                  />
                )}
                {activeMenu === 'allergies' && (
                  <AllergiesPage
                    {...pageProps}
                    launchContext={launchContext}
                    onClinicalWrite={handleClinicalWrite}
                  />
                )}
                {activeMenu === 'vitals' && <VitalsPage {...pageProps} />}
                {activeMenu === 'documentation' && <DocumentationPage {...pageProps} />}
                {activeMenu === 'histories' && <HistoriesPage {...pageProps} />}
                {activeMenu === 'immunizations' && <ImmunizationsPage {...pageProps} />}

                {activeMenu === 'orders' && (
                  <div className="bg-white border border-[#b7c1ca] rounded-sm p-3 max-w-4xl">
                    <OrderEntryModule
                      patientId={launchContext.patientId}
                      encounterId={launchContext.encounterId}
                      practitionerId={launchContext.practitionerId}
                      onOrderSigned={handleOrderSigned}
                    />
                  </div>
                )}

                {activeMenu === 'careplan' && (
                  <div>
                    <CarePlanFhirPage {...pageProps} />
                    <div className="bg-white border border-[#b7c1ca] rounded-sm p-3 mt-2">
                      <CarePlanPanel
                        patientId={patientId}
                        launchContext={launchContext}
                        completedOrders={completedOrders}
                        confirmedAssignments={confirmedAssignments}
                      />
                    </div>
                  </div>
                )}

                {activeMenu === 'careteam' && (
                  <div className="bg-white border border-[#b7c1ca] rounded-sm p-3 max-w-2xl">
                    <CareTeamAssignmentModule
                      patientId={launchContext.patientId}
                      encounterId={launchContext.encounterId}
                      practitionerId={launchContext.practitionerId}
                      onAssignmentConfirmed={handleAssignmentConfirmed}
                    />
                  </div>
                )}

                {activeMenu === 'referrals' && (
                  <div className="bg-white border border-[#b7c1ca] rounded-sm p-3 max-w-4xl">
                    <ActiveReferralsPanel
                      launchContext={launchContext}
                      completedOrders={completedOrders}
                      confirmedAssignments={confirmedAssignments}
                    />
                  </div>
                )}

                {activeMenu === 'quality' && (
                  <div className="space-y-3">
                    <div className="bg-white border border-[#b7c1ca] rounded-sm p-3">
                      <GapClosureMetricsPanel
                        patientId={launchContext.patientId}
                        patientName={launchContext.patientName ?? 'Patient'}
                      />
                    </div>
                    <div className="bg-white border border-[#b7c1ca] rounded-sm p-3">
                      <SdohGapPanel
                        patientFhirId={patientId}
                        practitionerFhirId={launchContext.practitionerId}
                        practitionerDisplay={launchContext.practitionerName}
                        onAuditEntry={(action, details) =>
                          pushAudit('patient-chart-viewed', action, details)
                        }
                      />
                    </div>
                  </div>
                )}

                {activeMenu === 'cdi' && (
                  <div className="bg-white border border-[#b7c1ca] rounded-sm p-3">
                    <MdPatientSummary patientId={patientId} launchContext={launchContext} />
                  </div>
                )}

                {activeMenu === 'compliance' && (
                  <div className="space-y-3">
                    <div className="bg-white border border-[#b7c1ca] rounded-sm p-3">
                      <ComplianceDashboard launchContext={launchContext} />
                    </div>
                    <div className="bg-white border border-[#b7c1ca] rounded-sm p-3 h-[480px]">
                      <AuditLogPanel events={auditEvents} />
                    </div>
                  </div>
                )}

                {activeMenu === 'return' && (
                  <div className="bg-white border border-[#b7c1ca] rounded-sm p-3 max-w-xl">
                    <CernerReturnFlow
                      launchContext={launchContext}
                      completedOrders={completedOrders}
                      confirmedAssignments={confirmedAssignments}
                      closedGapIds={closedGapIds}
                      onReturnInitiated={handleReturnInitiated}
                    />
                  </div>
                )}
              </main>
            </div>

            {/* ── CDS full panel overlay ── */}
            {cdsPanelOpen && (
              <div className="fixed inset-0 z-40 flex items-start justify-center pt-14 px-4">
                <button
                  aria-label="Close CDS panel"
                  className="absolute inset-0 bg-black/40"
                  onClick={() => setCdsPanelOpen(false)}
                />
                <div className="relative bg-[#f4f6f8] border border-[#b7c1ca] rounded-sm shadow-xl w-full max-w-3xl max-h-[80vh] overflow-y-auto">
                  <div className="bg-[#2d4a63] text-white px-3 py-1.5 flex items-center justify-between sticky top-0 z-10">
                    <span className="text-[13px] font-bold">
                      CDS Alerts — Clinical Decision Support
                    </span>
                    <button
                      className="text-white/80 hover:text-white text-[16px]"
                      onClick={() => setCdsPanelOpen(false)}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="p-3">
                    <CdsCardRenderer
                      cards={cdsCards}
                      onAcceptSuggestion={handleAcceptSuggestion}
                      onDismiss={handleDismiss}
                      onSnooze={handleSnooze}
                      onAcknowledge={handleAcknowledge}
                      onOpenSmartLink={() => undefined}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ── FHIR resource drill-down ── */}
            {viewer && (
              <FhirResourceViewer
                resourceType={viewer.resourceType}
                resourceId={viewer.resourceId}
                label={viewer.label}
                onClose={() => setViewer(null)}
              />
            )}
          </div>
        </div>
      </SmartErrorBoundary>
    </AppLayout>
  );
}
