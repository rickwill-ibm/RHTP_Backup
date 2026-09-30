// SEAM: agent-definition — the BUNDLED (no-filesystem) DefinitionSource
/**
 * A `DefinitionSource` over STATICALLY IMPORTED JSON.
 *
 * WHY NOT `node:fs`. The other `DefinitionSource` in this repo is built in the
 * build-time tooling and in tests, where a filesystem is a given. A BFF route is
 * not that: a `node:fs` reader inside `src/app` puts a Node builtin on a graph
 * the bundler must resolve for every runtime it compiles (E16), and a relative
 * data path resolved at request time is a path that works in `next dev` and is
 * absent from the standalone output. A static `import … from './x.json'` has no
 * bundler boundary at all — the data is a module, resolved at build time, with
 * no runtime, no cwd and no filesystem in the picture.
 *
 * WHAT THIS SOURCE IS NOT: byte-faithful. `readTextFile` re-serialises a PARSED
 * object through the canonicaliser, so the text it returns is the canonical form
 * of the committed content, not the committed bytes. That is lossless for every
 * consumer here — `loadDefinitions`, `loadAuthorityLock` and
 * `loadArtifactVersions` all parse the text immediately, and parsing is
 * insensitive to key order and whitespace. It is NOT sufficient for a byte-level
 * drift proof: comparing against this source can only establish SEMANTIC
 * equivalence. Byte equality between the committed generated artifacts and the
 * compiled bytes stays the job of `npm run adl:check` (the `.mjs` mirror), which
 * reads the real files. Callers must label which of the two they performed.
 *
 * INVARIANT: an unknown path is a REFUSAL (`ADL_SHAPE`), never an empty string —
 *            a source that returns '' for a typo would make `loadDefinitions`
 *            fail with a JSON parse error at a path nobody typed.
 */
import { serializeStable } from '../canonical';
import { AdlError } from '../errors';
import type { DefinitionSource } from './loadDefinitions';

import bhScreeningTriageAgent from '../data/bh-screening-triage-agent.agent.json';
import outreachAgent from '../data/outreach-agent.agent.json';
import paDocumentationAgent from '../data/pa-documentation-agent.agent.json';
import referralCoordinationAgent from '../data/referral-coordination-agent.agent.json';
import revenueCycleAgent from '../data/revenue-cycle-agent.agent.json';
import artifactVersions from '../data/artifact-versions.json';
import authorityLock from '@/lib/agents/authority/data/authority-lock.json';
import committedManifest from '@/lib/agents/manifest/data/agent-manifests.json';
import committedRouting from '@/lib/agents/dispatch/data/agent-routing.json';

/** The logical path of the authority lock within this source. */
export const BUNDLED_AUTHORITY_LOCK_PATH = 'authority/data/authority-lock.json';
/** The logical path of the authored artifact versions within this source. */
export const BUNDLED_ARTIFACT_VERSIONS_PATH = 'adl/data/artifact-versions.json';

/**
 * Every bundled document, keyed by its logical path. Definition files are the
 * `*.agent.json` entries; `loadDefinitions` sorts these keys, so the compiled
 * output is independent of the order they are declared in here.
 */
const BUNDLE: Readonly<Record<string, unknown>> = Object.freeze({
  'adl/data/bh-screening-triage-agent.agent.json': bhScreeningTriageAgent,
  'adl/data/outreach-agent.agent.json': outreachAgent,
  'adl/data/pa-documentation-agent.agent.json': paDocumentationAgent,
  'adl/data/referral-coordination-agent.agent.json': referralCoordinationAgent,
  'adl/data/revenue-cycle-agent.agent.json': revenueCycleAgent,
  [BUNDLED_ARTIFACT_VERSIONS_PATH]: artifactVersions,
  [BUNDLED_AUTHORITY_LOCK_PATH]: authorityLock,
});

/**
 * The committed generated artifacts, as PARSED objects.
 *
 * Exposed separately from `BUNDLE` because they are not inputs to compilation:
 * they are the things compilation is checked AGAINST. Keeping them out of the
 * definition bundle is what stops `listDefinitionFiles()` from ever offering a
 * generated artifact to the parser.
 */
export const BUNDLED_COMMITTED_ARTIFACTS: Readonly<{ manifest: unknown; routing: unknown }> =
  Object.freeze({ manifest: committedManifest, routing: committedRouting });

/** The bundled `DefinitionSource`. No filesystem, no cwd, no runtime branch. */
export const bundledSource: DefinitionSource = {
  listDefinitionFiles: () => Object.keys(BUNDLE).filter((p) => p.endsWith('.agent.json')),
  readTextFile: (path: string): string => {
    if (!Object.prototype.hasOwnProperty.call(BUNDLE, path)) {
      throw new AdlError(
        'ADL_SHAPE',
        path,
        'not a bundled document — this source serves only the statically imported ' +
          'agent definitions, the authority lock and the artifact versions'
      );
    }
    return serializeStable(BUNDLE[path]);
  },
};
