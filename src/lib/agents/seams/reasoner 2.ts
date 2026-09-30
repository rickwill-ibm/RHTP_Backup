// CONTRACT: C-SEAM  // SEAM: reasoner
/**
 * The reasoning seam.
 *
 * Model reasoning runs strictly INSIDE one workflow step, as a recorded,
 * replayable activity. It may only emit a typed proposal draft; it never calls a
 * tool. It returns a tool REQUEST which the workflow passes through
 * `ctx.useTool` -> `assertToolAllowed`.
 *
 * INVARIANT: reasoning is an EFFECT, not control flow. Its output is recorded
 *            once and replayed thereafter, so determinism is preserved.
 * INVARIANT: the mock reasoner is a recorded transcript — deterministic, no clock,
 *            no network — so mock runs are reproducible in CI.
 * INVARIANT: the production reasoner throws until configured. It never silently
 *            degrades to the mock.
 * INVARIANT: every output carries the prompt id and version so provenance can
 *            name what produced it.
 */
import { SeamError } from './errors';

/** What a reasoning step is asked to do. PHI-safe: references and codes only. */
export interface ReasoningRequest {
  /** The reasoning template this step uses (content-hashed into the activity input). */
  promptId: string;
  promptVersion: string;
  /**
   * THE EXACT TEXT to send to the provider. It is carried rather than resolved
   * by the provider from the id, so that the text verified against the reviewed
   * pin and the text that produced the output are the same string. A provider
   * that looks the prompt up by id instead would make the recorded digest a
   * claim about a different artifact.
   */
  promptText: string;
  /** `sha256:<hex>` of promptText, for a provider that wants to re-verify. */
  templateHash: string;
  /** PHI-safe inputs — resource references and codes, never free-text member data. */
  refs: Readonly<Record<string, string>>;
  /** Read-only tools the step is permitted to request. Subset of the allowlist. */
  readableTools: readonly string[];
}

/** What a reasoning step may return. It proposes; it never acts. */
export interface ReasoningOutput {
  /** Codes only — the reasoner cannot author free text that reaches a member. */
  suggestedRefs: Readonly<Record<string, string>>;
  /** Tools the reasoner would like called, for the WORKFLOW to gate and invoke. */
  toolRequests: readonly string[];
  /** Model/template identity, stamped into decision provenance. */
  producedBy: { promptId: string; promptVersion: string; modelId: string };
}

/** The seam. A recorded fake in mock; a configured provider in production. */
export interface Reasoner {
  reason(request: ReasoningRequest): Promise<ReasoningOutput>;
}

/** A recorded transcript keyed by prompt id — deterministic, replayable. */
export type ReasoningTranscript = Readonly<Record<string, ReasoningOutput>>;

/** Mock reasoner: returns the recorded output, or fails closed if none exists. */
export function createRecordedReasoner(transcript: ReasoningTranscript): Reasoner {
  return {
    reason(request: ReasoningRequest): Promise<ReasoningOutput> {
      const recorded = transcript[request.promptId];
      if (!recorded) {
        return Promise.reject(
          new SeamError(
            'SEAM_NOT_CONFIGURED',
            request.promptId,
            'no recorded reasoning transcript for this prompt id — mock runs must be deterministic'
          )
        );
      }
      return Promise.resolve(recorded);
    },
  };
}

/** Production reasoner: refuses until a provider is configured at deployment. */
export function createUnconfiguredReasoner(): Reasoner {
  return {
    reason(request: ReasoningRequest): Promise<ReasoningOutput> {
      return Promise.reject(
        new SeamError(
          'SEAM_NOT_CONFIGURED',
          request.promptId,
          'no reasoning provider is configured — configure one at deployment; ' +
            'the seam will not fall back to the mock'
        )
      );
    },
  };
}
