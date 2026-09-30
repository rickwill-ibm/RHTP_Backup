/**
 * seamDispositions.agents.ts — the disposition entries for the three WPCO agent seams.
 *
 * WHY A SEPARATE FILE. `seamDispositions.ts` is 393 formatted lines against a
 * 400-line cap (AI-CODING-CONVENTIONS §2). Three entries inline would breach it
 * and `check:sizes` would fail, so the entries live here and the manifest spreads
 * them in — the sanctioned "split by responsibility" move, not a helpers dumping
 * ground: this file owns exactly the agent-tranche dispositions.
 *
 * WHY THE EXACT-KEY RECORD TYPE. `SEAM_DISPOSITIONS` is annotated
 * `Readonly<Record<DataModeSeam, SeamDispositionEntry>>`, and TypeScript only
 * proves that annotation complete if the spread's type names its keys. Typing
 * this as `Record<AgentSeamId, …>` with `AgentSeamId` EXTRACTED from
 * `DataModeSeam` keeps two proofs alive at once: a seam id misspelled here
 * collapses to `never` and the outer Record goes incomplete, and a seam removed
 * from `DATA_MODE_SEAMS` stops type-checking here rather than rotting.
 *
 * The runtime gate over these three entries is
 * tests/governance/probers.agentSeams.ts, registered into the PROBERS table in
 * tests/governance/seamFailClosed.test.ts.
 */
import type { DataModeSeam } from './dataMode';
import type { SeamDispositionEntry } from './seamDispositions';

/** The agent-tranche seam ids, extracted from the registry so a typo cannot pass. */
type AgentSeamId = Extract<
  DataModeSeam,
  'agentReasoner' | 'agentMemoryRecall' | 'agentToolBinding'
>;

/**
 * An agent-tranche entry, plus the E15 parity proof.
 *
 * WHY THE FIELD IS DECLARED HERE AND NOT ON `SeamDispositionEntry`.
 * `SeamDispositionEntry` has no parity-test field, so until this wave the three
 * seams' parity claims lived in PROSE: deleting the three `E15 parity:` blocks in
 * tests/agents/seams/resolveSeams.test.ts turned nothing red. Widening the shared
 * interface is the right home for the field and that file is not this tranche's to
 * change, so the reference is declared as an INTERSECTION here — the data is
 * carried on the real entries today (`SEAM_DISPOSITIONS` serves the same objects),
 * and the shared `parityTest?: string` can be added later with no change to this
 * file. The resolution gate over it lives in resolveSeams.test.ts: it parses each
 * reference and fails unless that file contains exactly one `it()` of that title.
 *
 * FORMAT, fixed so the gate can resolve it: `<repo-relative test file> → "<exact
 * it() title>"`.
 */
type AgentSeamDispositionEntry = SeamDispositionEntry & { parityTest: string };

const PARITY_SUITE = 'tests/agents/seams/resolveSeams.test.ts';

/**
 * All three are `fail-closed-stub`: the authority exists (manifests, grants,
 * prompt pins) and the PLUMBING does not. Every one of them refuses in
 * production with a `SeamError` carrying `SEAM_NOT_CONFIGURED`.
 */
export const AGENT_SEAM_DISPOSITIONS: Readonly<Record<AgentSeamId, AgentSeamDispositionEntry>> =
  Object.freeze({
    agentReasoner: {
      seamId: 'agentReasoner',
      disposition: 'fail-closed-stub',
      productionResolverRef: 'lib/agents/seams/resolve.ts → getAgentReasoner()',
      notConfiguredError: 'SeamError (code SEAM_NOT_CONFIGURED)',
      parityTest: `${PARITY_SUITE} → "E15 parity: mock and production getAgentReasoner expose the same interface"`,
      note:
        'The model-reasoning provider. production returns createUnconfiguredReasoner(), ' +
        'whose reason() rejects unconditionally — no provider is configured in this ' +
        'deployment and the seam does not substitute the recorded transcript for one. ' +
        'mock/seeded → createRecordedReasoner() over the committed deterministic ' +
        'transcript (reasoning-transcript.mock.json), so CI runs are replayable. The ' +
        'resolver is exercised on a real request by POST /api/ops/agents/reasoning.',
    },
    agentMemoryRecall: {
      seamId: 'agentMemoryRecall',
      disposition: 'fail-closed-stub',
      productionResolverRef: 'lib/agents/seams/resolve.ts → getAgentMemoryRecall()',
      notConfiguredError: 'SeamError (code SEAM_NOT_CONFIGURED)',
      parityTest: `${PARITY_SUITE} → "E15 parity: mock and production getAgentMemoryRecall expose the same interface"`,
      note:
        'Cross-run recall. THERE IS DELIBERATELY NO WPCO PRODUCTION CONSUMER, and one ' +
        'was not invented to make the seam look wired: recall reads through the consent ' +
        'lens, so a caller added for the sake of a gate would be an unreviewed ' +
        'disclosure path. Registering the seam and proving the refusal is what makes ' +
        'that absence DECLARED rather than latent — production returns ' +
        'createUnconfiguredRecall() (recall() rejects), so if a consumer is ever added ' +
        'it inherits a fail-closed seam instead of discovering one. mock/seeded → ' +
        'createSeededRecall() over a caller-supplied seed, with scope, breadth and the ' +
        '42 CFR Part 2 basis all enforced. ' +
        'HONEST LIMIT, stated rather than implied: registration proves the REFUSAL, and ' +
        'nothing detects a consumer being added. The declared absence is enforced by a ' +
        'STRING MATCH on this note (resolveSeams.test.ts), which is a reminder to a ' +
        'future author, not a gate on the code — a consumer wired tomorrow would inherit ' +
        'the fail-closed seam (the part that is true and load-bearing) and would turn ' +
        'nothing red (the part that is not). Two ways to close it, RECOMMENDED FIRST: ' +
        '(a) a governance assertion that agentMemoryRecall is consumed from exactly one ' +
        'file — the resolver — so a second importer fails the gate; or (b) a fourth ' +
        "disposition 'declared-absent' whose gate is that no production consumer exists. " +
        '(a) is preferred: it gates the CODE, it needs no new disposition for every ' +
        'reader of the manifest to learn, and (b) would still need (a) to enforce it.',
    },
    agentToolBinding: {
      seamId: 'agentToolBinding',
      disposition: 'fail-closed-stub',
      productionResolverRef:
        'lib/agents/seams/resolve.ts → getAgentToolBindingTable() (resolved via resolveBinding)',
      notConfiguredError: 'SeamError (code SEAM_NOT_CONFIGURED)',
      parityTest: `${PARITY_SUITE} → "E15 parity: both getAgentToolBindingTable modes return the same agent-narrowed table"`,
      note:
        'Deployment-time tool binding. tool-bindings.production.json ships ZERO bindings ' +
        'BY DESIGN, so resolveBinding() for any granted tool throws SEAM_NOT_CONFIGURED ' +
        'rather than falling back to the in-process mock handler. This is the intended ' +
        'production posture: authority is decided at build time in a reviewed manifest, ' +
        'plumbing is decided at deployment time and does not exist yet, and the gap is a ' +
        'loud refusal. mock/seeded → tool-bindings.mock.json (in-process handlers). ' +
        'Both modes return the same AgentBoundTable shape (E15 parity).',
    },
  } as const);
