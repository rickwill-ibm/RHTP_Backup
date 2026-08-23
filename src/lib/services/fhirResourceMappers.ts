import * as clock from '@/lib/clock'; // deterministic time/rng seam (test setters: setClock/setRng)
/**
 * FHIR R4 Resource Mappers
 *
 * Maps FHIR R4 resources returned by HAPI FHIR into the app's RegistryPatient
 * shape.  Used when NEXT_PUBLIC_USE_MOCK_DATA=false.
 *
 * FHIR R4 resource types handled:
 *   Patient        → demographics, identifiers, extensions (RAF, risk tier, …)
 *   Observation    → care gaps (domain / status / daysOpen)
 *   Flag           → CDS alert cards
 *   RiskAssessment → RAF score + ER risk %
 *
 * Extensions written by migrate-patients.mjs are consumed here.
 */
import type {
  RegistryPatient,
  CareGapEntry,
  CdsCardEntry,
  PathwayStepEntry,
} from '../patientRegistry';
import { getPatientById } from '../patientRegistry';

// ─── Raw FHIR R4 JSON types (minimal, only fields we use) ────────────────────

interface FhirExtension {
  url: string;
  valueString?: string;
  valueDecimal?: number;
  valueInteger?: number;
  valueBoolean?: boolean;
}

interface FhirPatient {
  resourceType: 'Patient';
  id: string;
  identifier?: { system: string; value: string }[];
  name?: { use?: string; family?: string; given?: string[] }[];
  gender?: string;
  birthDate?: string;
  telecom?: { system?: string; value?: string; use?: string }[];
  address?: { use?: string; text?: string }[];
  communication?: {
    language?: { coding?: { code?: string }[]; text?: string };
    preferred?: boolean;
  }[];
  extension?: FhirExtension[];
  managingOrganization?: { display?: string };
  generalPractitioner?: { display?: string }[];
}

interface FhirObservation {
  resourceType: 'Observation';
  id: string;
  status: string;
  code?: { text?: string; coding?: { system?: string; code?: string; display?: string }[] };
  valueInteger?: number;
  valueQuantity?: { value?: number; unit?: string };
  valueString?: string;
  effectiveDateTime?: string;
  extension?: FhirExtension[];
}

interface FhirEncounter {
  resourceType: 'Encounter';
  id: string;
  status: string;
  class?: { code?: string; display?: string };
  type?: { text?: string; coding?: { code?: string; display?: string }[] }[];
  period?: { start?: string; end?: string };
  serviceProvider?: { display?: string };
  participant?: { individual?: { display?: string }; type?: { coding?: { code?: string }[] }[] }[];
  reasonCode?: { text?: string; coding?: { code?: string; display?: string }[] }[];
}

interface FhirGoal {
  resourceType: 'Goal';
  id: string;
  lifecycleStatus: string;
  description?: { text?: string };
  subject?: { reference?: string };
  target?: { dueDate?: string; measure?: { text?: string }; detailString?: string }[];
  note?: { text?: string }[];
  extension?: FhirExtension[];
}

interface FhirCondition {
  resourceType: 'Condition';
  id: string;
  code?: { text?: string; coding?: { system?: string; code?: string; display?: string }[] };
  clinicalStatus?: { coding?: { code?: string }[] };
  category?: { coding?: { code?: string }[] }[];
  onsetDateTime?: string;
  subject?: { reference?: string };
}

interface FhirMedicationRequest {
  resourceType: 'MedicationRequest';
  id: string;
  status?: string;
  medicationCodeableConcept?: { text?: string; coding?: { system?: string; code?: string; display?: string }[] };
  requester?: { display?: string };
  dosageInstruction?: { text?: string }[];
  note?: { text?: string }[];
  extension?: FhirExtension[];
}

interface FhirFlag {
  resourceType: 'Flag';
  id: string;
  status: string;
  code?: { text?: string; coding?: { code?: string; display?: string }[] };
  extension?: FhirExtension[];
}

interface FhirCareTeamParticipant {
  role?: { coding?: { system?: string; code?: string; display?: string }[] }[];
  member?: { reference?: string; display?: string };
  extension?: FhirExtension[];
}

interface FhirCareTeam {
  resourceType: 'CareTeam';
  id: string;
  name?: string;
  status?: string;
  subject?: { reference?: string; display?: string };
  managingOrganization?: { display?: string }[];
  participant?: FhirCareTeamParticipant[];
  extension?: FhirExtension[];
}

interface FhirRiskAssessment {
  resourceType: 'RiskAssessment';
  id: string;
  prediction?: { probabilityDecimal?: number }[];
  extension?: FhirExtension[];
}

interface FhirBundle<T> {
  resourceType: 'Bundle';
  entry?: { resource?: T }[];
}

// ─── Extension helpers ────────────────────────────────────────────────────────

function ext(extensions: FhirExtension[] | undefined, url: string): FhirExtension | undefined {
  return extensions?.find((e) => e.url === url);
}

function extStr(extensions: FhirExtension[] | undefined, url: string): string {
  return ext(extensions, url)?.valueString ?? '';
}

function extNum(extensions: FhirExtension[] | undefined, url: string): number {
  const e = ext(extensions, url);
  return e?.valueDecimal ?? e?.valueInteger ?? 0;
}

const BASE = 'http://tcoc.example.org/fhir/StructureDefinition';

// ─── Patient mapper ───────────────────────────────────────────────────────────

// LOINC codes for BH screening scores we read from the Observation bundle
const BH_LOINC_PHQ9      = '44249-1';
const BH_LOINC_EDINBURGH = '89204-2';
const BH_LOINC_AUDITC    = '75624-7';

export function mapFhirPatientToRegistryPatient(
  patient: FhirPatient,
  observations: FhirObservation[],
  flags: FhirFlag[],
  riskAssessment: FhirRiskAssessment | undefined,
  fhirConditions: FhirCondition[] = [],
  fhirMedications: FhirMedicationRequest[] = [],
  fhirCareTeam?: FhirCareTeam,
  fhirEncounters: FhirEncounter[] = [],
  fhirGoals: FhirGoal[] = [],
): RegistryPatient {
  // Name
  const officialName = patient.name?.find((n) => n.use === 'official') ?? patient.name?.[0];
  const given = officialName?.given ?? [];
  const family = officialName?.family ?? '';
  const fullName = [...given, family].filter(Boolean).join(' ');

  // Identifiers
  const platformId =
    patient.identifier?.find((i) => i.system === 'urn:tcoc:platform-id')?.value ?? patient.id;
  const ehrMrn =
    patient.identifier?.find((i) => i.system === 'urn:tcoc:ehr-mrn')?.value ?? patient.id;

  // Demographics
  const gender = patient.gender === 'male' ? 'M' : patient.gender === 'female' ? 'F' : 'U';
  const dob = patient.birthDate ?? '';
  const birthYear = dob ? new Date(dob).getFullYear() : clock.nowDate().getFullYear();
  const age = clock.nowDate().getFullYear() - birthYear;

  // Contact
  const phone =
    patient.telecom?.find((t) => t.system === 'phone')?.value ?? '';
  const location = patient.address?.find((a) => a.use === 'home')?.text ?? '';

  // Language
  const language =
    patient.communication?.[0]?.language?.text ??
    patient.communication?.[0]?.language?.coding?.[0]?.code ??
    'English';

  // Extensions from migration
  const exts = patient.extension;
  const rafScore = extNum(exts, `${BASE}/raf-score`);
  const riskTierRaw = extStr(exts, `${BASE}/risk-tier`);
  const riskTier = (['Critical', 'High', 'Moderate', 'Low'].includes(riskTierRaw)
    ? riskTierRaw
    : 'Moderate') as RegistryPatient['riskTier'];
  const erRiskPct = extNum(exts, `${BASE}/er-risk-pct`);
  const careManager = extStr(exts, `${BASE}/care-manager`);
  const episodeType = extStr(exts, `${BASE}/episode-type`);
  const pmpm = extNum(exts, `${BASE}/pmpm`);
  const pmpmTarget = extNum(exts, `${BASE}/pmpm-target`);
  const contract = extStr(exts, `${BASE}/contract`);

  // Risk assessment overrides
  const riskExts = riskAssessment?.extension;
  const hccSuspects = extNum(riskExts, `${BASE}/hcc-suspects`);
  const hccValue = extNum(riskExts, `${BASE}/hcc-value`);

  // ── CareTeam extraction ───────────────────────────────────────────────────
  const CARETEAM_ROLE_EXT = `${BASE}/careteam-role`;
  const ctParticipant = (role: string) =>
    fhirCareTeam?.participant?.find(
      (p) => p.extension?.some((e) => e.url === CARETEAM_ROLE_EXT && e.valueString === role),
    );
  const ctPcp        = ctParticipant('PCP')?.member?.display ?? '';
  const ctCareManager = ctParticipant('CareManager')?.member?.display ?? '';
  const ctBhProvider  = ctParticipant('BHProvider')?.member?.display ?? '';

  // ── BH scores from FHIR Observations ──────────────────────────────────────
  // Filter to just the known BH LOINC codes; split out from care-gap observations.
  const isBhScore = (obs: FhirObservation) => {
    const code = obs.code?.coding?.[0]?.code ?? '';
    return code === BH_LOINC_PHQ9 || code === BH_LOINC_EDINBURGH || code === BH_LOINC_AUDITC;
  };
  const isSdoh = (obs: FhirObservation) =>
    obs.code?.coding?.[0]?.system === 'http://loinc.org' &&
    (obs.code?.coding?.[0]?.code ?? '').startsWith('93');

  const bhObservations = observations.filter(isBhScore);
  const sdohObservations = observations.filter(isSdoh);
  const gapObservations = observations.filter((o) => !isBhScore(o) && !isSdoh(o));

  // ── SDOH values from FHIR PRAPARE Observations ────────────────────────────
  const SDOH_TRANSPORT_LOINC = '93034-7';
  const SDOH_HOUSING_LOINC   = '93030-5';
  const SDOH_FOOD_LOINC      = '93031-3';

  const sdohValue = (loinc: string): string =>
    sdohObservations.find((o) => o.code?.coding?.[0]?.code === loinc)?.valueString ?? '';

  const fhirTransportStatus = sdohValue(SDOH_TRANSPORT_LOINC);
  const fhirHousingStatus   = sdohValue(SDOH_HOUSING_LOINC);
  const fhirFoodSecurity    = sdohValue(SDOH_FOOD_LOINC);

  const phq9Obs      = bhObservations.find((o) => o.code?.coding?.[0]?.code === BH_LOINC_PHQ9);
  const edinburghObs = bhObservations.find((o) => o.code?.coding?.[0]?.code === BH_LOINC_EDINBURGH);
  const auditcObs    = bhObservations.find((o) => o.code?.coding?.[0]?.code === BH_LOINC_AUDITC);

  // Prefer Edinburgh for bhScore when present (postpartum patients), otherwise PHQ-9
  const primaryBhObs = edinburghObs ?? phq9Obs;
  const bhScoreValue = primaryBhObs?.valueQuantity?.value ?? extNum(primaryBhObs?.extension, `${BASE}/tcoc-bh-score`) ?? null;
  const auditCValue  = auditcObs?.valueQuantity?.value ?? 0;

  // Derive bhRisk from score
  const deriveBhRisk = (score: number | null): RegistryPatient['bhRisk'] => {
    if (score === null) return 'Low';
    if (score >= 20) return 'Crisis';
    if (score >= 15) return 'High';
    if (score >= 10) return 'Moderate';
    return 'Low';
  };
  const fhirBhRisk = deriveBhRisk(bhScoreValue);
  const fhirBhScoreLabel = primaryBhObs
    ? `${primaryBhObs.code?.text ?? primaryBhObs.code?.coding?.[0]?.display ?? 'BH Score'} ${bhScoreValue}`
    : '';

  // ── Conditions from FHIR ──────────────────────────────────────────────────
  const mappedConditions: import('../patientRegistry').ConditionEntry[] = fhirConditions.map((c) => ({
    key: c.id,
    code: c.code?.coding?.[0]?.code ?? c.id,
    name: c.code?.text ?? c.code?.coding?.[0]?.display ?? 'Unknown Condition',
    onset: c.onsetDateTime?.substring(0, 7) ?? '',
    status: c.clinicalStatus?.coding?.[0]?.code ?? 'active',
    source: 'FHIR',
  }));

  // ── MedicationRequests from FHIR ──────────────────────────────────────────
  const mappedMedications: import('../patientRegistry').MedicationEntry[] = fhirMedications.map((m) => ({
    key: m.id,
    name: m.medicationCodeableConcept?.text ?? m.medicationCodeableConcept?.coding?.[0]?.display ?? 'Unknown Medication',
    dose: m.dosageInstruction?.[0]?.text ?? '',
    frequency: m.dosageInstruction?.[0]?.text ?? '',
    prescriber: m.requester?.display ?? '',
    lastFill: extStr(m.extension, `${BASE}/last-fill-date`) || m.note?.[0]?.text?.replace('Last fill: ', '') || '',
    adherence: null,
    ddi: false,
  }));

  // ── Care gaps from Observations ───────────────────────────────────────────
  // Care gaps from Observations
  const careGaps: CareGapEntry[] = gapObservations.map((obs) => {
    const oExts = obs.extension;
    const statusRaw = extStr(oExts, `${BASE}/care-gap-status`);
    const status = (['Open', 'In Progress', 'Closed', 'Waived'].includes(statusRaw)
      ? statusRaw
      : 'Open') as CareGapEntry['status'];
    const domain = (extStr(oExts, `${BASE}/care-gap-domain`) || 'Clinical') as CareGapEntry['domain'];
    return {
      id: extStr(oExts, `${BASE}/tcoc-gap-id`) || obs.id,
      domain,
      name: obs.code?.text ?? 'Care Gap',
      status,
      daysOpen: extNum(oExts, `${BASE}/care-gap-days-open`) || obs.valueInteger || 0,
      assignedTo: careManager || 'Care Team',
    };
  });

  // CDS cards from Flags
  const cdsCards: CdsCardEntry[] = flags.map((flag) => {
    const fExts = flag.extension;
    const indicatorRaw = flag.code?.coding?.[0]?.code ?? 'info';
    const indicator = (['critical', 'warning', 'info'].includes(indicatorRaw)
      ? indicatorRaw
      : 'info') as CdsCardEntry['indicator'];
    return {
      id: extStr(fExts, `${BASE}/tcoc-cds-id`) || flag.id,
      indicator,
      summary: flag.code?.text ?? '',
      detail: extStr(fExts, `${BASE}/cds-detail`),
    };
  });

  // Pathway steps, BH, social, clinical — not stored in FHIR extensions.
  // Overlay from local registry so the UI always has rich data even in
  // live-FHIR mode (FHIR is the source of truth for demographics + care gaps;
  // the registry is the source of truth for everything else).
  const local = getPatientById(platformId);

  const pathwaySteps: PathwayStepEntry[] = local?.pathwaySteps ?? [];

  const fhirPatient: RegistryPatient = {
    platformId,
    fhirId: patient.id,
    ehrMrn,
    name: fullName,
    age,
    gender,
    dob,
    location,
    phone,
    pcp: ctPcp || patient.generalPractitioner?.[0]?.display || local?.pcp || '',
    careManager: ctCareManager || careManager,
    careManagerInitials: (ctCareManager || careManager).split(' ').map((w: string) => w[0]).join('') || local?.careManagerInitials || '',
    organization: patient.managingOrganization?.display ?? local?.organization ?? '',
    contract,
    attribution: local?.attribution ?? 'Confirmed',
    rafScore,
    riskTier,
    riskLabel: `${riskTier} — ${erRiskPct}% ER risk`,
    erRiskPct,
    hccSuspects,
    hccValue,
    openCareGaps: careGaps.filter((g) => g.status === 'Open' || g.status === 'In Progress').length,
    episodeType: episodeType || local?.episodeType || '',
    episodeStatus: local?.episodeStatus ?? 'Active',
    episodeDaysActive: local?.episodeDaysActive ?? 0,
    pmpm,
    pmpmTarget,
    lastContact: local?.lastContact ?? '',
    // BH — prefer FHIR Observation values; fall back to registry overlay
    bhScreeningLabel: primaryBhObs?.code?.text ?? local?.bhScreeningLabel ?? '',
    bhScore: bhScoreValue !== null ? bhScoreValue : (local?.bhScore ?? null),
    bhScoreLabel: fhirBhScoreLabel || local?.bhScoreLabel || '',
    auditC: auditCValue || local?.auditC || 0,
    bhRisk: bhScoreValue !== null ? fhirBhRisk : (local?.bhRisk ?? 'Low'),
    bhReferralStatus: local?.bhReferralStatus ?? '',
    bhProvider: ctBhProvider || local?.bhProvider || '',
    burdenScore: local?.burdenScore ?? '',
    patientGoal: local?.patientGoal ?? '',
    // Social — prefer FHIR SDOH Observations; fall back to registry overlay
    transportStatus: fhirTransportStatus || local?.transportStatus || '',
    foodSecurity: fhirFoodSecurity || local?.foodSecurity || '',
    housingStatus: fhirHousingStatus || local?.housingStatus || '',
    language,
    ruralDistance: local?.ruralDistance ?? '',
    disparityFlag: local?.disparityFlag ?? '',
    cohortFlag: local?.cohortFlag ?? '',
    snapStatus: local?.snapStatus ?? '',
    digitalAccess: local?.digitalAccess ?? '',
    // Conditions and medications — prefer FHIR; fall back to registry
    conditions: mappedConditions.length > 0 ? mappedConditions : local?.conditions,
    medications: mappedMedications.length > 0 ? mappedMedications : local?.medications,
    recentOrders: local?.recentOrders,
    carePlanDomains: local?.carePlanDomains,
    // Encounters from FHIR — used by episode detail / analytics screens
    recentEncounters: fhirEncounters.length > 0 ? fhirEncounters.map((e) => ({
      id: e.id,
      date: e.period?.start?.split('T')[0] ?? '',
      type: e.type?.[0]?.text ?? e.class?.display ?? 'Encounter',
      setting: e.class?.code === 'PHN' ? 'Phone' : e.class?.code === 'AMB' ? 'Outpatient' : 'Other',
      provider: e.participant?.[0]?.individual?.display ?? e.serviceProvider?.display ?? '',
      reason: e.reasonCode?.[0]?.text ?? '',
      status: e.status,
    })) : local?.recentEncounters,
    // Goals from FHIR
    fhirGoals: fhirGoals.length > 0 ? fhirGoals.map((g) => ({
      id: g.id,
      description: g.description?.text ?? '',
      status: g.lifecycleStatus,
      dueDate: g.target?.[0]?.dueDate ?? '',
      note: g.note?.[0]?.text ?? '',
    })) : undefined,
    // Care gaps from FHIR (authoritative); fall back to registry if FHIR returned none
    careGaps: careGaps.length > 0 ? careGaps : (local?.careGaps ?? []),
    pathwaySteps,
    aiCopilot: local?.aiCopilot ?? '',
    cdsCards: cdsCards.length > 0 ? cdsCards : (local?.cdsCards ?? []),
    household: local?.household,
    journey: local?.journey,
    mockOnly: local?.mockOnly,
  };

  return fhirPatient;
}

// ─── Bundle helper — extract entries of a given resourceType ─────────────────

export function bundleEntries<T extends { resourceType: string }>(
  bundle: FhirBundle<T>,
  resourceType: string,
): T[] {
  return (bundle.entry ?? [])
    .map((e) => e.resource)
    .filter((r): r is T => r?.resourceType === resourceType);
}
