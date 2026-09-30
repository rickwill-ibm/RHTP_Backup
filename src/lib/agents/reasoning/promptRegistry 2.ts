// CONTRACT: C-REASON
/**
 * Prompt templates, content-hashed.
 *
 * WHY A VERSION IS NOT ENOUGH. `promptVersion` is a CLAIM about a template, not
 * a fact about it. Edit the template text and forget to bump the version — a
 * one-word change to an instruction — and every replay of an earlier run silently
 * re-reasons under different words while still labelling itself `v1`. The
 * evidence record then says a determination was produced by a prompt that no
 * longer exists, and nobody can tell, because the identifier did not move.
 *
 * So the template's CONTENT is hashed, the hash is pinned in reviewed
 * configuration, and the registry refuses to resolve a template whose text no
 * longer matches its pin. An edit without a version bump becomes a loud refusal
 * at the point of use rather than a quiet divergence in the record.
 *
 * INVARIANT: a resolved binding always carries the digest of the exact text used.
 * INVARIANT: text that does not match its reviewed pin is refused, never used.
 * INVARIANT: the digest function is injected — this module has no node built-ins,
 *            no clock and no IO, so it stays pure and testable.
 */

/** A digest function. MUST return `sha256:<64 lowercase hex>`. */
export type Digest = (text: string) => string;

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

/** A reasoning template as authored. */
export interface PromptTemplate {
  id: string;
  version: string;
  /** The exact text handed to the provider. Never assembled at runtime. */
  text: string;
  /**
   * The reviewed digest of `text`. Pinned in configuration so that changing the
   * text is a diff someone approves, not something a deployment can do quietly.
   */
  pinnedHash: string;
}

/**
 * What a step runs under: identity, the digest, AND THE TEXT ITSELF.
 *
 * The text is carried deliberately. A binding of identity + digest alone is
 * worse than no integrity check at all: the provider would resolve the id to
 * text from some other source, the registry would have verified a string the
 * model was never shown, and the digest written into the evidence record would
 * hash a different artifact than the one that produced the determination. The
 * record would then make a specific, checkable, FALSE claim about which words
 * decided a member's benefit. Carrying the text is what makes the digest a
 * statement about the reasoning that actually happened.
 */
export interface PromptBinding {
  promptId: string;
  promptVersion: string;
  /** `sha256:<hex>` of `text`. Goes into the activity input and into provenance. */
  templateHash: string;
  /** The exact text to send to the provider. Verified against templateHash. */
  text: string;
}

/** Raised when a template is missing, ambiguous, or no longer matches its pin. */
export class PromptIntegrityError extends Error {
  constructor(
    public readonly reason:
      | 'unknown-template'
      | 'duplicate-template'
      | 'pin-shape'
      | 'digest-shape'
      | 'content-drift'
      | 'binding-tampered',
    detail: string
  ) {
    super(`[${reason}] ${detail}`);
    this.name = 'PromptIntegrityError';
  }
}

const key = (id: string, version: string): string => `${id}@${version}`;

/** The registry: resolve an (id, version) to a verified binding, or refuse. */
export interface PromptRegistry {
  resolve(promptId: string, promptVersion: string): PromptBinding;
  /** Every binding, for a boot-time integrity sweep. */
  all(): readonly PromptBinding[];
}

function verify(t: PromptTemplate, digest: Digest): PromptBinding {
  if (!DIGEST_PATTERN.test(t.pinnedHash)) {
    throw new PromptIntegrityError(
      'pin-shape',
      `${key(t.id, t.version)} pinnedHash is not sha256:<64 hex> — an unparseable pin ` +
        'would otherwise compare equal to nothing and be silently skipped'
    );
  }
  const actual = digest(t.text);
  if (!DIGEST_PATTERN.test(actual)) {
    // Rejects an identity or stub hasher passed in by mistake, which would make
    // every comparison below meaningless.
    throw new PromptIntegrityError(
      'digest-shape',
      `the injected digest returned "${actual}", not sha256:<64 hex>`
    );
  }
  if (actual !== t.pinnedHash) {
    throw new PromptIntegrityError(
      'content-drift',
      `${key(t.id, t.version)} text no longer matches its reviewed pin — ` +
        'bump the version and re-pin, or restore the text; a template may not ' +
        'change under a version that has already produced decisions'
    );
  }
  return { promptId: t.id, promptVersion: t.version, templateHash: actual, text: t.text };
}

/**
 * Build a registry. Every template is verified EAGERLY, so a drifted prompt
 * fails at construction — at boot — rather than on the first member it touches.
 */
export function createPromptRegistry(
  templates: readonly PromptTemplate[],
  digest: Digest
): PromptRegistry {
  const byKey = new Map<string, PromptBinding>();
  for (const t of templates) {
    const k = key(t.id, t.version);
    if (byKey.has(k)) {
      throw new PromptIntegrityError(
        'duplicate-template',
        `${k} declared more than once — a second entry would shadow the first`
      );
    }
    byKey.set(k, verify(t, digest));
  }
  return {
    resolve(promptId, promptVersion) {
      const binding = byKey.get(key(promptId, promptVersion));
      if (!binding) {
        throw new PromptIntegrityError(
          'unknown-template',
          `${key(promptId, promptVersion)} is not a registered template`
        );
      }
      return binding;
    },
    all: () => [...byKey.values()],
  };
}

/** The provenance source id for a fact produced under a binding. */
export function provenanceSourceId(b: PromptBinding): string {
  // The digest is included, short-form, so a fact in the record names the exact
  // text that produced it — not merely the version that claimed to.
  return `${b.promptId}@${b.promptVersion}#${b.templateHash.slice(7, 19)}`;
}

/**
 * Re-verify a binding at the point of dispatch.
 *
 * The registry verified the text at construction. This checks it again on the
 * object about to be sent, because a binding is a plain value that travels
 * through workflow state and can be reconstructed, deserialised or edited on
 * the way. Verifying at construction and trusting thereafter is checking a copy
 * rather than the thing used — the class of defect this module exists to close.
 */
export function assertBindingIntact(binding: PromptBinding, digest: Digest): void {
  const actual = digest(binding.text);
  if (!DIGEST_PATTERN.test(actual)) {
    throw new PromptIntegrityError(
      'digest-shape',
      `the injected digest returned "${actual}", not sha256:<64 hex>`
    );
  }
  if (actual !== binding.templateHash) {
    throw new PromptIntegrityError(
      'binding-tampered',
      `${key(binding.promptId, binding.promptVersion)} text does not hash to the ` +
        'digest it carries — the binding was altered after the registry verified it'
    );
  }
}
