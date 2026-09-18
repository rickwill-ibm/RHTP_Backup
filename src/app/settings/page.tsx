'use client';
import React, { useState, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import Link from 'next/link';

// Author: Richard Hennessy — Austin, Texas 78726
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? '';

// ─── Static config data ────────────────────────────────────────────────────────

const SMART_MANIFEST_DEFAULTS = {
  clientId: 'tcoc-smart-app-v1',
  clientName: 'TCOC Total Cost of Care',
  redirectUri: `${SITE_URL}/md-smart-launch`,
  launchUri: `${SITE_URL}/md-smart-launch`,
  logoUri: `${SITE_URL}/assets/images/app_logo.png`,
  scopes: [
    { scope: 'launch', description: 'EHR launch context', required: true },
    { scope: 'launch/patient', description: 'Patient context binding', required: true },
    { scope: 'patient/*.read', description: 'Read all patient resources', required: true },
    {
      scope: 'patient/Observation.read',
      description: 'Vitals, labs, clinical observations',
      required: true,
    },
    { scope: 'patient/Condition.read', description: 'Diagnoses and problem list', required: true },
    {
      scope: 'patient/MedicationRequest.read',
      description: 'Active medication orders',
      required: true,
    },
    {
      scope: 'patient/ServiceRequest.read',
      description: 'Referral and order history',
      required: true,
    },
    {
      scope: 'patient/ServiceRequest.write',
      description: 'Write referral / care team orders',
      required: true,
    },
    { scope: 'patient/Encounter.read', description: 'Encounter history', required: true },
    { scope: 'patient/Coverage.read', description: 'Insurance / payer coverage', required: false },
    { scope: 'openid', description: 'OpenID Connect identity', required: true },
    { scope: 'fhirUser', description: 'Practitioner identity claim', required: true },
    {
      scope: 'offline_access',
      description: 'Refresh token for session continuity',
      required: false,
    },
  ],
  tokenEndpointAuthMethod: 'none',
  grantTypes: ['authorization_code'],
  responseTypes: ['code'],
  pkce: true,
  smartCapabilities: ['launch-ehr', 'client-public', 'context-ehr-patient', 'permission-patient'],
};

const CERNER_CONFIG_DEFAULTS = {
  fhirBaseUrl: 'https://fhir-ehr.cerner.com/r4/{tenant_id}',
  authorizationEndpoint:
    'https://authorization.cerner.com/tenants/{tenant_id}/protocols/oauth2/profiles/smart-v1/personas/provider/authorize',
  tokenEndpoint:
    'https://authorization.cerner.com/tenants/{tenant_id}/protocols/oauth2/profiles/smart-v1/token',
  introspectEndpoint: 'https://authorization.cerner.com/tokeninfo',
  wellKnownUrl: 'https://fhir-ehr.cerner.com/r4/{tenant_id}/.well-known/smart-configuration',
  tenantId: '{tenant_id}',
  ehrLaunchUrl: `${SITE_URL}/md-smart-launch`,
  appRegistrationPortal: 'https://code.cerner.com/developer/smart-on-fhir/apps',
  fhirVersion: 'R4 (4.0.1)',
  usCoreProfle: 'US Core 3.1.1',
  cernerSpecificHeaders: {
    Accept: 'application/fhir+json',
    'Content-Type': 'application/fhir+json',
  },
};

const CDS_HOOKS = [
  {
    id: 'patient-view',
    hookType: 'patient-view',
    title: 'Patient View — Risk & Care Gap Summary',
    description:
      'Fires when a provider opens a patient chart. Returns risk tier card, open care gaps, and HCC suspect alerts.',
    url: `${SITE_URL}/api/cds-hooks/patient-view`,
    prefetch: [
      'patient/Patient/{{context.patientId}}',
      'patient/Condition?patient={{context.patientId}}&category=problem-list-item',
      'patient/Observation?patient={{context.patientId}}&category=laboratory&_sort=-date&_count=10',
    ],
    cardTypes: ['info', 'warning', 'suggestion'],
  },
  {
    id: 'encounter-start',
    hookType: 'encounter-start',
    title: 'Encounter Start — Visit Prep & Gaps',
    description:
      'Fires at encounter creation. Surfaces unaddressed HEDIS/STARS/MIPS gaps and recommended orders for this visit.',
    url: `${SITE_URL}/api/cds-hooks/encounter-start`,
    prefetch: [
      'patient/Encounter/{{context.encounterId}}',
      'patient/Condition?patient={{context.patientId}}',
      'patient/MedicationRequest?patient={{context.patientId}}&status=active',
    ],
    cardTypes: ['warning', 'suggestion'],
  },
  {
    id: 'order-select',
    hookType: 'order-select',
    title: 'Order Select — Formulary & Referral Check',
    description:
      'Fires when a provider selects an order. Checks formulary tier, preferred network specialists, and duplicate detection.',
    url: `${SITE_URL}/api/cds-hooks/order-select`,
    prefetch: [
      'patient/MedicationRequest?patient={{context.patientId}}&status=active',
      'patient/ServiceRequest?patient={{context.patientId}}&status=active',
    ],
    cardTypes: ['warning', 'critical', 'suggestion'],
  },
  {
    id: 'order-sign',
    hookType: 'order-sign',
    title: 'Order Sign — Final Validation',
    description:
      'Fires before order signing. Validates clinical indication for STAT orders, confirms network tier, and triggers FHIR ServiceRequest write-back.',
    url: `${SITE_URL}/api/cds-hooks/order-sign`,
    prefetch: [
      'patient/Patient/{{context.patientId}}',
      'patient/Coverage?patient={{context.patientId}}',
    ],
    cardTypes: ['critical', 'info'],
  },
  {
    id: 'care-gap-closure',
    hookType: 'encounter-discharge',
    title: 'Care Gap Closure — Discharge Checklist',
    description:
      'Fires at encounter discharge. Confirms gap closure documentation, prompts for any remaining HEDIS/STARS measures, and logs audit event.',
    url: `${SITE_URL}/api/cds-hooks/care-gap-closure`,
    prefetch: [
      'patient/Encounter/{{context.encounterId}}',
      'patient/Observation?patient={{context.patientId}}&category=survey',
    ],
    cardTypes: ['info', 'suggestion'],
  },
];

// ─── Validation helpers ────────────────────────────────────────────────────────

function isValidUrl(val: string): boolean {
  try {
    new URL(val);
    return true;
  } catch {
    return false;
  }
}

function validateCernerFields(fields: typeof CERNER_CONFIG_DEFAULTS): Record<string, string> {
  const errors: Record<string, string> = {};
  const urlFields: (keyof typeof CERNER_CONFIG_DEFAULTS)[] = [
    'fhirBaseUrl',
    'authorizationEndpoint',
    'tokenEndpoint',
    'introspectEndpoint',
    'wellKnownUrl',
    'ehrLaunchUrl',
    'appRegistrationPortal',
  ];
  urlFields.forEach((f) => {
    const val = fields[f] as string;
    if (!val.trim()) {
      errors[f] = 'This field is required.';
    } else if (!isValidUrl(val.replace('{tenant_id}', 'placeholder'))) {
      errors[f] = 'Must be a valid URL.';
    }
  });
  if (!fields.tenantId.trim()) errors.tenantId = 'Tenant ID is required.';
  if (!fields.fhirVersion.trim()) errors.fhirVersion = 'FHIR version is required.';
  if (!fields.usCoreProfle.trim()) errors.usCoreProfle = 'US Core profile is required.';
  return errors;
}

function validateSmartFields(fields: SmartEditableFields): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!fields.clientId.trim()) errors.clientId = 'Client ID is required.';
  if (!fields.clientName.trim()) errors.clientName = 'Client name is required.';
  if (!fields.redirectUri.trim()) errors.redirectUri = 'Redirect URI is required.';
  else if (!isValidUrl(fields.redirectUri)) errors.redirectUri = 'Must be a valid URL.';
  if (!fields.launchUri.trim()) errors.launchUri = 'EHR Launch URL is required.';
  else if (!isValidUrl(fields.launchUri)) errors.launchUri = 'Must be a valid URL.';
  if (fields.logoUri && !isValidUrl(fields.logoUri)) errors.logoUri = 'Must be a valid URL.';
  return errors;
}

interface SmartEditableFields {
  clientId: string;
  clientName: string;
  redirectUri: string;
  launchUri: string;
  logoUri: string;
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  return (
    <button
      onClick={handleCopy}
      className="ml-2 flex-shrink-0 p-1 text-carbon-gray-50 hover:text-carbon-blue transition-colors"
      title="Copy to clipboard"
    >
      <Icon name={copied ? 'CheckIcon' : 'ClipboardDocumentIcon'} size={14} />
    </button>
  );
}

function FieldRow({
  label,
  value,
  mono = false,
  tag,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tag?: string;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-carbon-gray-10 last:border-0">
      <span className="w-44 flex-shrink-0 text-xs text-carbon-gray-50 pt-0.5">{label}</span>
      <div className="flex-1 flex items-start gap-1 min-w-0">
        <span
          className={`text-xs text-carbon-gray-100 break-all ${mono ? 'font-mono bg-carbon-gray-10 px-1.5 py-0.5 rounded' : ''}`}
        >
          {value}
        </span>
        {tag && (
          <span
            className={`ml-1 flex-shrink-0 text-2xs font-semibold px-1.5 py-0.5 rounded ${tag === 'Required' ? 'bg-[#d0e2ff] text-[#0043ce]' : 'bg-carbon-gray-10 text-carbon-gray-50'}`}
          >
            {tag}
          </span>
        )}
        <CopyButton value={value} />
      </div>
    </div>
  );
}

function EditableFieldRow({
  label,
  fieldKey,
  value,
  error,
  mono = false,
  editing,
  onChange,
  placeholder,
}: {
  label: string;
  fieldKey: string;
  value: string;
  error?: string;
  mono?: boolean;
  editing: boolean;
  onChange: (key: string, val: string) => void;
  placeholder?: string;
}) {
  if (!editing) {
    return <FieldRow label={label} value={value} mono={mono} />;
  }
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-carbon-gray-10 last:border-0">
      <span className="w-44 flex-shrink-0 text-xs text-carbon-gray-50 pt-2">{label}</span>
      <div className="flex-1 min-w-0">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(fieldKey, e.target.value)}
          placeholder={placeholder}
          className={`w-full text-xs px-2.5 py-1.5 border ${error ? 'border-[#da1e28] bg-[#fff8f8]' : 'border-carbon-gray-30 bg-white'} focus:outline-none focus:border-carbon-blue ${mono ? 'font-mono' : ''} text-carbon-gray-100`}
        />
        {error && <p className="text-2xs text-[#da1e28] mt-1">{error}</p>}
      </div>
    </div>
  );
}

function SaveBar({
  onSave,
  onCancel,
  hasErrors,
  saved,
}: {
  onSave: () => void;
  onCancel: () => void;
  hasErrors: boolean;
  saved: boolean;
}) {
  return (
    <div className="flex items-center gap-3 mt-4 pt-4 border-t border-carbon-gray-20">
      {saved && (
        <span className="flex items-center gap-1.5 text-xs text-[#198038] font-medium">
          <Icon name="CheckCircleIcon" size={14} className="text-[#198038]" />
          Saved successfully
        </span>
      )}
      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-carbon-gray-70 border border-carbon-gray-30 hover:bg-carbon-gray-10 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={hasErrors}
          className={`px-4 py-1.5 text-xs font-semibold transition-colors flex items-center gap-1.5 ${
            hasErrors
              ? 'bg-carbon-gray-20 text-carbon-gray-50 cursor-not-allowed'
              : 'bg-carbon-blue text-white hover:bg-[#0043ce]'
          }`}
        >
          <Icon name="CheckIcon" size={13} />
          Save Changes
        </button>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white border border-carbon-gray-20 mb-4">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-carbon-gray-10 transition-colors"
      >
        <Icon name={icon as any} size={18} className="text-carbon-blue flex-shrink-0" />
        <span className="flex-1 text-sm font-semibold text-carbon-gray-100">{title}</span>
        <Icon
          name={open ? 'ChevronUpIcon' : 'ChevronDownIcon'}
          size={16}
          className="text-carbon-gray-50"
        />
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

// ─── Cerner Endpoints editable section ────────────────────────────────────────

function CernerEndpointsTab() {
  const [config, setConfig] = useState({ ...CERNER_CONFIG_DEFAULTS });
  const [draft, setDraft] = useState({ ...CERNER_CONFIG_DEFAULTS });
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const handleChange = useCallback((key: string, val: string) => {
    setDraft((prev) => ({ ...prev, [key]: val }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setSaved(false);
  }, []);

  const handleEdit = () => {
    setDraft({ ...config });
    setErrors({});
    setSaved(false);
    setEditing(true);
  };

  const handleCancel = () => {
    setDraft({ ...config });
    setErrors({});
    setSaved(false);
    setEditing(false);
  };

  const handleSave = () => {
    const errs = validateCernerFields(draft);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setConfig({ ...draft });
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div>
      <div className="bg-[#fff8e1] border border-[#f59e0b] px-4 py-3 mb-4 flex items-start gap-3">
        <Icon
          name="ExclamationTriangleIcon"
          size={16}
          className="text-[#d97706] flex-shrink-0 mt-0.5"
        />
        <p className="text-xs text-[#92400e]">
          Replace <code className="font-mono bg-[#fef3c7] px-1">{'{tenant_id}'}</code> with your
          Cerner organization tenant ID before registering. Obtain your tenant ID from the Cerner
          Code Console or your Cerner implementation team.
        </p>
      </div>

      {/* Edit / Saved status bar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {saved && !editing && (
            <span className="flex items-center gap-1.5 text-xs text-[#198038] font-medium">
              <Icon name="CheckCircleIcon" size={14} className="text-[#198038]" />
              Configuration saved
            </span>
          )}
        </div>
        {!editing && (
          <button
            onClick={handleEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-carbon-blue border border-carbon-blue hover:bg-[#edf5ff] transition-colors"
          >
            <Icon name="PencilIcon" size={13} />
            Edit Endpoints
          </button>
        )}
      </div>

      <SectionCard title="FHIR R4 Base & Discovery" icon="GlobeAltIcon">
        <EditableFieldRow
          label="FHIR Base URL"
          fieldKey="fhirBaseUrl"
          value={editing ? draft.fhirBaseUrl : config.fhirBaseUrl}
          error={errors.fhirBaseUrl}
          mono
          editing={editing}
          onChange={handleChange}
          placeholder="https://fhir-ehr.cerner.com/r4/{tenant_id}"
        />
        <EditableFieldRow
          label="Well-Known Config"
          fieldKey="wellKnownUrl"
          value={editing ? draft.wellKnownUrl : config.wellKnownUrl}
          error={errors.wellKnownUrl}
          mono
          editing={editing}
          onChange={handleChange}
          placeholder="https://fhir-ehr.cerner.com/r4/{tenant_id}/.well-known/smart-configuration"
        />
        <EditableFieldRow
          label="FHIR Version"
          fieldKey="fhirVersion"
          value={editing ? draft.fhirVersion : config.fhirVersion}
          error={errors.fhirVersion}
          editing={editing}
          onChange={handleChange}
        />
        <EditableFieldRow
          label="US Core Profile"
          fieldKey="usCoreProfle"
          value={editing ? draft.usCoreProfle : config.usCoreProfle}
          error={errors.usCoreProfle}
          editing={editing}
          onChange={handleChange}
        />
      </SectionCard>

      <SectionCard title="OAuth 2.0 Endpoints" icon="LockClosedIcon">
        <EditableFieldRow
          label="Authorization URL"
          fieldKey="authorizationEndpoint"
          value={editing ? draft.authorizationEndpoint : config.authorizationEndpoint}
          error={errors.authorizationEndpoint}
          mono
          editing={editing}
          onChange={handleChange}
          placeholder="https://authorization.cerner.com/tenants/{tenant_id}/..."
        />
        <EditableFieldRow
          label="Token URL"
          fieldKey="tokenEndpoint"
          value={editing ? draft.tokenEndpoint : config.tokenEndpoint}
          error={errors.tokenEndpoint}
          mono
          editing={editing}
          onChange={handleChange}
          placeholder="https://authorization.cerner.com/tenants/{tenant_id}/..."
        />
        <EditableFieldRow
          label="Introspect URL"
          fieldKey="introspectEndpoint"
          value={editing ? draft.introspectEndpoint : config.introspectEndpoint}
          error={errors.introspectEndpoint}
          mono
          editing={editing}
          onChange={handleChange}
          placeholder="https://authorization.cerner.com/tokeninfo"
        />
      </SectionCard>

      <SectionCard title="App Registration" icon="PencilSquareIcon">
        <EditableFieldRow
          label="EHR Launch URL"
          fieldKey="ehrLaunchUrl"
          value={editing ? draft.ehrLaunchUrl : config.ehrLaunchUrl}
          error={errors.ehrLaunchUrl}
          mono
          editing={editing}
          onChange={handleChange}
        />
        <EditableFieldRow
          label="Tenant ID"
          fieldKey="tenantId"
          value={editing ? draft.tenantId : config.tenantId}
          error={errors.tenantId}
          mono
          editing={editing}
          onChange={handleChange}
          placeholder="{tenant_id}"
        />
        <EditableFieldRow
          label="Registration Portal"
          fieldKey="appRegistrationPortal"
          value={editing ? draft.appRegistrationPortal : config.appRegistrationPortal}
          error={errors.appRegistrationPortal}
          mono
          editing={editing}
          onChange={handleChange}
        />
        <div className="mt-4 pt-3 border-t border-carbon-gray-10">
          <p className="text-xs text-carbon-gray-50 mb-2 font-semibold">Required Request Headers</p>
          {Object.entries(config.cernerSpecificHeaders).map(([k, v]) => (
            <div key={k} className="flex items-center gap-3 py-1.5">
              <code className="text-xs font-mono bg-carbon-gray-10 px-2 py-0.5 text-carbon-gray-100 w-40 flex-shrink-0">
                {k}
              </code>
              <code className="text-xs font-mono text-carbon-gray-70">{v}</code>
              <CopyButton value={`${k}: ${v}`} />
            </div>
          ))}
        </div>
        {editing && (
          <SaveBar
            onSave={handleSave}
            onCancel={handleCancel}
            hasErrors={hasErrors}
            saved={false}
          />
        )}
      </SectionCard>

      <SectionCard title="Registration Checklist" icon="ClipboardDocumentCheckIcon">
        {[
          {
            step: '1',
            label: 'Create app in Cerner Code Console',
            detail: 'code.cerner.com/developer/smart-on-fhir/apps',
            done: false,
          },
          { step: '2', label: 'Set EHR Launch URL', detail: config.ehrLaunchUrl, done: false },
          {
            step: '3',
            label: 'Configure required OAuth scopes',
            detail: 'See SMART Manifest → OAuth 2.0 Scopes',
            done: false,
          },
          {
            step: '4',
            label: 'Enable PKCE (S256)',
            detail: 'Required for public client security',
            done: false,
          },
          {
            step: '5',
            label: 'Submit for Cerner certification review',
            detail: 'Typically 2–4 weeks for production approval',
            done: false,
          },
          {
            step: '6',
            label: 'Receive production tenant ID',
            detail: 'Replace {tenant_id} in all endpoint URLs',
            done: false,
          },
          {
            step: '7',
            label: 'Test EHR launch in Cerner sandbox',
            detail: 'fhir-ehr-code.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d',
            done: false,
          },
        ].map((item) => (
          <div
            key={item.step}
            className="flex items-start gap-3 py-2.5 border-b border-carbon-gray-10 last:border-0"
          >
            <div className="w-6 h-6 rounded-full bg-carbon-gray-20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-2xs font-bold text-carbon-gray-70">{item.step}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-carbon-gray-100">{item.label}</p>
              <p className="text-2xs text-carbon-gray-50 mt-0.5 font-mono break-all">
                {item.detail}
              </p>
            </div>
          </div>
        ))}
      </SectionCard>
    </div>
  );
}

// ─── SMART Manifest editable section ──────────────────────────────────────────

function SmartManifestTab() {
  const SMART_MANIFEST = SMART_MANIFEST_DEFAULTS;
  const [identity, setIdentity] = useState<SmartEditableFields>({
    clientId: SMART_MANIFEST.clientId,
    clientName: SMART_MANIFEST.clientName,
    redirectUri: SMART_MANIFEST.redirectUri,
    launchUri: SMART_MANIFEST.launchUri,
    logoUri: SMART_MANIFEST.logoUri,
  });
  const [draft, setDraft] = useState<SmartEditableFields>({ ...identity });
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const handleChange = useCallback((key: string, val: string) => {
    setDraft((prev) => ({ ...prev, [key]: val }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setSaved(false);
  }, []);

  const handleEdit = () => {
    setDraft({ ...identity });
    setErrors({});
    setSaved(false);
    setEditing(true);
  };

  const handleCancel = () => {
    setDraft({ ...identity });
    setErrors({});
    setSaved(false);
    setEditing(false);
  };

  const handleSave = () => {
    const errs = validateSmartFields(draft);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setIdentity({ ...draft });
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const hasErrors = Object.keys(errors).length > 0;

  const manifestJson = JSON.stringify(
    {
      client_id: identity.clientId,
      client_name: identity.clientName,
      redirect_uris: [identity.redirectUri],
      launch_uri: identity.launchUri,
      logo_uri: identity.logoUri,
      scope: SMART_MANIFEST.scopes
        .filter((s) => s.required)
        .map((s) => s.scope)
        .join(' '),
      token_endpoint_auth_method: SMART_MANIFEST.tokenEndpointAuthMethod,
      grant_types: SMART_MANIFEST.grantTypes,
      response_types: SMART_MANIFEST.responseTypes,
      smart_capabilities: SMART_MANIFEST.smartCapabilities,
    },
    null,
    2
  );

  return (
    <div>
      {/* Edit / Saved status bar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {saved && !editing && (
            <span className="flex items-center gap-1.5 text-xs text-[#198038] font-medium">
              <Icon name="CheckCircleIcon" size={14} className="text-[#198038]" />
              Manifest saved
            </span>
          )}
        </div>
        {!editing && (
          <button
            onClick={handleEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-carbon-blue border border-carbon-blue hover:bg-[#edf5ff] transition-colors"
          >
            <Icon name="PencilIcon" size={13} />
            Edit Manifest
          </button>
        )}
      </div>

      <SectionCard title="App Identity" icon="IdentificationIcon">
        <EditableFieldRow
          label="Client ID"
          fieldKey="clientId"
          value={editing ? draft.clientId : identity.clientId}
          error={errors.clientId}
          mono
          editing={editing}
          onChange={handleChange}
        />
        <EditableFieldRow
          label="Client Name"
          fieldKey="clientName"
          value={editing ? draft.clientName : identity.clientName}
          error={errors.clientName}
          editing={editing}
          onChange={handleChange}
        />
        <EditableFieldRow
          label="Redirect URI"
          fieldKey="redirectUri"
          value={editing ? draft.redirectUri : identity.redirectUri}
          error={errors.redirectUri}
          mono
          editing={editing}
          onChange={handleChange}
          placeholder={`${SITE_URL}/md-smart-launch`}
        />
        <EditableFieldRow
          label="EHR Launch URL"
          fieldKey="launchUri"
          value={editing ? draft.launchUri : identity.launchUri}
          error={errors.launchUri}
          mono
          editing={editing}
          onChange={handleChange}
          placeholder={`${SITE_URL}/md-smart-launch`}
        />
        <EditableFieldRow
          label="Logo URI"
          fieldKey="logoUri"
          value={editing ? draft.logoUri : identity.logoUri}
          error={errors.logoUri}
          mono
          editing={editing}
          onChange={handleChange}
        />
        <FieldRow label="Token Auth Method" value={SMART_MANIFEST.tokenEndpointAuthMethod} />
        <FieldRow label="Grant Types" value={SMART_MANIFEST.grantTypes.join(', ')} />
        <FieldRow label="Response Types" value={SMART_MANIFEST.responseTypes.join(', ')} />
        <FieldRow label="PKCE Required" value={SMART_MANIFEST.pkce ? 'Yes (S256)' : 'No'} />
        {editing && (
          <SaveBar
            onSave={handleSave}
            onCancel={handleCancel}
            hasErrors={hasErrors}
            saved={false}
          />
        )}
      </SectionCard>

      <SectionCard title="OAuth 2.0 Scopes" icon="KeyIcon">
        <div className="mb-3 text-xs text-carbon-gray-50">
          {SMART_MANIFEST.scopes.filter((s) => s.required).length} required ·{' '}
          {SMART_MANIFEST.scopes.filter((s) => !s.required).length} optional
        </div>
        <div className="space-y-0">
          {SMART_MANIFEST.scopes.map((s) => (
            <div
              key={s.scope}
              className="flex items-center gap-3 py-2 border-b border-carbon-gray-10 last:border-0"
            >
              <code className="text-xs font-mono bg-carbon-gray-10 px-2 py-0.5 text-carbon-gray-100 w-56 flex-shrink-0">
                {s.scope}
              </code>
              <span className="flex-1 text-xs text-carbon-gray-50">{s.description}</span>
              <span
                className={`text-2xs font-semibold px-1.5 py-0.5 flex-shrink-0 ${s.required ? 'bg-[#d0e2ff] text-[#0043ce]' : 'bg-carbon-gray-10 text-carbon-gray-50'}`}
              >
                {s.required ? 'Required' : 'Optional'}
              </span>
              <CopyButton value={s.scope} />
            </div>
          ))}
        </div>
        <div className="mt-4 p-3 bg-carbon-gray-10 border-l-2 border-carbon-blue">
          <p className="text-xs text-carbon-gray-70 font-mono break-all">
            {SMART_MANIFEST.scopes
              .filter((s) => s.required)
              .map((s) => s.scope)
              .join(' ')}
          </p>
          <div className="flex items-center justify-between mt-2">
            <span className="text-2xs text-carbon-gray-50">Full required scope string</span>
            <CopyButton
              value={SMART_MANIFEST.scopes
                .filter((s) => s.required)
                .map((s) => s.scope)
                .join(' ')}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="SMART Capabilities" icon="ShieldCheckIcon">
        <div className="flex flex-wrap gap-2 pt-1">
          {SMART_MANIFEST.smartCapabilities.map((cap) => (
            <span key={cap} className="text-xs font-mono bg-[#d0e2ff] text-[#0043ce] px-2 py-1">
              {cap}
            </span>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="app-launch-manifest.json" icon="DocumentTextIcon" defaultOpen={false}>
        <div className="relative">
          <pre className="text-xs font-mono bg-carbon-gray-100 text-[#78a9ff] p-4 overflow-x-auto leading-relaxed">
            {manifestJson}
          </pre>
          <div className="absolute top-2 right-2">
            <CopyButton value={manifestJson} />
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'smart' | 'cerner' | 'cds'>('smart');

  const tabs: { key: typeof activeTab; label: string; icon: string }[] = [
    { key: 'smart', label: 'SMART Manifest', icon: 'BoltIcon' },
    { key: 'cerner', label: 'Cerner Endpoints', icon: 'ServerIcon' },
    { key: 'cds', label: 'CDS Hooks', icon: 'CpuChipIcon' },
  ];

  return (
    <AppLayout
      pageTitle="EHR Deployment Settings"
      breadcrumbs={[{ label: 'Settings' }, { label: 'EHR Deployment' }]}
    >
      <div className="flex-1 overflow-y-auto bg-carbon-gray-10 p-6">
        {/* FHIR API Tester quick-access banner */}
        <Link
          href="/settings/fhir-tester"
          className="flex items-center gap-4 bg-white border border-carbon-gray-20 px-5 py-4 mb-5 hover:border-carbon-blue hover:bg-[#edf5ff] transition-colors group"
        >
          <div className="w-9 h-9 bg-[#d0e2ff] flex items-center justify-center flex-shrink-0">
            <Icon name="BeakerIcon" size={18} className="text-carbon-blue" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-carbon-gray-100 group-hover:text-carbon-blue transition-colors">
              Live FHIR API Tester
            </p>
            <p className="text-xs text-carbon-gray-50 mt-0.5">
              Validate patient lookup, order submission, and CDS hook calls against the Cerner
              sandbox
            </p>
          </div>
          <Icon
            name="ArrowRightIcon"
            size={16}
            className="text-carbon-gray-50 group-hover:text-carbon-blue transition-colors flex-shrink-0"
          />
        </Link>

        {/* Header strip */}
        <div className="bg-[#0f3460] text-white px-5 py-4 mb-5 flex items-start gap-4">
          <div className="w-10 h-10 bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Icon name="Cog6ToothIcon" size={22} className="text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Real EHR Deployment Configuration</h2>
            <p className="text-xs text-white/70 mt-0.5">
              SMART on FHIR App Manifest · Cerner Endpoint Registration · CDS Hooks Service URLs —
              copy values directly into your EHR app registration portal.
            </p>
          </div>
          <div className="ml-auto flex-shrink-0">
            <span className="text-2xs font-semibold bg-white/15 px-2 py-1">
              FHIR R4 · SMART 2.0 · CDS Hooks 2.0
            </span>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-carbon-gray-20 mb-5 bg-white">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.key
                  ? 'border-carbon-blue text-carbon-blue bg-[#d0e2ff]/20'
                  : 'border-transparent text-carbon-gray-50 hover:text-carbon-gray-100 hover:bg-carbon-gray-10'
              }`}
            >
              <Icon name={t.icon as any} size={16} />
              {t.label}
            </button>
          ))}
        </div>

        {/* ── SMART Manifest tab ── */}
        {activeTab === 'smart' && <SmartManifestTab />}

        {/* ── Cerner Endpoints tab ── */}
        {activeTab === 'cerner' && <CernerEndpointsTab />}

        {/* ── CDS Hooks tab ── */}
        {activeTab === 'cds' && (
          <div>
            <SectionCard title="CDS Hooks Discovery Endpoint" icon="MagnifyingGlassIcon">
              <FieldRow label="Discovery URL" value={`${SITE_URL}/api/cds-hooks`} mono />
              <FieldRow label="Spec Version" value="CDS Hooks 2.0" />
              <div className="mt-3 p-3 bg-carbon-gray-10 border-l-2 border-carbon-blue">
                <p className="text-xs text-carbon-gray-70">
                  Register the discovery URL in your EHR&apos;s CDS Hooks configuration. The EHR
                  will call this endpoint to retrieve all available hooks and their prefetch
                  templates automatically.
                </p>
              </div>
            </SectionCard>

            <div className="space-y-4">
              {CDS_HOOKS.map((hook) => (
                <div key={hook.id} className="bg-white border border-carbon-gray-20">
                  <div className="px-5 py-4 border-b border-carbon-gray-10 flex items-start gap-3">
                    <div className="w-8 h-8 bg-[#d0e2ff] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Icon name="CpuChipIcon" size={16} className="text-[#0043ce]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-carbon-gray-100">
                          {hook.title}
                        </span>
                        <code className="text-2xs font-mono bg-carbon-gray-10 px-1.5 py-0.5 text-carbon-gray-70">
                          {hook.hookType}
                        </code>
                      </div>
                      <p className="text-xs text-carbon-gray-50 mt-1">{hook.description}</p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {hook.cardTypes.map((ct) => (
                        <span
                          key={ct}
                          className={`text-2xs font-semibold px-1.5 py-0.5 ${
                            ct === 'critical'
                              ? 'bg-[#ffd7d9] text-[#da1e28]'
                              : ct === 'warning'
                                ? 'bg-[#fff8e1] text-[#d97706]'
                                : ct === 'suggestion'
                                  ? 'bg-[#defbe6] text-[#198038]'
                                  : 'bg-carbon-gray-10 text-carbon-gray-70'
                          }`}
                        >
                          {ct}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="px-5 py-3 space-y-0">
                    <div className="flex items-center gap-3 py-2 border-b border-carbon-gray-10">
                      <span className="w-28 flex-shrink-0 text-xs text-carbon-gray-50">
                        Hook URL
                      </span>
                      <code className="flex-1 text-xs font-mono text-carbon-gray-100 break-all">
                        {hook.url}
                      </code>
                      <CopyButton value={hook.url} />
                    </div>
                    <div className="flex items-start gap-3 py-2">
                      <span className="w-28 flex-shrink-0 text-xs text-carbon-gray-50 pt-0.5">
                        Prefetch
                      </span>
                      <div className="flex-1 space-y-1">
                        {hook.prefetch.map((pf, i) => (
                          <div key={i} className="flex items-center gap-1">
                            <code className="text-2xs font-mono bg-carbon-gray-10 px-1.5 py-0.5 text-carbon-gray-70 break-all flex-1">
                              {pf}
                            </code>
                            <CopyButton value={pf} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <SectionCard
              title="CDS Hooks Registration Checklist"
              icon="ClipboardDocumentCheckIcon"
              defaultOpen={false}
            >
              {[
                {
                  label: 'Register discovery URL in EHR CDS Hooks config',
                  detail: `${SITE_URL}/api/cds-hooks`,
                },
                {
                  label: 'Allowlist hook service domain in EHR firewall',
                  detail: new URL(SITE_URL).hostname,
                },
                {
                  label: 'Configure CORS for EHR origin',
                  detail: 'Allow: Authorization, Content-Type headers',
                },
                {
                  label: 'Set response timeout ≥ 5 seconds',
                  detail: 'CDS Hooks 2.0 §5.1 — EHR must wait at least 5s',
                },
                {
                  label: 'Enable prefetch template support',
                  detail: 'EHR populates prefetch before calling hook URL',
                },
                { label: 'Test with CDS Hooks Sandbox', detail: 'sandbox.cds-hooks.org' },
              ].map((item, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 py-2.5 border-b border-carbon-gray-10 last:border-0"
                >
                  <Icon
                    name="CheckCircleIcon"
                    size={16}
                    className="text-carbon-gray-30 flex-shrink-0 mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-carbon-gray-100">{item.label}</p>
                    <p className="text-2xs text-carbon-gray-50 mt-0.5 font-mono break-all">
                      {item.detail}
                    </p>
                  </div>
                </div>
              ))}
            </SectionCard>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
