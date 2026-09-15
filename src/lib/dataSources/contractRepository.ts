/**
 * Contract repository loader (O-2, order→cash).
 *
 * Normalized fee schedule of contracted allowed amounts by procedure code + payer,
 * generic and persona-free. Seeded mode reads data/fee-schedule.seed.json;
 * production mode throws DataSourceNotConfiguredError until a real
 * contract-management / fee-schedule client is wired. Deterministic: callers pass
 * `asOf`.
 *
 * The contracted allowed is the payer-owed baseline reconciliation compares the
 * paid amount against (net of patient-responsibility adjustments).
 *
 * SEAM: contractRepository — mode-registry switch point (lib/config/dataMode.ts).
 */
import {
  type DataSourceLoader,
  DataSourceNotConfiguredError,
  selectLoader,
  asRecord,
  reqString,
  reqNumber,
  reqArray,
} from './common';
import seed from './data/fee-schedule.seed.json';

const SEAM = 'contractRepository';

export interface ContractedRate {
  code: string;
  payer: string;
  contractedAllowed: number;
  effectiveOn: string;
}

export interface FeeSchedule {
  asOf: string;
  rates: ContractedRate[];
  /** Exact code+payer lookup; undefined when no contracted rate is on file. */
  lookup(code: string, payer: string): ContractedRate | undefined;
}

function parseRate(v: unknown, i: number): ContractedRate {
  const o = asRecord(v, `contractRepository.rates[${i}]`);
  const ctx = `contractRepository.rates[${i}]`;
  return {
    code: reqString(o, 'code', ctx),
    payer: reqString(o, 'payer', ctx),
    contractedAllowed: reqNumber(o, 'contractedAllowed', ctx),
    effectiveOn: reqString(o, 'effectiveOn', ctx),
  };
}

function makeFeeSchedule(asOf: string, rates: ContractedRate[]): FeeSchedule {
  return {
    asOf,
    rates,
    lookup(code: string, payer: string): ContractedRate | undefined {
      return rates.find((r) => r.code === code && r.payer === payer);
    },
  };
}

/** Normalize a raw fee-schedule document. Exported for direct-parse tests / real clients. */
export function normalizeFeeSchedule(raw: unknown, asOf: string): FeeSchedule {
  const doc = asRecord(raw, 'contractRepository');
  const rates = reqArray(doc.rates ?? [], 'contractRepository.rates').map(parseRate);
  return makeFeeSchedule(asOf, rates);
}

export const seededContractRepositoryLoader: DataSourceLoader<FeeSchedule> = {
  id: 'seeded-contract-repository',
  async load(asOf: string): Promise<FeeSchedule> {
    return normalizeFeeSchedule(seed, asOf);
  },
};

export const productionContractRepositoryLoader: DataSourceLoader<FeeSchedule> = {
  id: 'production-contract-repository',
  async load(): Promise<FeeSchedule> {
    throw new DataSourceNotConfiguredError(
      SEAM,
      'Implement a contract/fee-schedule client here (contract-management system).'
    );
  },
};

/** Resolve the contract-repository loader for the configured 'contractRepository' mode. */
export function getContractRepositoryLoader(): DataSourceLoader<FeeSchedule> {
  return selectLoader(SEAM, seededContractRepositoryLoader, productionContractRepositoryLoader);
}
