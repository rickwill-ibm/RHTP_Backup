/**
 * Gold-card roster loader (O-2).
 *
 * Normalized feed of granted gold cards + raw PA-outcome histories, generic and
 * persona-free. Seeded mode reads data/gold-card-roster.seed.json; production
 * mode throws DataSourceNotConfiguredError until a real roster client (payer
 * roster API / warehouse query) is wired. Deterministic: callers pass `asOf`.
 *
 * SEAM: goldCardRoster — mode-registry switch point (lib/config/dataMode.ts).
 */
import {
  type DataSourceLoader,
  DataSourceNotConfiguredError,
  selectLoader,
  asRecord,
  reqString,
  reqNumber,
  reqBool,
  reqArray,
} from './common';
import seed from './data/gold-card-roster.seed.json';

const SEAM = 'goldCardRoster';

export interface NormalizedGoldCard {
  providerNpi: string;
  code: string;
  payer: string;
  program: string;
  approvalRate: number;
  sampleSize: number;
  lookbackMonths: number;
  grantedOn: string;
  expiresOn: string;
  revoked: boolean;
}

export interface NormalizedPaHistory {
  providerNpi: string;
  code: string;
  payer: string;
  submissions: number;
  approvals: number;
  windowMonths: number;
}

export interface GoldCardRoster {
  asOf: string;
  cards: NormalizedGoldCard[];
  histories: NormalizedPaHistory[];
}

function parseCard(v: unknown, i: number): NormalizedGoldCard {
  const o = asRecord(v, `goldCardRoster.cards[${i}]`);
  const ctx = `goldCardRoster.cards[${i}]`;
  return {
    providerNpi: reqString(o, 'providerNpi', ctx),
    code: reqString(o, 'code', ctx),
    payer: reqString(o, 'payer', ctx),
    program: reqString(o, 'program', ctx),
    approvalRate: reqNumber(o, 'approvalRate', ctx),
    sampleSize: reqNumber(o, 'sampleSize', ctx),
    lookbackMonths: reqNumber(o, 'lookbackMonths', ctx),
    grantedOn: reqString(o, 'grantedOn', ctx),
    expiresOn: reqString(o, 'expiresOn', ctx),
    revoked: reqBool(o, 'revoked', ctx),
  };
}

function parseHistory(v: unknown, i: number): NormalizedPaHistory {
  const o = asRecord(v, `goldCardRoster.histories[${i}]`);
  const ctx = `goldCardRoster.histories[${i}]`;
  const submissions = reqNumber(o, 'submissions', ctx);
  const approvals = reqNumber(o, 'approvals', ctx);
  if (approvals > submissions) throw new Error(`${ctx}: approvals cannot exceed submissions`);
  return {
    providerNpi: reqString(o, 'providerNpi', ctx),
    code: reqString(o, 'code', ctx),
    payer: reqString(o, 'payer', ctx),
    submissions,
    approvals,
    windowMonths: reqNumber(o, 'windowMonths', ctx),
  };
}

/** Normalize a raw roster document. Exported for direct-parse tests / real clients. */
export function normalizeGoldCardRoster(raw: unknown, asOf: string): GoldCardRoster {
  const doc = asRecord(raw, 'goldCardRoster');
  const cards = reqArray(doc.cards ?? [], 'goldCardRoster.cards').map(parseCard);
  const histories = reqArray(doc.histories ?? [], 'goldCardRoster.histories').map(parseHistory);
  return { asOf, cards, histories };
}

export const seededGoldCardRosterLoader: DataSourceLoader<GoldCardRoster> = {
  id: 'seeded-gold-card-roster',
  async load(asOf: string): Promise<GoldCardRoster> {
    return normalizeGoldCardRoster(seed, asOf);
  },
};

export const productionGoldCardRosterLoader: DataSourceLoader<GoldCardRoster> = {
  id: 'production-gold-card-roster',
  async load(): Promise<GoldCardRoster> {
    throw new DataSourceNotConfiguredError(
      SEAM,
      'Implement a roster client here (payer roster API / warehouse query).'
    );
  },
};

/** Resolve the gold-card roster loader for the configured 'goldCardRoster' mode. */
export function getGoldCardRosterLoader(): DataSourceLoader<GoldCardRoster> {
  return selectLoader(SEAM, seededGoldCardRosterLoader, productionGoldCardRosterLoader);
}
