/**
 * Da Vinci conformance slice (CPT 43775): the CRD coverage-info card and the DTR Questionnaire are
 * CODED and VALUE-SET-BOUND — the thing the current engine can't produce. This pins the target so
 * the production build can be measured against it.
 */
import { describe, it, expect } from 'vitest';
import {
  buildDtrQuestionnaire,
  buildCrdCard,
  SLICE_CANONICAL,
  type QItem,
} from '@/lib/policy/dtr/conformance/bariatricSlice';
import { SYSTEM, VS_YES_NO_UNKNOWN, VS_OBESITY_DX } from '@/lib/policy/dtr/conformance/valueSets';

function flatten(items: QItem[]): QItem[] {
  return items.flatMap((i) => (i.item ? [i, ...flatten(i.item)] : [i]));
}

describe('CRD coverage-info card (coded)', () => {
  const card = buildCrdCard();
  it('is a coverage-info card with a warning indicator', () => {
    expect(
      card.cardTypes.some((c) => c.system === SYSTEM.crdCardType && c.code === 'coverage-info')
    ).toBe(true);
    expect(card.indicator).toBe('warning');
  });
  it('carries a coded coverage classification bound to the CRD coverage-information system', () => {
    expect(card.coverage.classification.every((c) => c.system === SYSTEM.crdCoverage)).toBe(true);
    expect(card.coverage.classification.some((c) => c.code === 'prior-auth-required')).toBe(true);
    expect(card.coverage.priorAuthRequired).toBe(true);
  });
  it('names the procedure with a real CPT coding', () => {
    expect(card.coverage.forCode.system).toBe(SYSTEM.cpt);
    expect(card.coverage.forCode.code).toBe('43775');
  });
  it('launches DTR via a SMART link whose appContext.questionnaire === the DTR canonical', () => {
    const link = card.links[0];
    expect(link.type).toBe('smart');
    expect(link.appContext.questionnaire).toBe(SLICE_CANONICAL);
  });
});

describe('DTR Questionnaire (coded + value-set-bound + pre-populated)', () => {
  const q = buildDtrQuestionnaire();
  const items = flatten(q.item);

  it('is the Questionnaire the CRD card launches (canonical linkage)', () => {
    expect(q.resourceType).toBe('Questionnaire');
    expect(q.url).toBe(SLICE_CANONICAL);
    expect(q.code.some((c) => c.system === SYSTEM.cpt && c.code === '43775')).toBe(true);
  });

  it('binds every CHOICE item to a real answerValueSet', () => {
    const choices = items.filter((i) => i.type === 'choice');
    expect(choices.length).toBeGreaterThan(0);
    expect(
      choices.every((i) => typeof i.answerValueSet === 'string' && i.answerValueSet.length > 0)
    ).toBe(true);
    // the supervised-program answer set is the curated yes/no/unknown value set
    const sp = items.find((i) => i.linkId === 'supervised-program');
    expect(sp?.answerValueSet).toBe(VS_YES_NO_UNKNOWN.url);
    expect(items.find((i) => i.linkId === 'obesity-dx')?.answerValueSet).toBe(VS_OBESITY_DX.url);
  });

  it('codes the BMI item to LOINC and pre-populates it from the EHR', () => {
    const bmi = items.find((i) => i.linkId === 'bmi');
    expect(bmi?.code?.some((c) => c.system === SYSTEM.loinc && c.code === '39156-5')).toBe(true);
    expect(bmi?.readOnly).toBe(true);
    expect(bmi?.extension?.some((e) => /sdc-questionnaire-initialExpression/.test(e.url))).toBe(
      true
    );
  });

  it('reveals the hiatal-hernia evidence only when the procedure is planned (enableWhen)', () => {
    const ev = items.find((i) => i.linkId === 'hiatal-hernia-evidence');
    expect(ev?.type).toBe('attachment');
    expect(ev?.enableWhen?.[0]).toEqual({
      question: 'hiatal-hernia-planned',
      operator: '=',
      answerBoolean: true,
    });
  });

  it('INVARIANT: every coded concept carries a real code system (never a bare string)', () => {
    for (const i of items) {
      for (const c of i.code ?? []) {
        expect(c.system).toMatch(/^https?:\/\/|^urn:/);
        expect(c.code.length).toBeGreaterThan(0);
      }
    }
    for (const c of VS_YES_NO_UNKNOWN.concepts) expect(c.system.length).toBeGreaterThan(0);
  });
});
