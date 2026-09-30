// Thin typed loader for the synthetic CBO directory + referral-task queue
// (AI-CODING-CONVENTIONS §2: data lives in *.json, code loads it).
// Organisation names resolve from the canonical registry (§1.1 single source) via
// orgEntityId, so a rename propagates to every screen instead of diverging — the seed
// stores an id, not a name. Every address, phone and email in the seed files is
// synthetic and identifies no real entity; county/city/ZIP/lat/lng are geography only.
// NOT from the '@/lib/dataSources' BARREL, and the reason is a build failure, not style. That
// barrel re-exports `submissionGateway`, which imports `node:crypto`. This module is reached from a
// `'use client'` page, so webpack pulls the whole barrel into the BROWSER bundle and the production
// build dies with `UnhandledSchemeError: Reading from "node:crypto"`. These two helpers are pure
// string lookups over a JSON seed; importing the leaf keeps the server-only module out of the client
// graph. Register G-066.
import { entityName, entityShortName } from '@/lib/dataSources/syntheticEntities';
import cboSeed from './data/cbo-directory.json';
import taskSeed from './data/referral-tasks.json';

export type Provider = 'findhelp' | 'uniteus';
export type Capacity = 'Accepting' | 'Waitlist' | 'Full';
export type TaskStatus = 'Pending' | 'Accepted' | 'Completed';

export interface MoCBO {
  id: string;
  number: number;
  name: string;
  org: string;
  domain: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  county: string;
  zip: string;
  capacity: Capacity;
  connected: boolean;
  provider: Provider;
  lat: number;
  lng: number;
}

export interface ReferralTask {
  id: string;
  taskId: string;
  program: string;
  domain: string;
  status: TaskStatus;
  createdDate: string;
  dueDate: string;
  priority: 'High' | 'Medium' | 'Low';
  patientName: string;
  patientId: string;
  patientMrn: string;
  patientPhone: string;
  patientAddress: string;
  patientDob: string;
  enrolledBy: string;
  notes: string;
  monthlyValue: string;
}

/** The anchor CBO whose referral-task queue the screen drills into. */
export const ANCHOR_CBO_ORG = entityName('ent-frontier-action');

interface MoCBOSeed extends Omit<MoCBO, 'org'> {
  org?: string;
  orgEntityId?: string;
  orgServiceLine?: string;
  orgNameForm?: 'long' | 'short';
}

/** Registry name plus the row's own service line; a plain literal names no organisation. */
function resolveOrg(row: MoCBOSeed): string {
  if (!row.orgEntityId) return row.org ?? '';
  const base =
    row.orgNameForm === 'short' ? entityShortName(row.orgEntityId) : entityName(row.orgEntityId);
  return row.orgServiceLine ? `${base} ${row.orgServiceLine}` : base;
}

export const MO_CBOS: MoCBO[] = (cboSeed.cbos as unknown as MoCBOSeed[]).map((row) => ({
  ...row,
  org: resolveOrg(row),
}));
export const CBO_REFERRAL_TASKS: ReferralTask[] = taskSeed.tasks as ReferralTask[];
