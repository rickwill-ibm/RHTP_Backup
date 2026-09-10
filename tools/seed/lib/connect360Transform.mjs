/**
 * Connect360 FHIR wire-format transform (two-state seed — Connect360 projection).
 *
 * Connect360's FHIR server accepts ONLY UUIDv4 resource ids and rejects any
 * human-readable id; it ingests via PUT (update-as-create / idempotent upsert-by-id)
 * rather than POST. This module is a PURE, DETERMINISTIC projection of our
 * "traditional" transaction bundles (resource.id = human-readable slug, POST) into
 * the Connect360 shape (resource.id = UUIDv4, PUT). It is the single source of the
 * Connect360 bundles: the committed `fhir/seed/patients/connect360/*.bundle.json`
 * are produced by this transform and re-verified against it by a regen-and-diff
 * drift guard (tests/seed/connect360Drift...). The traditional bundles are never
 * modified — the two states coexist.
 *
 * DESIGN (coalition-ratified — architect + FHIR + EMPI/KG + red-team):
 *  - ID SCHEME (deterministic, not random): resource.id = uuidForKey(slug). The id
 *    is a UUIDv4-SHAPED value derived from the stable business key (the slug), so a
 *    PUT-upsert stays idempotent across regeneration and the drift guard is
 *    deterministic. randomUUID() is deliberately NOT used anywhere on this path.
 *  - REFERENCE POLICY = PRESERVE-FORM, REMAP-ID: each reference keeps its original
 *    shape (a `urn:uuid:` reference stays `urn:uuid:`; a logical `Type/slug`
 *    reference stays `Type/<uuid>`) and only the identifier token is remapped. This
 *    is trivially ingest-equivalent to the traditional bundle (identical reference
 *    shapes) AND maximally server-portable: relational refs resolve via the
 *    universal `fullUrl` mechanism, while evidence/logical refs resolve via the PUT
 *    `request.url` literal id — the same logical `Type/<resource.id>` form our own
 *    knowledge-graph evidence join requires.
 *  - SCOPE: only string values under a `reference` key that resolve to an in-bundle
 *    resource are rewritten. Canonicals, extension `url`s, `identifier.system`s,
 *    contained `#refs`, absolute URLs and any unresolved reference pass through
 *    untouched.
 *
 * INVARIANT: for every entry — resource.id is a lowercase UUIDv4-shaped value;
 * fullUrl === `urn:uuid:${id}`; request === { method:'PUT', url:`${resourceType}/${id}` };
 * every reference that resolved within the traditional bundle resolves within this
 * bundle to a resource of the same resourceType; no human-readable slug survives in
 * any resource.id, fullUrl, or FHIR reference (Reference.reference). See
 * tests/seed/connect360.test.ts.
 *
 * SCOPE NOTE (deliberate, tested): only string values under a `reference` key are
 * rewritten. A reference-SHAPED string carried in a differently-typed field — e.g.
 * the `ra-sourceDocument` provenance `valueString` "DocumentReference/<slug>-visitdoc-1",
 * whose target is NOT an in-bundle resource in either state — is preserved verbatim
 * (per preserve-form: unresolved references are never rewritten). It is a primitive
 * string annotation, not a resource id or a Reference the server dereferences, so it
 * does not affect UUIDv4-id acceptance. The diff-scope test proves such fields are
 * byte-identical to the traditional bundle.
 */

import { createHash } from 'node:crypto';

/** Fixed namespace so a slug always derives the same Connect360 uuid (idempotent PUT). */
export const CONNECT360_NAMESPACE = 'urn:rhtp:connect360:seed:v1';

/** RFC-4122 canonical UUID shape with version nibble 4 and variant 8|9|a|b. */
export const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Deterministic UUIDv4-SHAPED id from a stable key.
 *
 * SHA-1(namespace | key) → first 16 bytes → force version nibble = 4 and variant
 * bits = 10xx → lowercase hyphenated. The value is a genuine RFC-4122 layout that
 * passes a UUIDv4 *format* check (Connect360 validates shape, not entropy); it is a
 * pure function of `key`, which is what makes the projection reproducible.
 *
 * @param {string} key       Stable business key — the resource's traditional slug id.
 * @param {string} namespace Derivation namespace (defaults to CONNECT360_NAMESPACE).
 * @returns {string} lowercase UUIDv4-shaped id.
 */
export function uuidForKey(key, namespace = CONNECT360_NAMESPACE) {
  if (typeof key !== 'string' || key.length === 0) {
    throw new Error(`uuidForKey: key must be a non-empty string (got ${JSON.stringify(key)})`);
  }
  const digest = createHash('sha1').update(`${namespace}|${key}`).digest();
  const b = Buffer.from(digest.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10xx
  const hex = b.toString('hex'); // lowercase
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Project a traditional transaction Bundle into the Connect360 (UUIDv4 + PUT) shape.
 * Pure: no fs, no clock, no randomness. Does not mutate the input.
 *
 * @param {object} bundle A traditional FHIR transaction Bundle object.
 * @returns {object} A new Connect360 Bundle object.
 */
export function transformBundle(bundle) {
  if (!isPlainObject(bundle) || bundle.resourceType !== 'Bundle') {
    throw new Error('transformBundle: input is not a FHIR Bundle');
  }
  const entries = Array.isArray(bundle.entry) ? bundle.entry : [];

  // Pass 1 — assign each entry a new uuid keyed on its (stable, unique) slug id, and
  // build the two reference-resolution maps: by old fullUrl and by logical Type/id.
  const uuidByIndex = new Array(entries.length);
  const byFullUrl = new Map(); // "urn:uuid:<old>" (incl. synthetic) -> new uuid
  const byLogical = new Map(); // "ResourceType/<slug>"            -> new uuid
  const uuidSeen = new Map(); // new uuid -> slug (collision guard)

  entries.forEach((e, i) => {
    const r = e && e.resource;
    if (!isPlainObject(r) || typeof r.resourceType !== 'string') {
      throw new Error(`transformBundle: entry[${i}] has no resource/resourceType`);
    }
    if (typeof r.id !== 'string' || r.id.length === 0) {
      throw new Error(`transformBundle: entry[${i}] (${r.resourceType}) has no resource.id`);
    }
    const uuid = uuidForKey(r.id); // key on the slug — the stable business key
    if (uuidSeen.has(uuid) && uuidSeen.get(uuid) !== r.id) {
      throw new Error(
        `transformBundle: uuid collision ${uuid} for '${r.id}' and '${uuidSeen.get(uuid)}'`
      );
    }
    uuidSeen.set(uuid, r.id);
    uuidByIndex[i] = uuid;
    if (typeof e.fullUrl === 'string') byFullUrl.set(e.fullUrl, uuid);
    byLogical.set(`${r.resourceType}/${r.id}`, uuid);
  });

  // Remap a single reference string, PRESERVING its form. Returns the input
  // unchanged when it does not resolve to an in-bundle resource.
  const remapReference = (ref) => {
    if (typeof ref !== 'string') return ref;
    // Logical Type/id refs keep their logical form (preserve-form design) — checked
    // BEFORE byFullUrl so a relative-fullUrl bundle (fullUrl === "Type/slug") does not
    // force logical refs (e.g. coding-gap evidence) into urn:uuid form.
    if (byLogical.has(ref)) {
      const slashAt = ref.indexOf('/');
      const type = ref.slice(0, slashAt);
      return `${type}/${byLogical.get(ref)}`;
    }
    if (byFullUrl.has(ref)) return `urn:uuid:${byFullUrl.get(ref)}`;
    return ref; // external / contained / canonical / unresolved — untouched
  };

  // Deep clone, rewriting ONLY string values under a `reference` key.
  const rewrite = (node) => {
    if (Array.isArray(node)) return node.map(rewrite);
    if (isPlainObject(node)) {
      const out = {};
      for (const [k, v] of Object.entries(node)) {
        out[k] = k === 'reference' && typeof v === 'string' ? remapReference(v) : rewrite(v);
      }
      return out;
    }
    return node;
  };

  // Pass 2 — build the projected entries.
  const newEntry = entries.map((e, i) => {
    const uuid = uuidByIndex[i];
    const resource = rewrite(e.resource);
    resource.id = uuid;
    return {
      fullUrl: `urn:uuid:${uuid}`,
      resource,
      request: { method: 'PUT', url: `${e.resource.resourceType}/${uuid}` },
    };
  });

  return { ...bundle, entry: newEntry };
}
