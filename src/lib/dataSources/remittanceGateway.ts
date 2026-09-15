/**
 * Remittance gateway loader (O-2, order→cash).
 *
 * Normalized 835 remittance advice as received from the payer — per-claim paid
 * amounts, explicit per-group X12 adjustment dollars (CO/PR/OA/PI), and CARC/RARC
 * code lists — generic and persona-free. Seeded mode reads
 * data/remittance-advice.seed.json; production mode throws
 * DataSourceNotConfiguredError until a real 835/clearinghouse client is wired.
 * Deterministic: callers pass `asOf`.
 *
 * The seed carries NO precomputed reconciliation verdict — the verdict is computed
 * downstream (lib/goldenThread/reconciliation.ts) from the contracted allowed and
 * these per-group amounts. Capturing the amount per group is what lets FIX-2 keep
 * a CO write-off out of the recoverable delta.
 *
 * SEAM: remittanceGateway — mode-registry switch point (lib/config/dataMode.ts).
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
import seed from './data/remittance-advice.seed.json';

const SEAM = 'remittanceGateway';

/** The X12 claim-adjustment group codes an 835 adjustment can fall under. */
const ADJUSTMENT_GROUPS = ['CO', 'PR', 'OA', 'PI'] as const;
export type AdjustmentGroup = (typeof ADJUSTMENT_GROUPS)[number];

export interface RemittanceAdjustment {
  group: AdjustmentGroup;
  amount: number;
}

export interface Normalized835 {
  remittanceId: string;
  claimRef: string;
  payer: string;
  code: string;
  billedAmount: number;
  paidAmount: number;
  adjustments: RemittanceAdjustment[];
  carcCodes: string[];
  rarcCodes: string[];
  carcGroups: string[];
  paidDate: string;
}

export interface RemittanceAdvice {
  asOf: string;
  remittances: Normalized835[];
}

function parseStringArray(v: unknown, ctx: string): string[] {
  return reqArray(v ?? [], ctx).map((s, j) => {
    if (typeof s !== 'string' || s.length === 0) {
      throw new Error(`${ctx}[${j}]: must be a non-empty string`);
    }
    return s;
  });
}

function parseAdjustment(v: unknown, ctx: string): RemittanceAdjustment {
  const o = asRecord(v, ctx);
  const group = reqString(o, 'group', ctx);
  if (!(ADJUSTMENT_GROUPS as readonly string[]).includes(group)) {
    throw new Error(`${ctx}: 'group' must be one of ${ADJUSTMENT_GROUPS.join(', ')}`);
  }
  return { group: group as AdjustmentGroup, amount: reqNumber(o, 'amount', ctx) };
}

function parseRemittance(v: unknown, i: number): Normalized835 {
  const o = asRecord(v, `remittanceGateway.remittances[${i}]`);
  const ctx = `remittanceGateway.remittances[${i}]`;
  return {
    remittanceId: reqString(o, 'remittanceId', ctx),
    claimRef: reqString(o, 'claimRef', ctx),
    payer: reqString(o, 'payer', ctx),
    code: reqString(o, 'code', ctx),
    billedAmount: reqNumber(o, 'billedAmount', ctx),
    paidAmount: reqNumber(o, 'paidAmount', ctx),
    adjustments: reqArray(o.adjustments ?? [], `${ctx}.adjustments`).map((a, j) =>
      parseAdjustment(a, `${ctx}.adjustments[${j}]`)
    ),
    carcCodes: parseStringArray(o.carcCodes, `${ctx}.carcCodes`),
    rarcCodes: parseStringArray(o.rarcCodes, `${ctx}.rarcCodes`),
    carcGroups: parseStringArray(o.carcGroups, `${ctx}.carcGroups`),
    paidDate: reqString(o, 'paidDate', ctx),
  };
}

/** Normalize a raw 835 document. Exported for direct-parse tests / real clients. */
export function normalizeRemittanceAdvice(raw: unknown, asOf: string): RemittanceAdvice {
  const doc = asRecord(raw, 'remittanceGateway');
  const remittances = reqArray(doc.remittances ?? [], 'remittanceGateway.remittances').map(
    parseRemittance
  );
  return { asOf, remittances };
}

export const seededRemittanceGatewayLoader: DataSourceLoader<RemittanceAdvice> = {
  id: 'seeded-remittance-gateway',
  async load(asOf: string): Promise<RemittanceAdvice> {
    return normalizeRemittanceAdvice(seed, asOf);
  },
};

export const productionRemittanceGatewayLoader: DataSourceLoader<RemittanceAdvice> = {
  id: 'production-remittance-gateway',
  async load(): Promise<RemittanceAdvice> {
    throw new DataSourceNotConfiguredError(
      SEAM,
      'Implement an 835 remittance client here (payer/clearinghouse ERA feed).'
    );
  },
};

/** Resolve the remittance-gateway loader for the configured 'remittanceGateway' mode. */
export function getRemittanceGatewayLoader(): DataSourceLoader<RemittanceAdvice> {
  return selectLoader(SEAM, seededRemittanceGatewayLoader, productionRemittanceGatewayLoader);
}
