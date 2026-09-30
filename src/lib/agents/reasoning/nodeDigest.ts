// SERVER-ONLY — pulls node:crypto. Keep off the client import graph.
/**
 * The default digest for prompt and result hashing.
 *
 * It lives in its own module so the reasoning core stays free of node built-ins:
 * the core takes a `Digest` as an injected dependency and can therefore be
 * tested, and run, without a runtime that has `node:crypto`.
 */
import { createHash } from 'node:crypto';
import type { Digest } from './promptRegistry';

/** sha256 over UTF-8 bytes, in the `sha256:<64 hex>` form the registry requires. */
export const nodeDigest: Digest = (text) =>
  `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
