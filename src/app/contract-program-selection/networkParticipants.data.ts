// Thin typed loader for the synthetic network-participant roster (AI-CODING-CONVENTIONS §2:
// data lives in *.json, code loads it). Organisation names are NOT stored in the seed — each
// row carries an entityId resolved against the canonical registry (§1.1 single source), so a
// rename propagates instead of diverging. This screen and /provider-level showed the same
// organisation under two names one click apart before the registry existed.
// county/region values are geography only and carry no attribution.
// NOT from the '@/lib/dataSources' BARREL, and the reason is a build failure, not style. That
// barrel re-exports `submissionGateway`, which imports `node:crypto`. This module is reached from a
// `'use client'` page, so webpack pulls the whole barrel into the BROWSER bundle and the production
// build dies with `UnhandledSchemeError: Reading from "node:crypto"`. These two helpers are pure
// string lookups over a JSON seed; importing the leaf keeps the server-only module out of the client
// graph. Register G-066.
import { entityName } from '@/lib/dataSources/syntheticEntities';
import seed from './data/network-participants.json';

export type ParticipantType = 'FQHC' | 'Rural Hospital' | 'PCP Practice' | 'Specialist Group';

export interface NetworkOrg {
  id: string;
  name: string;
  type: ParticipantType;
  county: string;
  region: string;
  regionName: string;
  providers: number;
  patients: number;
  gapClosure: number;
  gainShare: string;
  status: 'Active' | 'At Risk';
  color: string;
}

interface NetworkOrgSeed extends Omit<NetworkOrg, 'name'> {
  entityId: string;
  serviceLine?: string;
}

/** Registry name, plus the row's own service line when it names one. */
function resolveName(row: NetworkOrgSeed): string {
  const base = entityName(row.entityId);
  return row.serviceLine ? `${base} ${row.serviceLine}` : base;
}

export const NETWORK_ORGS: readonly NetworkOrg[] = (
  seed.organizations as unknown as NetworkOrgSeed[]
).map((row) => ({ ...row, name: resolveName(row) }));

export const PARTICIPANT_TYPES: readonly ParticipantType[] = [
  'FQHC',
  'Rural Hospital',
  'PCP Practice',
  'Specialist Group',
];
