/**
 * MTM Agent — manifest declaration.
 *
 * Declares the MTM agent's identity, autonomy tier, and tool allowlist
 * for the RHTP agent governance system.
 *
 * Autonomy tier: HITL_ADVISORY
 *   - Agent surfaces findings; physician must review and acknowledge.
 *   - Agent NEVER blocks a prescription autonomously (hardBlock only on
 *     severity === 'contraindicated', which still requires physician override).
 *   - All findings are decision-support, not decisions.
 *
 * Reference: docs/framework/personas.md §Autonomy Tiers
 */

export const MTM_AGENT_MANIFEST = {
  id: 'mtm-agent-v1',
  name: 'Medication Therapy Management Agent',
  version: '1.0.0',
  domain: 'pharmacy/mtm',
  autonomyTier: 'HITL_ADVISORY' as const,
  description:
    "Screens new medication orders against the patient's active med list " +
    'for drug–drug interactions (RxNav), duplicate therapy (CMS Part D MTM), ' +
    'refill-too-soon (CMS Part D MTM), and Beers Criteria PIMs (AGS 2023). ' +
    'Produces findings displayed to the prescriber before order submission.',
  phiHandling: 'server-side-only',
  featureFlag: 'MTM_AGENT_ENABLED',
  tools: [
    {
      id: 'rxnorm-drug-lookup',
      description: 'Brand→generic resolution and typeahead via NLM RxNorm REST API',
    },
    { id: 'fda-ndc-lookup', description: 'NDC code lookup via FDA openFDA Drug NDC API' },
    {
      id: 'rxnav-interaction',
      description: 'Drug–drug interaction check via RxNav Interaction API',
    },
  ],
  invariants: [
    'INVARIANT: agent never writes to FHIR — read-only on medication list',
    'INVARIANT: no API keys stored in NEXT_PUBLIC_* env vars',
    'INVARIANT: PHI is never logged or stored by BFF routes in this domain',
    'INVARIANT: hardBlock only on contraindicated severity — all others are advisory',
  ],
  dataFlowDiagram: `
    UI (AddMedicationForm)
      → POST /api/mtm/drug-lookup      → RxNorm REST API (NLM, free)
      → POST /api/mtm/ndc              → FDA openFDA API (free)
      → POST /api/mtm/interactions     → RxNav Interaction API (NLM, free)
      → evaluate() [mtmEngine, client] → MtmFinding[]
      → MtmSafetyPanel (UI, physician reviews + acknowledges)
      → FHIR MedicationRequest.create()
  `,
} as const;
