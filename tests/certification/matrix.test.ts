/**
 * matrix.test.ts — proves the conformance matrix is honest and complete.
 *
 * Definition of done (composite v1.2):
 *   - matrix covers EVERY claimed standard (set equality with CLAIMED_STANDARDS);
 *   - every `supported` row points to a REAL, existing test file (asserted on disk);
 *   - a stub/seam-backed capability is NEVER `supported` (E9);
 *   - the machine-readable document is deterministic.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SEAM_DISPOSITIONS } from '@/lib/config/seamDispositions';
import {
  CLAIMED_STANDARDS,
  CONFORMANCE_MATRIX,
  MATRIX_VERSION,
  allCapabilities,
  buildMatrixDocument,
  capabilitiesWithStatus,
  coveredStandardIds,
  isStubBackedCapability,
  statusCounts,
  toRows,
} from '@/lib/certification';
import type { EvidenceStatus } from '@/lib/certification';

const REPO_ROOT = process.cwd();
const VALID_STATUSES: EvidenceStatus[] = ['supported', 'partial', 'ci-pending', 'absent'];

/** Repo-relative existence check (files and dirs, including [...] route dirs). */
function existsInRepo(relPath: string): boolean {
  return existsSync(resolve(REPO_ROOT, relPath));
}

/** The leading src/ or tests/ path token of a codePath description. */
function primaryCodePathToken(codePath: string): string | null {
  const m = codePath.match(/^(?:src|tests)\/\S+/);
  return m ? m[0] : null;
}

describe('conformance matrix — full standard coverage', () => {
  it('covers EXACTLY the claimed standards (no missing, no extra)', () => {
    const covered = new Set(coveredStandardIds());
    const claimed = new Set(CLAIMED_STANDARDS);

    const missing = [...claimed].filter((id) => !covered.has(id));
    const extra = [...covered].filter((id) => !claimed.has(id));

    expect(missing, `claimed standards with no matrix row: ${missing.join(', ')}`).toEqual([]);
    expect(extra, `matrix rows for unclaimed standards: ${extra.join(', ')}`).toEqual([]);
  });

  it('lists all eighteen claimed standards including every X12 family member', () => {
    // Explicit belt-and-suspenders: the brief names each of these by hand.
    for (const id of [
      'us-core-uscdi',
      'davinci-pas',
      'davinci-crd',
      'davinci-dtr',
      'carin',
      'smart',
      'cds-hooks',
      'cms-0057-f',
      'ihe-pix-pdq',
      'ihe-pixm-pdqm',
      'x12-834',
      'x12-837',
      'x12-835',
      'x12-278',
      'x12-270-271',
      'terminology',
      'part2-hipaa',
      'npi-nppes',
    ] as const) {
      expect(CLAIMED_STANDARDS).toContain(id);
      expect(coveredStandardIds()).toContain(id);
    }
  });

  it('has exactly one standard entry per claimed id (no duplicate blocks)', () => {
    const ids = CONFORMANCE_MATRIX.map((s) => s.claimId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every standard entry carries at least one capability', () => {
    for (const entry of CONFORMANCE_MATRIX) {
      expect(entry.capabilities.length, `${entry.claimId} has no capabilities`).toBeGreaterThan(0);
    }
  });
});

describe('conformance matrix — honest evidence', () => {
  it('every capability id is unique across the whole matrix', () => {
    const ids = allCapabilities().map(({ capability }) => capability.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every capability declares an explicit, valid status (E9: never defaulted)', () => {
    for (const { capability } of allCapabilities()) {
      expect(
        VALID_STATUSES,
        `${capability.id} has an invalid/absent status`,
      ).toContain(capability.evidence.status);
      expect(typeof capability.evidence.note, `${capability.id} missing note`).toBe('string');
      expect(capability.evidence.note.length).toBeGreaterThan(0);
      expect(capability.evidence.codePath.length).toBeGreaterThan(0);
    }
  });

  it('every non-null testId resolves to a real file on disk', () => {
    for (const { capability } of allCapabilities()) {
      const testId = capability.evidence.testId;
      if (testId === null) continue;
      expect(
        existsInRepo(testId),
        `${capability.id} points to a non-existent test: ${testId}`,
      ).toBe(true);
      expect(testId, `${capability.id} testId is not a tests/ path`).toMatch(/^tests\//);
    }
  });

  it('every primary codePath token resolves to a real file or directory', () => {
    for (const { capability } of allCapabilities()) {
      const token = primaryCodePathToken(capability.evidence.codePath);
      expect(token, `${capability.id} codePath has no src/tests token`).not.toBeNull();
      expect(
        existsInRepo(token as string),
        `${capability.id} codePath does not exist: ${token}`,
      ).toBe(true);
    }
  });
});

describe('conformance matrix — supported rows point to real tests', () => {
  it('every supported capability has a real, existing test file', () => {
    const supported = capabilitiesWithStatus('supported');
    expect(supported.length, 'expected at least one supported capability').toBeGreaterThan(0);

    for (const { capability } of supported) {
      const testId = capability.evidence.testId;
      expect(testId, `supported ${capability.id} has no testId`).not.toBeNull();
      expect(
        existsInRepo(testId as string),
        `supported ${capability.id} points to a missing test: ${testId}`,
      ).toBe(true);
    }
  });
});

describe('conformance matrix — no stub is marked supported (E9)', () => {
  it('no seam-anchored capability with a stub/mock disposition is supported', () => {
    for (const { capability } of allCapabilities()) {
      if (isStubBackedCapability(capability)) {
        expect(
          capability.evidence.status,
          `${capability.id} is backed by a stub/mock seam but marked ${capability.evidence.status}`,
        ).not.toBe('supported');
      }
    }
  });

  it('cross-checks each seamId against config/seamDispositions.ts directly', () => {
    for (const { capability } of allCapabilities()) {
      const seamId = capability.evidence.seamId;
      if (!seamId) continue;
      const disposition = SEAM_DISPOSITIONS[seamId]?.disposition;
      expect(disposition, `${capability.id} references an unknown seam: ${seamId}`).toBeDefined();
      if (disposition === 'fail-closed-stub' || disposition === 'mock-only') {
        expect(capability.evidence.status).not.toBe('supported');
      }
    }
  });

  it('a supported capability is never a ci-pending row in disguise (has a test)', () => {
    for (const { capability } of allCapabilities()) {
      if (capability.evidence.status === 'supported') {
        expect(capability.evidence.testId).not.toBeNull();
      }
      if (capability.evidence.status === 'absent') {
        // An absent capability makes no implementation claim, so it carries no proving test.
        expect(capability.evidence.testId).toBeNull();
      }
    }
  });
});

describe('conformance matrix — machine-readable document', () => {
  it('is deterministic across builds (no timestamps / rng)', () => {
    const a = JSON.stringify(buildMatrixDocument());
    const b = JSON.stringify(buildMatrixDocument());
    expect(a).toBe(b);
  });

  it('reports the framework version and full claimed-standard coverage', () => {
    const doc = buildMatrixDocument();
    expect(doc.version).toBe(MATRIX_VERSION);
    expect(doc.standardsCovered).toBe(CLAIMED_STANDARDS.length);
    expect(doc.claimedStandards).toEqual(CLAIMED_STANDARDS);
  });

  it('counts sum to the flattened row total', () => {
    const doc = buildMatrixDocument();
    const rows = toRows();
    const sum =
      doc.counts.supported +
      doc.counts.partial +
      doc.counts['ci-pending'] +
      doc.counts.absent;
    expect(sum).toBe(rows.length);
    expect(rows.length).toBe(allCapabilities().length);
  });

  it('statusCounts matches the document counts', () => {
    expect(buildMatrixDocument().counts).toEqual(statusCounts());
  });

  it('every row carries the fields waves B and C consume', () => {
    for (const row of toRows()) {
      expect(row.claimId.length).toBeGreaterThan(0);
      expect(row.standard.length).toBeGreaterThan(0);
      expect(row.capabilityId.length).toBeGreaterThan(0);
      expect(row.capability.length).toBeGreaterThan(0);
      expect(row.codePath.length).toBeGreaterThan(0);
      expect(VALID_STATUSES).toContain(row.status);
      expect(row.note.length).toBeGreaterThan(0);
    }
  });
});
