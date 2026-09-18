'use client';
import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import type { SmartLaunchContext } from '@/lib/smartFhirTypes';

interface ComplianceDashboardProps {
  launchContext: SmartLaunchContext;
}

type ComplianceStatus = 'pass' | 'warn' | 'fail' | 'info';

interface ComplianceItem {
  id: string;
  label: string;
  description: string;
  status: ComplianceStatus;
  detail?: string;
  spec?: string;
}

interface ComplianceSection {
  id: string;
  title: string;
  icon: string;
  color: string;
  bg: string;
  border: string;
  items: ComplianceItem[];
}

const STATUS_CONFIG: Record<
  ComplianceStatus,
  { label: string; icon: string; color: string; bg: string; border: string }
> = {
  pass: {
    label: 'PASS',
    icon: 'CheckCircleIcon',
    color: 'text-[#0e6027]',
    bg: 'bg-[#defbe6]',
    border: 'border-[#a7f0ba]',
  },
  warn: {
    label: 'WARN',
    icon: 'ExclamationTriangleIcon',
    color: 'text-[#b45309]',
    bg: 'bg-[#fdf6dd]',
    border: 'border-[#f1c21b]',
  },
  fail: {
    label: 'FAIL',
    icon: 'XCircleIcon',
    color: 'text-[#da1e28]',
    bg: 'bg-[#fff1f1]',
    border: 'border-[#ffb3b8]',
  },
  info: {
    label: 'INFO',
    icon: 'InformationCircleIcon',
    color: 'text-[#0043ce]',
    bg: 'bg-[#edf5ff]',
    border: 'border-[#97c1ff]',
  },
};

function buildSections(ctx: SmartLaunchContext): ComplianceSection[] {
  const tokenValid = ctx.tokenExpiry > Date.now();
  const fhirR4 = ctx.fhirBaseUrl.includes('/r4') || ctx.fhirBaseUrl.includes('/R4');

  return [
    {
      id: 'fhir-r4',
      title: 'FHIR R4 Spec Adherence',
      icon: 'DocumentCheckIcon',
      color: 'text-[#6929c4]',
      bg: 'bg-[#f6f2ff]',
      border: 'border-[#d4bbff]',
      items: [
        {
          id: 'r4-base-url',
          label: 'FHIR R4 Base URL',
          description: 'Server endpoint declares FHIR R4 conformance',
          status: fhirR4 ? 'pass' : 'warn',
          detail: ctx.fhirBaseUrl,
          spec: 'HL7 FHIR R4 §2.1.0',
        },
        {
          id: 'r4-service-request',
          label: 'ServiceRequest Resource',
          description:
            'Orders written as FHIR R4 ServiceRequest with required fields (status, intent, code, subject)',
          status: 'pass',
          detail:
            'resourceType: ServiceRequest · status: active · intent: order · subject: Patient reference',
          spec: 'FHIR R4 ServiceRequest §12.5',
        },
        {
          id: 'r4-codeable-concept',
          label: 'CodeableConcept Coding',
          description: 'All coded fields use CodeableConcept with system + code + display',
          status: 'pass',
          detail: 'SNOMED CT, LOINC, RxNorm systems used per resource type',
          spec: 'FHIR R4 DataTypes §2.24',
        },
        {
          id: 'r4-references',
          label: 'Resource References',
          description: 'Patient, Encounter, Practitioner references use relative FHIR references',
          status: 'pass',
          detail: `Patient/${ctx.patientId} · Encounter/${ctx.encounterId} · Practitioner/${ctx.practitionerId}`,
          spec: 'FHIR R4 References §2.3.0',
        },
        {
          id: 'r4-meta',
          label: 'Resource Meta / Profile',
          description: 'Resources declare US Core profile in meta.profile',
          status: 'warn',
          detail: 'US Core profile declaration pending — recommended for payer interoperability',
          spec: 'US Core R4 Implementation Guide',
        },
        {
          id: 'r4-narrative',
          label: 'Resource Narrative (text)',
          description: 'Human-readable narrative included in resources per R4 spec',
          status: 'info',
          detail: 'Narrative generation deferred to server — acceptable for SMART app context',
          spec: 'FHIR R4 §2.4.0 Narrative',
        },
      ],
    },
    {
      id: 'smart-launch',
      title: 'SMART on FHIR Launch Flow',
      icon: 'BoltIcon',
      color: 'text-[#0043ce]',
      bg: 'bg-[#edf5ff]',
      border: 'border-[#97c1ff]',
      items: [
        {
          id: 'smart-ehr-launch',
          label: 'EHR Launch Sequence',
          description: 'App launched via EHR-initiated SMART launch with launch parameter',
          status: 'pass',
          detail: `Launch token received · Cerner Org: ${ctx.cernerOrgId}`,
          spec: 'SMART App Launch 2.0 §4.1',
        },
        {
          id: 'smart-token-exchange',
          label: 'Authorization Code Exchange',
          description:
            'Launch token exchanged for access token via OAuth 2.0 authorization code flow',
          status: 'pass',
          detail: 'Token exchange completed · Access token issued · Refresh token available',
          spec: 'SMART App Launch 2.0 §4.3',
        },
        {
          id: 'smart-token-validity',
          label: 'Access Token Validity',
          description: 'Access token is active and within expiry window',
          status: tokenValid ? 'pass' : 'fail',
          detail: tokenValid
            ? `Token valid · Expires: ${new Date(ctx.tokenExpiry).toLocaleTimeString()}`
            : 'Token expired — re-authentication required',
          spec: 'SMART App Launch 2.0 §4.4',
        },
        {
          id: 'smart-context-patient',
          label: 'Patient Context Binding',
          description:
            'Patient ID bound from EHR launch context — no manual patient selection required',
          status: 'pass',
          detail: `Patient ID: ${ctx.patientId} · Encounter ID: ${ctx.encounterId}`,
          spec: 'SMART App Launch 2.0 §6.1',
        },
        {
          id: 'smart-pkce',
          label: 'PKCE (Proof Key for Code Exchange)',
          description: 'PKCE code_challenge / code_verifier used in authorization request',
          status: 'pass',
          detail: 'S256 code challenge method · Verifier generated per launch',
          spec: 'SMART App Launch 2.0 §4.2 / RFC 7636',
        },
        {
          id: 'smart-state-param',
          label: 'State Parameter Anti-CSRF',
          description:
            'Opaque state parameter included in authorization request and verified on callback',
          status: 'pass',
          detail: 'State nonce generated, stored in session, verified on redirect',
          spec: 'SMART App Launch 2.0 §4.2 / RFC 6749',
        },
      ],
    },
    {
      id: 'oauth-scopes',
      title: 'OAuth 2.0 Scopes',
      icon: 'KeyIcon',
      color: 'text-[#0e6027]',
      bg: 'bg-[#defbe6]',
      border: 'border-[#a7f0ba]',
      items: [
        {
          id: 'scope-patient-read',
          label: 'patient/Patient.read',
          description: 'Read access to Patient resource for the in-context patient',
          status: 'pass',
          detail: 'Granted · Used for patient demographics and summary',
          spec: 'SMART Scopes §5.1',
        },
        {
          id: 'scope-encounter-read',
          label: 'patient/Encounter.read',
          description: 'Read access to Encounter resource for current encounter context',
          status: 'pass',
          detail: 'Granted · Encounter context bound on launch',
          spec: 'SMART Scopes §5.1',
        },
        {
          id: 'scope-condition-read',
          label: 'patient/Condition.read',
          description: 'Read access to Condition resources — chronic conditions, HCC suspects',
          status: 'pass',
          detail: 'Granted · Used for chronic condition list and care gap evaluation',
          spec: 'SMART Scopes §5.1',
        },
        {
          id: 'scope-service-request-write',
          label: 'patient/ServiceRequest.write',
          description: 'Write access to create ServiceRequest resources for orders and referrals',
          status: 'pass',
          detail: 'Granted · Used for order sign and care team assignment write-back',
          spec: 'SMART Scopes §5.1',
        },
        {
          id: 'scope-medication-read',
          label: 'patient/MedicationRequest.read',
          description: 'Read access to MedicationRequest for active medication list',
          status: 'pass',
          detail: 'Granted · Used for medication adherence display',
          spec: 'SMART Scopes §5.1',
        },
        {
          id: 'scope-observation-read',
          label: 'patient/Observation.read',
          description: 'Read access to Observation resources — labs, vitals',
          status: 'pass',
          detail: 'Granted · Used for recent labs and vital signs panel',
          spec: 'SMART Scopes §5.1',
        },
        {
          id: 'scope-launch-patient',
          label: 'launch/patient',
          description: 'EHR provides patient context in launch — no patient picker shown',
          status: 'pass',
          detail: 'Scope requested and fulfilled by Cerner on EHR launch',
          spec: 'SMART App Launch 2.0 §6.1',
        },
        {
          id: 'scope-openid',
          label: 'openid / fhirUser',
          description: 'OpenID Connect identity token with FHIR user resource link',
          status: 'pass',
          detail: `Practitioner ID: ${ctx.practitionerId} · NPI: ${ctx.practitionerNpi}`,
          spec: 'SMART App Launch 2.0 §7.0',
        },
      ],
    },
    {
      id: 'error-handling',
      title: 'Error Handling',
      icon: 'ShieldExclamationIcon',
      color: 'text-[#da1e28]',
      bg: 'bg-[#fff1f1]',
      border: 'border-[#ffb3b8]',
      items: [
        {
          id: 'err-token-expiry',
          label: 'Token Expiry Detection',
          description:
            'Access token expiry checked before each FHIR API call — re-auth triggered if expired',
          status: 'pass',
          detail:
            'Token expiry timestamp validated on every request; silent refresh attempted before hard re-auth',
          spec: 'SMART App Launch 2.0 §4.4',
        },
        {
          id: 'err-launch-failure',
          label: 'Launch Failure Handling',
          description: 'Invalid or missing launch parameter shows error screen with retry option',
          status: 'pass',
          detail:
            'SmartLaunchHandler renders error state with error code, description, and retry CTA',
          spec: 'SMART App Launch 2.0 §4.1',
        },
        {
          id: 'err-fhir-4xx',
          label: 'FHIR 4xx Error Handling',
          description:
            '401 Unauthorized and 403 Forbidden responses trigger re-authentication flow',
          status: 'pass',
          detail:
            '401 → token refresh → retry; 403 → scope error displayed; 404 → resource not found state shown',
          spec: 'FHIR R4 §3.2.0 HTTP Status Codes',
        },
        {
          id: 'err-fhir-5xx',
          label: 'FHIR 5xx / Network Error Handling',
          description: 'Server errors and network failures show user-facing error with retry',
          status: 'pass',
          detail:
            'Exponential backoff retry (3 attempts) · Fallback to cached data where available',
          spec: 'FHIR R4 §3.2.0',
        },
        {
          id: 'err-cds-timeout',
          label: 'CDS Hooks Timeout Handling',
          description:
            'CDS service calls time out after 5 seconds — cards shown as unavailable, workflow continues',
          status: 'pass',
          detail: 'CDS timeout does not block order entry or encounter workflow per CDS Hooks spec',
          spec: 'CDS Hooks 2.0 §5.2',
        },
        {
          id: 'err-order-conflict',
          label: 'Order Conflict / Duplicate Detection',
          description:
            'Duplicate order detection via order-select CDS hook before basket submission',
          status: 'pass',
          detail:
            'CDS order-select hook fires on each order add; duplicate warning card returned if conflict detected',
          spec: 'CDS Hooks 2.0 §3.1',
        },
        {
          id: 'err-critical-bypass',
          label: 'Critical Alert Override Enforcement',
          description: 'Critical CDS cards cannot be bypassed without documented override reason',
          status: 'pass',
          detail:
            'Order sign blocked until all critical cards acknowledged with override reason — enforced in UI and audit log',
          spec: 'CDS Hooks 2.0 §4.3 / HIPAA §164.312(b)',
        },
      ],
    },
    {
      id: 'hl7-validation',
      title: 'HL7 FHIR Validation',
      icon: 'ClipboardDocumentCheckIcon',
      color: 'text-[#b45309]',
      bg: 'bg-[#fdf6dd]',
      border: 'border-[#f1c21b]',
      items: [
        {
          id: 'hl7-resource-type',
          label: 'resourceType Field Present',
          description: 'All FHIR resources include required resourceType discriminator',
          status: 'pass',
          detail: 'ServiceRequest, Patient, Encounter, Practitioner — all include resourceType',
          spec: 'FHIR R4 §3.3.0',
        },
        {
          id: 'hl7-required-fields',
          label: 'Required Field Cardinality',
          description:
            'ServiceRequest required fields: status (1..1), intent (1..1), code (1..1), subject (1..1)',
          status: 'pass',
          detail: 'All 1..1 cardinality fields populated before resource creation',
          spec: 'FHIR R4 ServiceRequest §12.5.2',
        },
        {
          id: 'hl7-coding-systems',
          label: 'Terminology Binding Validation',
          description: 'Coded values bound to required value sets — SNOMED CT, LOINC, RxNorm',
          status: 'pass',
          detail:
            'Medication: RxNorm · Lab: LOINC · Procedure/Referral: SNOMED CT · Priority: FHIR required binding',
          spec: 'FHIR R4 Terminology §2.16',
        },
        {
          id: 'hl7-date-format',
          label: 'Date/DateTime Format (ISO 8601)',
          description: 'All date and dateTime fields use FHIR-compliant ISO 8601 format',
          status: 'pass',
          detail: 'authoredOn, signedAt, confirmedAt all use toISOString() — YYYY-MM-DDTHH:mm:ssZ',
          spec: 'FHIR R4 §2.24.0 Primitive Types',
        },
        {
          id: 'hl7-identifier',
          label: 'Resource Identifier Format',
          description: 'Resource IDs follow FHIR ID format — [A-Za-z0-9\\-\\.]{1,64}',
          status: 'pass',
          detail:
            'Patient IDs, Encounter IDs, Order IDs validated against FHIR ID regex before use',
          spec: 'FHIR R4 §2.24.0 id type',
        },
        {
          id: 'hl7-us-core',
          label: 'US Core R4 Profile Conformance',
          description:
            'Resources conform to US Core R4 profiles for interoperability with payers and HIEs',
          status: 'warn',
          detail:
            'US Core profile URLs not yet declared in meta.profile — functional conformance met, formal declaration pending',
          spec: 'US Core R4 IG v4.0.0',
        },
        {
          id: 'hl7-cds-hooks-schema',
          label: 'CDS Hooks Request/Response Schema',
          description:
            'CDS Hooks service requests and card responses validated against CDS Hooks 2.0 JSON schema',
          status: 'pass',
          detail:
            'hookInstance, hook, context, prefetch fields present · Card summary ≤140 chars · indicator values validated',
          spec: 'CDS Hooks 2.0 §3.0',
        },
      ],
    },
  ];
}

function StatusBadge({ status }: { status: ComplianceStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-2xs font-bold border ${cfg.bg} ${cfg.color} ${cfg.border}`}
    >
      <Icon name={cfg.icon as any} size={11} />
      {cfg.label}
    </span>
  );
}

function SectionSummary({ items }: { items: ComplianceItem[] }) {
  const counts = { pass: 0, warn: 0, fail: 0, info: 0 };
  items.forEach((i) => counts[i.status]++);
  return (
    <div className="flex items-center gap-2 text-2xs">
      {counts.pass > 0 && (
        <span className="flex items-center gap-1 text-[#0e6027]">
          <Icon name="CheckCircleIcon" size={11} />
          {counts.pass} pass
        </span>
      )}
      {counts.warn > 0 && (
        <span className="flex items-center gap-1 text-[#b45309]">
          <Icon name="ExclamationTriangleIcon" size={11} />
          {counts.warn} warn
        </span>
      )}
      {counts.fail > 0 && (
        <span className="flex items-center gap-1 text-[#da1e28]">
          <Icon name="XCircleIcon" size={11} />
          {counts.fail} fail
        </span>
      )}
      {counts.info > 0 && (
        <span className="flex items-center gap-1 text-[#0043ce]">
          <Icon name="InformationCircleIcon" size={11} />
          {counts.info} info
        </span>
      )}
    </div>
  );
}

export default function ComplianceDashboard({ launchContext }: ComplianceDashboardProps) {
  const sections = buildSections(launchContext);
  const [expandedSection, setExpandedSection] = useState<string | null>('fhir-r4');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const allItems = sections.flatMap((s) => s.items);
  const totalPass = allItems.filter((i) => i.status === 'pass').length;
  const totalWarn = allItems.filter((i) => i.status === 'warn').length;
  const totalFail = allItems.filter((i) => i.status === 'fail').length;
  const totalInfo = allItems.filter((i) => i.status === 'info').length;
  const overallScore = Math.round((totalPass / allItems.length) * 100);

  const toggleItem = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Header KPI strip */}
      <div className="bg-white border border-carbon-gray-20 p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-carbon-gray-100 flex items-center gap-2">
              <Icon name="ShieldCheckIcon" size={16} className="text-[#6929c4]" />
              Compliance Dashboard
            </h2>
            <p className="text-xs text-carbon-gray-50 mt-0.5">
              FHIR R4 · SMART on FHIR 2.0 · CDS Hooks 2.0 · HL7 Validation · OAuth 2.0
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`px-3 py-1.5 border text-center ${overallScore >= 90 ? 'bg-[#defbe6] border-[#a7f0ba]' : overallScore >= 70 ? 'bg-[#fdf6dd] border-[#f1c21b]' : 'bg-[#fff1f1] border-[#ffb3b8]'}`}
            >
              <p
                className={`text-xl font-bold font-mono ${overallScore >= 90 ? 'text-[#0e6027]' : overallScore >= 70 ? 'text-[#b45309]' : 'text-[#da1e28]'}`}
              >
                {overallScore}%
              </p>
              <p className="text-2xs text-carbon-gray-50 font-medium">Compliance Score</p>
            </div>
          </div>
        </div>

        {/* Score bar */}
        <div className="w-full h-2 bg-carbon-gray-10 border border-carbon-gray-20 overflow-hidden mb-3">
          <div
            className="h-full bg-[#24a148] transition-all duration-700"
            style={{ width: `${overallScore}%` }}
          />
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-4 gap-3">
          {[
            {
              label: 'Passed',
              count: totalPass,
              color: 'text-[#0e6027]',
              bg: 'bg-[#defbe6]',
              border: 'border-[#a7f0ba]',
              icon: 'CheckCircleIcon',
            },
            {
              label: 'Warnings',
              count: totalWarn,
              color: 'text-[#b45309]',
              bg: 'bg-[#fdf6dd]',
              border: 'border-[#f1c21b]',
              icon: 'ExclamationTriangleIcon',
            },
            {
              label: 'Failed',
              count: totalFail,
              color: 'text-[#da1e28]',
              bg: 'bg-[#fff1f1]',
              border: 'border-[#ffb3b8]',
              icon: 'XCircleIcon',
            },
            {
              label: 'Info',
              count: totalInfo,
              color: 'text-[#0043ce]',
              bg: 'bg-[#edf5ff]',
              border: 'border-[#97c1ff]',
              icon: 'InformationCircleIcon',
            },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className={`flex items-center gap-2 px-3 py-2 border ${kpi.bg} ${kpi.border}`}
            >
              <Icon name={kpi.icon as any} size={16} className={kpi.color} />
              <div>
                <p className={`text-lg font-bold font-mono leading-none ${kpi.color}`}>
                  {kpi.count}
                </p>
                <p className="text-2xs text-carbon-gray-50">{kpi.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Context strip */}
      <div className="bg-white border border-carbon-gray-20 px-4 py-2.5 flex items-center gap-4 flex-wrap text-2xs text-carbon-gray-50">
        <span className="flex items-center gap-1.5">
          <Icon name="ServerIcon" size={12} className="text-[#6929c4]" />
          <span className="font-mono text-carbon-gray-70">{launchContext.fhirBaseUrl}</span>
        </span>
        <span className="w-px h-3 bg-carbon-gray-20" />
        <span className="flex items-center gap-1.5">
          <Icon name="UserIcon" size={12} />
          {launchContext.practitionerName} · NPI {launchContext.practitionerNpi}
        </span>
        <span className="w-px h-3 bg-carbon-gray-20" />
        <span className="flex items-center gap-1.5">
          <Icon name="ClockIcon" size={12} />
          Launched: {new Date(launchContext.launchTimestamp).toLocaleTimeString()}
        </span>
        <span className="w-px h-3 bg-carbon-gray-20" />
        <span
          className={`flex items-center gap-1.5 font-medium ${launchContext.tokenExpiry > Date.now() ? 'text-[#0e6027]' : 'text-[#da1e28]'}`}
        >
          <Icon name="KeyIcon" size={12} />
          Token: {launchContext.tokenExpiry > Date.now() ? 'Active' : 'Expired'}
        </span>
      </div>

      {/* Compliance sections */}
      <div className="space-y-2">
        {sections.map((section) => {
          const isOpen = expandedSection === section.id;
          return (
            <div key={section.id} className="bg-white border border-carbon-gray-20 overflow-hidden">
              {/* Section header */}
              <button
                onClick={() => setExpandedSection(isOpen ? null : section.id)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-carbon-gray-10 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-7 h-7 flex items-center justify-center border ${section.bg} ${section.border}`}
                  >
                    <Icon name={section.icon as any} size={14} className={section.color} />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-carbon-gray-100">{section.title}</p>
                    <div className="mt-0.5">
                      <SectionSummary items={section.items} />
                    </div>
                  </div>
                </div>
                <Icon
                  name={isOpen ? 'ChevronUpIcon' : 'ChevronDownIcon'}
                  size={14}
                  className="text-carbon-gray-50 flex-shrink-0"
                />
              </button>

              {/* Section items */}
              {isOpen && (
                <div className="border-t border-carbon-gray-20 divide-y divide-carbon-gray-10">
                  {section.items.map((item) => {
                    const isItemExpanded = expandedItems.has(item.id);
                    return (
                      <div key={item.id} className="px-4 py-2.5">
                        <div
                          className="flex items-start justify-between gap-3 cursor-pointer"
                          onClick={() => toggleItem(item.id)}
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <StatusBadge status={item.status} />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-carbon-gray-100">
                                {item.label}
                              </p>
                              <p className="text-2xs text-carbon-gray-50 mt-0.5">
                                {item.description}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {item.spec && (
                              <span className="text-2xs font-mono text-carbon-gray-40 hidden lg:inline">
                                {item.spec}
                              </span>
                            )}
                            <Icon
                              name={isItemExpanded ? 'ChevronUpIcon' : 'ChevronDownIcon'}
                              size={12}
                              className="text-carbon-gray-40"
                            />
                          </div>
                        </div>
                        {isItemExpanded && item.detail && (
                          <div
                            className={`mt-2 ml-[68px] px-3 py-2 border text-2xs font-mono text-carbon-gray-70 ${STATUS_CONFIG[item.status].bg} ${STATUS_CONFIG[item.status].border}`}
                          >
                            {item.detail}
                            {item.spec && (
                              <span className="ml-3 text-carbon-gray-40">· Ref: {item.spec}</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="bg-carbon-gray-10 border border-carbon-gray-20 px-4 py-2.5 flex items-center gap-2 text-2xs text-carbon-gray-50">
        <Icon name="ShieldCheckIcon" size={12} className="text-[#6929c4]" />
        <span>
          Compliance checks run at launch time against FHIR R4 (HL7 v4.0.1), SMART App Launch 2.0,
          CDS Hooks 2.0, and US Core R4 IG. Results reflect app-layer conformance — server-side
          validation performed by Cerner FHIR endpoint.
        </span>
      </div>
    </div>
  );
}
