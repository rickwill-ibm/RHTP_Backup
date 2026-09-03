/**
 * Connect360 two-state seed — transform conformance + drift guard.
 *
 * Verifies the Connect360 projection (fhir/seed/patients/connect360/*.bundle.json)
 * against the pure transform (tools/seed/lib/connect360Transform.mjs) and the
 * committed traditional bundles. Covers the coalition + red-team assertion set:
 *  - deterministic UUIDv4-shaped ids derived from the slug (not random, stable);
 *  - PUT-as-create shape (method / request.url / fullUrl);
 *  - no human-readable slug survives in any id / fullUrl / reference;
 *  - referential integrity (every traditionally-resolved ref resolves, same type);
 *  - diff-scope (only id/fullUrl/request/reference tokens differ from traditional);
 *  - anti-Option-A stability (ids do not ride on the random fullUrl bytes);
 *  - regen-and-diff DRIFT GUARD (committed output === re-transformed traditional).
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  transformBundle,
  uuidForKey,
  UUID_V4_RE,
} from '../../tools/seed/lib/connect360Transform.mjs';

const SRC = 'fhir/seed/patients';
const OUT = 'fhir/seed/patients/connect360';

type Ref = string;
interface Resource {
  resourceType: string;
  id: string;
  [k: string]: unknown;
}
interface Entry {
  fullUrl?: string;
  resource: Resource;
  request: { method: string; url: string };
}
interface Bundle {
  resourceType: string;
  type: string;
  entry: Entry[];
  [k: string]: unknown;
}
interface ManifestRow {
  pid: string;
  slug: string;
  file: string;
  entries: number;
}

const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;
const manifest = readJson<ManifestRow[]>(`${SRC}/manifest.json`);

/** Typed wrapper over the JS transform (the .mjs module is untyped → returns object). */
const tx = (b: Bundle): Bundle => transformBundle(b) as Bundle;

/** A human-readable slug id shape, e.g. "dorothy-simmons-condition-1" / "dorothy-simmons". */
const SLUG_RE = /^[a-z]+-[a-z0-9]+(-[a-z0-9]+)*$/;
const isSlug = (s: string) => SLUG_RE.test(s) && !UUID_V4_RE.test(s);

/** Collect every string value stored under a `reference` key, in document order. */
function collectRefs(node: unknown, out: Ref[] = []): Ref[] {
  if (Array.isArray(node)) node.forEach((n) => collectRefs(n, out));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === 'reference' && typeof v === 'string') out.push(v);
      else collectRefs(v, out);
    }
  }
  return out;
}

/** Structural normaliser: blank out id + reference tokens so only clinical content remains. */
function normalizeClinical(bundle: Bundle): unknown {
  const w = (n: unknown): unknown => {
    if (Array.isArray(n)) return n.map(w);
    if (n && typeof n === 'object') {
      const o: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(n)) {
        if (k === 'id' && typeof v === 'string') o[k] = '<ID>';
        else if (k === 'reference' && typeof v === 'string') o[k] = '<REF>';
        else o[k] = w(v);
      }
      return o;
    }
    return n;
  };
  return {
    ...bundle,
    entry: bundle.entry.map((e) => ({ resource: w(e.resource) })),
  };
}

describe('Connect360 transform — uuidForKey', () => {
  it('produces a lowercase UUIDv4-shaped id', () => {
    const u = uuidForKey('dorothy-simmons-condition-1');
    expect(u).toMatch(UUID_V4_RE);
    expect(u).toBe(u.toLowerCase());
  });

  it('is deterministic (same key → same id) and key-sensitive', () => {
    expect(uuidForKey('alex-kirby')).toBe(uuidForKey('alex-kirby'));
    expect(uuidForKey('alex-kirby')).not.toBe(uuidForKey('alex-kirby-condition-1'));
  });

  it('rejects empty / non-string keys (degenerate inputs)', () => {
    // @ts-expect-error intentional
    expect(() => uuidForKey(undefined)).toThrow();
    expect(() => uuidForKey('')).toThrow();
  });
});

describe('Connect360 transform — purity & determinism', () => {
  it('does not mutate the input bundle', () => {
    const trad = readJson<Bundle>(manifest[0].file);
    const before = JSON.stringify(trad);
    transformBundle(trad);
    expect(JSON.stringify(trad)).toBe(before);
  });

  it('is deterministic across repeated calls', () => {
    const trad = readJson<Bundle>(manifest[0].file);
    expect(JSON.stringify(transformBundle(trad))).toBe(JSON.stringify(transformBundle(trad)));
  });

  it('rejects a non-Bundle input', () => {
    expect(() => transformBundle({ resourceType: 'Patient' } as unknown as Bundle)).toThrow();
  });
});

describe.each(manifest)('Connect360 conformance — $slug', (row) => {
  const trad = readJson<Bundle>(row.file);
  const c360 = readJson<Bundle>(`${OUT}/${row.slug}.bundle.json`);

  it('is a transaction Bundle with the same entry count', () => {
    expect(c360.resourceType).toBe('Bundle');
    expect(c360.type).toBe('transaction');
    expect(c360.entry.length).toBe(trad.entry.length);
  });

  it('every resource.id is a lowercase UUIDv4 and unique', () => {
    const ids = new Set<string>();
    for (const e of c360.entry) {
      expect(e.resource.id, e.resource.resourceType).toMatch(UUID_V4_RE);
      expect(e.resource.id).toBe(e.resource.id.toLowerCase());
      expect(ids.has(e.resource.id)).toBe(false);
      ids.add(e.resource.id);
    }
    // bijection with the traditional slug set — no collisions, none dropped/merged
    expect(ids.size).toBe(new Set(trad.entry.map((e) => e.resource.id)).size);
  });

  it('every entry is PUT with matching request.url and fullUrl', () => {
    for (const e of c360.entry) {
      expect(e.request.method).toBe('PUT');
      expect(e.request.url).toBe(`${e.resource.resourceType}/${e.resource.id}`);
      expect(e.fullUrl).toBe(`urn:uuid:${e.resource.id}`);
    }
    expect(new Set(c360.entry.map((e) => e.fullUrl)).size).toBe(c360.entry.length);
  });

  // Scope: resource.id, fullUrl, and FHIR references (Reference.reference). A
  // reference-shaped provenance valueString (ra-sourceDocument) is out of scope by
  // design and proven unchanged by the diff-scope test above.
  it('no human-readable slug survives in any id, fullUrl, or FHIR reference', () => {
    for (const e of c360.entry) {
      expect(isSlug(e.resource.id)).toBe(false);
      expect(e.fullUrl!.startsWith('urn:uuid:')).toBe(true);
      expect(isSlug(e.fullUrl!.slice('urn:uuid:'.length))).toBe(false);
    }
    for (const ref of collectRefs(c360)) {
      const token = ref.startsWith('urn:uuid:')
        ? ref.slice('urn:uuid:'.length)
        : ref.split('/').pop()!;
      expect(isSlug(token), ref).toBe(false);
      if (ref.startsWith('urn:uuid:')) expect(token).toMatch(UUID_V4_RE);
    }
  });

  it('preserves reference count and referential integrity (every resolved ref still resolves, same type)', () => {
    const tRefs = collectRefs(trad);
    const cRefs = collectRefs(c360);
    expect(cRefs.length).toBe(tRefs.length); // no ref silently dropped

    const tByFull = new Map(
      trad.entry.filter((e) => e.fullUrl).map((e) => [e.fullUrl!, e.resource])
    );
    const tByLogical = new Map(
      trad.entry.map((e) => [`${e.resource.resourceType}/${e.resource.id}`, e.resource])
    );
    const cById = new Map(c360.entry.map((e) => [e.resource.id, e.resource]));

    let resolvedCount = 0;
    for (let i = 0; i < tRefs.length; i++) {
      const traditionallyResolved = tByFull.get(tRefs[i]) ?? tByLogical.get(tRefs[i]);
      if (!traditionallyResolved) continue; // external/unresolved in traditional too — skip
      const cr = cRefs[i];
      const token = cr.startsWith('urn:uuid:')
        ? cr.slice('urn:uuid:'.length)
        : cr.split('/').pop()!;
      const target = cById.get(token);
      expect(target, `dangling connect360 ref ${cr} (was ${tRefs[i]})`).toBeDefined();
      if (!cr.startsWith('urn:uuid:')) expect(cr.split('/')[0]).toBe(target!.resourceType);
      expect(target!.resourceType).toBe(traditionallyResolved.resourceType);
      resolvedCount++;
    }
    expect(resolvedCount).toBeGreaterThan(0); // guard against a vacuous pass
  });

  it('diff-scope: only id/fullUrl/request/reference differ from the traditional bundle', () => {
    expect(normalizeClinical(c360)).toEqual(normalizeClinical(trad));
  });
});

describe('Connect360 — anti-Option-A stability (ids derive from the slug, not the fullUrl)', () => {
  it('re-minting every fullUrl leaves the connect360 ids unchanged', () => {
    const trad = readJson<Bundle>(manifest[0].file);
    const baseline = tx(trad).entry.map((e) => e.resource.id);

    const mutated = JSON.parse(JSON.stringify(trad)) as Bundle;
    mutated.entry.forEach((e, i) => {
      if (e.fullUrl?.startsWith('urn:uuid:')) e.fullUrl = `urn:uuid:${uuidForKey(`rekey-${i}`)}`;
    });
    const after = tx(mutated).entry.map((e) => e.resource.id);
    expect(after).toEqual(baseline);
  });
});

describe('Connect360 — evidence-join mapping (KG SUPPORTED_BY survives the projection)', () => {
  it('every traditional coding-gap evidence ref maps to Type/<uuid> under the slug→uuid table', () => {
    let evidenceRefs = 0;
    for (const row of manifest) {
      const trad = readJson<Bundle>(row.file);
      const c360 = readJson<Bundle>(`${OUT}/${row.slug}.bundle.json`);
      for (let i = 0; i < trad.entry.length; i++) {
        const tr = trad.entry[i].resource;
        if (tr.resourceType !== 'MeasureReport') continue;
        const cr = c360.entry[i].resource;
        const tEvid = (tr.evaluatedResource as { reference: string }[] | undefined) ?? [];
        const cEvid = (cr.evaluatedResource as { reference: string }[] | undefined) ?? [];
        expect(cEvid.length).toBe(tEvid.length);
        for (let j = 0; j < tEvid.length; j++) {
          const [type, slug] = tEvid[j].reference.split('/');
          // logical evidence refs must stay logical (Type/<uuid>) — never urn:uuid
          expect(cEvid[j].reference).toBe(`${type}/${uuidForKey(slug)}`);
          evidenceRefs++;
        }
      }
    }
    expect(evidenceRefs).toBeGreaterThan(0);
  });
});

describe('Connect360 — DRIFT GUARD (committed output tracks the traditional source)', () => {
  it.each(manifest)(
    '$slug committed bundle equals the freshly re-transformed traditional bundle',
    (row) => {
      const trad = readJson<Bundle>(row.file);
      const committed = readJson<Bundle>(`${OUT}/${row.slug}.bundle.json`);
      expect(transformBundle(trad)).toEqual(committed);
    }
  );

  it('the connect360 manifest lists exactly the committed bundles', () => {
    const c360Manifest = readJson<{ slug: string; idScheme: string; requestMethod: string }[]>(
      `${OUT}/manifest.json`
    );
    expect(c360Manifest.map((m) => m.slug).sort()).toEqual(manifest.map((m) => m.slug).sort());
    for (const m of c360Manifest) {
      expect(m.idScheme).toBe('uuidv4');
      expect(m.requestMethod).toBe('PUT');
    }
  });
});
