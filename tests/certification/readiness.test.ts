/**
 * readiness.test.ts — the certification-readiness drift gate (Iteration 10 Wave C).
 *
 * WHAT THIS PROVES
 *   1. NO DOC-VS-EVIDENCE DRIFT (internal). The machine-readable JSON block embedded
 *      in docs/certification/CERTIFICATION_READINESS.md is byte-for-byte (after parse)
 *      the same object as docs/certification/readiness-summary.json. A human editing
 *      the prose without updating the summary (or vice versa) turns this red.
 *   2. EVERY STANDARD IN THE BRIEF IS PRESENT. The 13 standards the Iteration 10 brief
 *      names (US Core/USCDI, Da Vinci PAS/CRD/DTR, CARIN, SMART, CDS Hooks, CMS-0057-F,
 *      IHE PIX/PDQ, X12, terminology, 42 CFR Part 2/HIPAA, NPI/NPPES) each appear.
 *   3. HONEST RESIDUALS. Every standard carries a valid status, non-empty evidence, and
 *      a non-empty residual-gap + path-to-certification list. No standard is 'ready'
 *      (this is readiness, not certification).
 *   4. READINESS-MATCHES-MATRIX (no drift). Wave A (the capability matrix) runs in
 *      PARALLEL; this file DEFINES the shared summary schema. When Wave A exports its
 *      matrix machine-readable summary at integration.matrixSummaryPath the comparator
 *      asserts the status set matches EXACTLY and enforces E9 (readiness must not report
 *      'ready' for a standard the matrix marks 'ci-pending'/'absent'). Until then the
 *      comparator is ARMED (self-consistency asserted; cross-wave reconciliation is
 *      Wave D). E9 also holds structurally because this summary marks NOTHING 'ready'.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const DOC_PATH = path.join(ROOT, 'docs/certification/CERTIFICATION_READINESS.md');
const SUMMARY_PATH = path.join(ROOT, 'docs/certification/readiness-summary.json');

/** The standards the Iteration 10 brief names, as canonical summary ids. */
const BRIEF_STANDARD_IDS = [
  'us-core-uscdi',
  'davinci-pas',
  'davinci-crd',
  'davinci-dtr',
  'carin',
  'smart',
  'cds-hooks',
  'cms-0057-f',
  'ihe-pix-pdq',
  'x12',
  'terminology',
  'part2-hipaa',
  'npi-nppes',
] as const;

const STATUS_VOCABULARY = ['ready', 'ci-pending', 'partial', 'absent'] as const;
type Status = (typeof STATUS_VOCABULARY)[number];

interface StandardEntry {
  id: string;
  name: string;
  status: Status;
  evidence: string[];
  residualGaps: string[];
  pathToCertification: string[];
}
interface ReadinessSummary {
  schemaVersion: string;
  integration: {
    matrixSummaryPath: string;
    matrixStandardIdField: string;
    matrixStatusField: string;
    statusSetContract: string[];
  };
  requiredStandards: string[];
  standards: StandardEntry[];
}

function readSummary(): ReadinessSummary {
  return JSON.parse(fs.readFileSync(SUMMARY_PATH, 'utf8')) as ReadinessSummary;
}

/** Pull the single embedded ```json fenced block out of the readiness doc. */
function readEmbeddedSummary(): unknown {
  const md = fs.readFileSync(DOC_PATH, 'utf8');
  const m = md.match(/```json\s*\n([\s\S]*?)\n```/);
  expect(m, 'readiness doc must contain a fenced ```json machine-readable block').toBeTruthy();
  return JSON.parse((m as RegExpMatchArray)[1]);
}

describe('certification readiness — deliverable exists', () => {
  it('the readiness doc and the machine-readable summary both exist', () => {
    expect(fs.existsSync(DOC_PATH), 'CERTIFICATION_READINESS.md must exist').toBe(true);
    expect(fs.existsSync(SUMMARY_PATH), 'readiness-summary.json must exist').toBe(true);
  });
});

describe('certification readiness — no doc-vs-evidence drift', () => {
  it('the doc embedded JSON block equals the machine-readable summary exactly', () => {
    const summary = readSummary();
    const embedded = readEmbeddedSummary();
    expect(embedded).toStrictEqual(summary);
  });
});

describe('certification readiness — every standard in the brief is present', () => {
  const summary = readSummary();
  const ids = summary.standards.map((s) => s.id);

  it('requiredStandards lists exactly the brief standard set', () => {
    expect([...summary.requiredStandards].sort()).toStrictEqual([...BRIEF_STANDARD_IDS].sort());
  });

  for (const id of BRIEF_STANDARD_IDS) {
    it(`standard "${id}" appears as an entry`, () => {
      expect(ids, `brief standard ${id} missing from summary.standards`).toContain(id);
    });
  }

  it('there are no unexpected or duplicate standard entries', () => {
    expect(ids.length).toBe(BRIEF_STANDARD_IDS.length);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toStrictEqual([...BRIEF_STANDARD_IDS].sort());
  });
});

describe('certification readiness — honest residuals (E9)', () => {
  const summary = readSummary();

  it('every status is a member of the shared status vocabulary', () => {
    for (const s of summary.standards) {
      expect(STATUS_VOCABULARY, `${s.id} has out-of-vocabulary status ${s.status}`).toContain(
        s.status
      );
    }
    expect(summary.integration.statusSetContract).toStrictEqual([...STATUS_VOCABULARY]);
  });

  it("no standard is reported 'ready' (this is readiness, not certification)", () => {
    const ready = summary.standards.filter((s) => s.status === 'ready').map((s) => s.id);
    expect(ready, `E9: no standard may be 'ready' in a readiness summary`).toStrictEqual([]);
  });

  it('every standard carries evidence, residual gaps, and a path to certification', () => {
    for (const s of summary.standards) {
      expect(s.evidence.length, `${s.id}: evidence required`).toBeGreaterThan(0);
      expect(s.residualGaps.length, `${s.id}: residual gaps required (honesty)`).toBeGreaterThan(0);
      expect(
        s.pathToCertification.length,
        `${s.id}: concrete path-to-certification required`
      ).toBeGreaterThan(0);
      for (const line of [...s.evidence, ...s.residualGaps, ...s.pathToCertification]) {
        expect(line.trim().length, `${s.id}: no empty evidence/gap/path lines`).toBeGreaterThan(0);
      }
    }
  });
});

describe('certification readiness — matches the Wave A matrix (no drift)', () => {
  const summary = readSummary();
  const matrixPath = path.join(ROOT, summary.integration.matrixSummaryPath);
  const matrixPresent = fs.existsSync(matrixPath);

  it('the readiness->matrix comparator is defined and armed', () => {
    // The integration contract (fields Wave A must satisfy) is fully specified so the
    // comparison is deterministic the moment Wave A exports its matrix.
    expect(summary.integration.matrixStandardIdField).toBe('id');
    expect(summary.integration.matrixStatusField).toBe('status');
    expect(typeof summary.integration.matrixSummaryPath).toBe('string');
  });

  if (matrixPresent) {
    it('status set matches the matrix EXACTLY, per standard (no drift)', () => {
      const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8')) as {
        standards: Array<Record<string, unknown>>;
      };
      const idField = summary.integration.matrixStandardIdField;
      const statusField = summary.integration.matrixStatusField;

      const matrixStatus = new Map<string, string>();
      for (const row of matrix.standards) {
        matrixStatus.set(String(row[idField]), String(row[statusField]));
      }
      const readinessStatus = new Map(summary.standards.map((s) => [s.id, s.status]));

      // Same id set.
      expect([...readinessStatus.keys()].sort()).toStrictEqual([...matrixStatus.keys()].sort());

      // Same status per standard, and E9: readiness never 'ready' where matrix is
      // ci-pending/absent.
      for (const [id, rStatus] of readinessStatus) {
        const mStatus = matrixStatus.get(id);
        expect(rStatus, `drift on ${id}: readiness=${rStatus} matrix=${mStatus}`).toBe(mStatus);
        if (mStatus === 'ci-pending' || mStatus === 'absent') {
          expect(rStatus, `E9 violation on ${id}`).not.toBe('ready');
        }
      }
    });
  } else {
    it('matrix not yet exported — comparator armed, Wave D reconciles', () => {
      // Wave A runs in parallel; no matrix file at author time. Self-consistency stands
      // in until Wave D reconciles: requiredStandards == the actual entry id set.
      const ids = summary.standards.map((s) => s.id).sort();
      expect(ids).toStrictEqual([...summary.requiredStandards].sort());
      expect(matrixPresent).toBe(false);
    });
  }
});
