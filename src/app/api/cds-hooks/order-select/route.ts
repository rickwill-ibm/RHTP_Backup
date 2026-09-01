/**
 * CDS Hooks — order-select hook: HOSTED Coverage Requirements Discovery (CRD) service.
 * POST /api/cds-hooks/order-select
 *
 * The platform acting as a CDS Hooks SERVICE (an EHR calls it when a clinician selects an
 * order), returning coverage-requirement cards from the SHARED producer
 * (src/lib/policy/crd/coverageRequirementCards.ts) — the same card source as the /api/cds
 * client mock, so mock and hosted paths are shape-identical (E15 parity).
 *
 * FAIL-CLOSED: a coverage service must NEVER return an empty card list — to an EHR, `[]`
 * reads as "no prior authorization needed". Unknown/missing patient, no structured order,
 * or any error → an explicit "could not determine — verify PA manually" warning card. It
 * never falls back to a demo scenario (that would surface one patient's PA card on another's
 * order — a wrong-patient / PHI defect).
 *
 * SCOPE: advisory coverage at order-SELECT (selection time), keyed off `context.selections`.
 * It does NOT emit Da Vinci CRD `coverage-information` system-actions, and does not cover the
 * sign-time (order-sign) determination.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getPatientById, getPatientByFhirId, FHIR_ID_MAP } from '@/lib/patientRegistry';
import {
  buildCrdCards,
  crdIndeterminateCards,
  crdInputFromOrder,
  type CrdCoverageCard,
  type DraftOrderResource,
} from '@/lib/policy/crd/coverageRequirementCards';

export const runtime = 'nodejs';

interface OrderSelectBody {
  context?: {
    patientId?: string;
    selections?: string[];
    draftOrders?: { entry?: { resource?: DraftOrderResource }[] };
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: OrderSelectBody;
  try {
    body = (await req.json()) as OrderSelectBody;
  } catch {
    // Malformed envelope: fail closed (NOT empty), 400 per CDS Hooks.
    return NextResponse.json({ cards: crdIndeterminateCards() }, { status: 400 });
  }

  const ctx = body?.context ?? {};
  const patientId = ctx.patientId;

  // Resolve via the PRODUCTION registry only — no demo-scenario fallback (wrong-patient guard).
  const patient = patientId
    ? (getPatientByFhirId(patientId) ??
      getPatientById(patientId) ??
      getPatientById(FHIR_ID_MAP[patientId] ?? ''))
    : undefined;
  if (!patientId || !patient) {
    return NextResponse.json({ cards: crdIndeterminateCards() });
  }

  // order-select carries `selections`; build cards only for the orders actually selected.
  const resources = (ctx.draftOrders?.entry ?? [])
    .map((e) => e?.resource)
    .filter((r): r is DraftOrderResource => Boolean(r));
  const refs = ctx.selections ?? [];
  const selected =
    refs.length > 0
      ? resources.filter(
          (r) => r.id && refs.some((ref) => ref === r.id || ref.endsWith(`/${r.id}`))
        )
      : resources;

  // Per-order id seam folds the order identity/index into each card uuid, so two
  // selected orders with the SAME CPT don't collide (CDS Hooks correlates by uuid).
  const cards: CrdCoverageCard[] = [];
  selected.forEach((resource, i) => {
    const input = crdInputFromOrder(resource);
    if (!input) return;
    const key = resource.id ?? String(i);
    cards.push(
      ...buildCrdCards(input, { idFor: (role, cptKey) => `crd-${role}-${key}-${cptKey}` })
    );
  });

  // No structured order resolved → fail closed (never a silent empty list).
  if (cards.length === 0) {
    return NextResponse.json({ cards: crdIndeterminateCards() });
  }
  return NextResponse.json({ cards });
}
