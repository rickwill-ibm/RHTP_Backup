/**
 * workQueueRows.test.ts — the CMS-0057-F reviewer inbox cannot show a blank SLA again.
 *
 * The defect: `/work-queue` rendered the literal `SLA h · due —` on EVERY row while its own
 * subtitle promised "CMS-0057-F SLA timers (72h expedited / 7d standard)". Those timers are
 * the regulated artifact and a reviewer could not see the clock on a single item.
 *
 * ROOT CAUSE (found, not guessed): the page types the BFF response as `WorkItem[]`, but in
 * mock mode `/api/work-queue` returns `devWorkQueueItems()` verbatim, and that stub uses
 * DIFFERENT field names — `slaDurationHours` / `slaDueAt` / `id` / `isExpedited` where the
 * page reads `slaHours` / `dueBy` / `evidenceId` / `priority`. Every SLA field was therefore
 * `undefined`, and the template rendered as the empty string.
 *
 * The fix is a parsed boundary: `parseQueueRows` accepts either shape and yields rows whose
 * SLA is either KNOWN (priority + hours + due-by) or explicitly UNAVAILABLE. It never
 * produces a silent blank, and an unresolvable SLA is surfaced, not hidden behind a dash.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseQueueRows, rowBreached, slaText } from '@/app/(reviewer)/work-queue/queueRows';

const NOW = '2026-09-27T00:00:00.000Z';

/** The mock stub's shape, verbatim from `devWorkQueueItems()`. */
const STUB_SHAPE = {
  id: 'wq-005',
  memberId: 'PAT-0042',
  code: '94010',
  queue: 'denied-appeal',
  netOutcome: 'denied',
  requiresPA: true,
  propensityScore: 0.82,
  propensityBand: 'high',
  isExpedited: true,
  slaDurationHours: 72,
  submittedAt: '2026-09-23T18:00:00.000Z',
  slaDueAt: '2026-09-26T18:00:00.000Z',
  slaBreached: true,
};

/** The domain `WorkItem` shape, as the persisted-evidence path returns it. */
const WORK_ITEM_SHAPE = {
  queue: 'ready-to-submit',
  disposition: 'ready',
  priority: 'standard',
  slaHours: 168,
  submittedAt: '2026-09-25T00:00:00.000Z',
  dueBy: '2026-10-02T00:00:00.000Z',
  evidenceId: 'ev-1',
  memberId: 'PAT-0087',
  code: '93306',
  propensityScore: 0.12,
  note: 'Criteria supportable — ready for human-gated submission.',
};

describe('parseQueueRows — the stub shape yields a filled SLA', () => {
  const [row] = parseQueueRows([STUB_SHAPE]);

  it('resolves slaDurationHours onto the SLA hours', () => {
    expect(row.sla.kind).toBe('known');
    if (row.sla.kind !== 'known') return;
    expect(row.sla.slaHours).toBe(72);
  });

  it('resolves slaDueAt onto the due-by', () => {
    if (row.sla.kind !== 'known') throw new Error('expected a known SLA');
    expect(row.sla.dueBy).toBe('2026-09-26T18:00:00.000Z');
  });

  it('resolves isExpedited onto the CMS-0057-F priority', () => {
    if (row.sla.kind !== 'known') throw new Error('expected a known SLA');
    expect(row.sla.priority).toBe('expedited');
  });

  it('resolves the stub id onto the evidence link', () => {
    expect(row.evidenceId).toBe('wq-005');
  });

  it('renders real SLA text, never the unfilled "SLA h · due —" template', () => {
    const text = slaText(row);
    expect(text).toContain('72h');
    expect(text).toContain('2026-09-26');
    expect(text).not.toMatch(/SLA h/);
    expect(text).not.toMatch(/due —/);
  });

  it('is breached as of now', () => {
    expect(rowBreached(row, NOW)).toBe(true);
  });
});

describe('parseQueueRows — the domain WorkItem shape still works', () => {
  const [row] = parseQueueRows([WORK_ITEM_SHAPE]);

  it('reads slaHours / dueBy / evidenceId directly', () => {
    expect(row.evidenceId).toBe('ev-1');
    if (row.sla.kind !== 'known') throw new Error('expected a known SLA');
    expect(row.sla.slaHours).toBe(168);
    expect(row.sla.priority).toBe('standard');
    expect(row.sla.dueBy).toBe('2026-10-02T00:00:00.000Z');
  });

  it('is not breached as of now', () => {
    expect(rowBreached(row, NOW)).toBe(false);
  });

  it('carries the note through', () => {
    expect(row.note).toContain('Criteria supportable');
  });
});

describe('parseQueueRows — derivation and fail-closed gaps', () => {
  it('derives the due-by from submittedAt + SLA hours when no due-by is supplied', () => {
    const [row] = parseQueueRows([
      {
        ...STUB_SHAPE,
        slaDueAt: undefined,
        dueBy: undefined,
        submittedAt: '2026-09-01T00:00:00.000Z',
      },
    ]);
    if (row.sla.kind !== 'known') throw new Error('expected a known SLA');
    expect(row.sla.dueBy).toBe('2026-09-04T00:00:00.000Z');
  });

  it('derives the SLA hours from the priority when no hours are supplied (72h expedited)', () => {
    const [row] = parseQueueRows([
      { ...STUB_SHAPE, slaDurationHours: undefined, slaHours: undefined },
    ]);
    if (row.sla.kind !== 'known') throw new Error('expected a known SLA');
    expect(row.sla.slaHours).toBe(72);
  });

  it('derives 168h for a standard-priority item with no hours supplied', () => {
    const [row] = parseQueueRows([{ ...WORK_ITEM_SHAPE, slaHours: undefined, dueBy: undefined }]);
    if (row.sla.kind !== 'known') throw new Error('expected a known SLA');
    expect(row.sla.slaHours).toBe(168);
    expect(row.sla.dueBy).toBe('2026-10-02T00:00:00.000Z');
  });

  it('marks the SLA UNAVAILABLE — not a dash — when priority cannot be established', () => {
    const [row] = parseQueueRows([
      { queue: 'more-info', memberId: 'X', code: 'Y', id: 'z', submittedAt: '2026-09-01' },
    ]);
    expect(row.sla.kind).toBe('unavailable');
    expect(slaText(row)).toMatch(/unavailable/i);
  });

  it('an unavailable SLA counts as BREACHED — a timer that cannot be read is not "fine"', () => {
    const [row] = parseQueueRows([{ queue: 'more-info', memberId: 'X', code: 'Y', id: 'z' }]);
    expect(rowBreached(row, NOW)).toBe(true);
  });

  it('marks the SLA unavailable when no submittedAt exists to compute a due-by from', () => {
    const [row] = parseQueueRows([
      { queue: 'more-info', memberId: 'X', code: 'Y', id: 'z', isExpedited: true },
    ]);
    expect(row.sla.kind).toBe('unavailable');
  });

  it('drops nothing: every input row produces an output row', () => {
    expect(parseQueueRows([STUB_SHAPE, WORK_ITEM_SHAPE, {}])).toHaveLength(3);
  });

  it('a non-array or junk payload yields no rows rather than throwing', () => {
    expect(parseQueueRows(undefined)).toEqual([]);
    expect(parseQueueRows('nope')).toEqual([]);
  });
});

describe('the denial-propensity label is not inverted', () => {
  it('carries the score through under a denial-risk name, with its band', () => {
    const [denied] = parseQueueRows([STUB_SHAPE]);
    expect(denied.denialPropensity).toBe(0.82);
    expect(denied.denialBand).toBe('high');
  });

  it('the page no longer calls a denial-propensity score "submission-readiness"', () => {
    const rel = 'src/app/(reviewer)/work-queue/page.tsx';
    const src = fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
    expect(src).not.toMatch(/submission-readiness/);
    expect(src).toMatch(/denial/i);
  });
});

describe('the reviewer inbox is reachable and clock-injected', () => {
  const rel = 'src/app/(reviewer)/work-queue/page.tsx';
  const src = fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

  it('is wrapped in AppLayout, like every sibling reviewer route', () => {
    expect(src).toMatch(/import AppLayout from '@\/components\/AppLayout'/);
    expect(src).toMatch(/<AppLayout/);
  });

  it('defines no local nowIso() and reads the clock through the injected seam', () => {
    expect(src).not.toMatch(/function nowIso\(\)/);
    expect(src).toMatch(/from '@\/lib\/clock'/);
    expect(src).not.toMatch(/new Date\(\)/);
  });

  it('renders the SLA through the parsed rows, not an inline template', () => {
    expect(src).toMatch(/parseQueueGroups\(/);
    expect(src).toMatch(/slaText\(/);
    expect(src).not.toMatch(/SLA \{item\.slaHours\}h/);
  });
});
