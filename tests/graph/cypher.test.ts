import { describe, it, expect } from 'vitest';
import { renderMutation, assertIdentifier, type Mutation } from '@/lib/graph';

/**
 * Cypher rendering unit tests (no live Neo4j; the Docker-guarded bolt spec runs
 * these statements against a real server). Asserts: values are bound parameters,
 * structural identifiers are validated, and reserved props carry validity +
 * provenance so read-back reconstructs the neutral record.
 */
describe('renderMutation -> Cypher', () => {
  it('UpsertNode MERGEs on key and binds all values', () => {
    const [stmt] = renderMutation({ op: 'UpsertNode', kind: 'Member', key: 'M1', properties: { id: 'M1' }, restricted: true });
    expect(stmt.text).toContain('MERGE (n:`Member` {key:$key})');
    expect(stmt.text).toContain('n += $props');
    expect(stmt.params).toMatchObject({ key: 'M1', kind: 'Member', restricted: true, props: { id: 'M1' } });
  });

  it('SetLabel adds a back-ticked real label (hyphenated segmentation labels allowed)', () => {
    const [stmt] = renderMutation({ op: 'SetLabel', kind: 'Encounter', key: 'e1', label: '42-CFR-Part-2' });
    expect(stmt.text).toContain('n:`42-CFR-Part-2`');
  });

  it('UpsertEdge renders type into the pattern and binds validity + provenance', () => {
    const m: Mutation = {
      op: 'UpsertEdge', type: 'HAS_UNMET_NEED',
      from: { kind: 'Member', key: 'M1' }, to: { kind: 'SocialNeed', key: 'M1:housing' },
      properties: { domain: 'housing' }, validity: { start: '2026-03-01', end: null },
      semantics: { kind: 'causal', asserter: 'community-reported', basis: 'Z59.0@o1' },
    };
    const [stmt] = renderMutation(m);
    expect(stmt.text).toContain('[r:`HAS_UNMET_NEED`]');
    expect(stmt.params).toMatchObject({
      vStart: '2026-03-01', vEnd: null, causal: true, asserter: 'community-reported', basis: 'Z59.0@o1',
    });
  });

  it('rejects an injection-bearing identifier', () => {
    expect(() => assertIdentifier('Member`) DETACH DELETE (n) //', 'label')).toThrow();
    expect(() =>
      renderMutation({ op: 'UpsertNode', kind: 'Bad`Label', key: 'x', properties: {} }),
    ).toThrow();
  });
});
