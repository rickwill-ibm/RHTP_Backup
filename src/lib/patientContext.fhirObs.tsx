'use client';
// patientContext.fhirObs.ts — GapClosureStore provider and FHIR audit helpers

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { getFhirClient, getFhirMockMode } from './services/fhirClient';
import * as clock from './clock'; // determinism seam (Cycle 1)
import type { GapClosureEvidence, GapClosureStoreValue, HedisCompliance } from './patientContext.types';

export const GapClosureStoreContext = createContext<GapClosureStoreValue | null>(null);

// ── FHIR AuditEvent helper (module-level, fire-and-forget) ───────────────────
export function postGapClosureAuditEvent(
  gapId: string,
  patientRef: string | undefined,
  obsId: string,
  performer?: string,
) {
  if (getFhirMockMode()) return;
  const auditEvent = {
    resourceType: 'AuditEvent',
    type: { system: 'http://terminology.hl7.org/CodeSystem/audit-event-type', code: 'rest', display: 'RESTful Operation' },
    subtype: [{ system: 'http://hl7.org/fhir/restful-interaction', code: 'update', display: 'update' }],
    action: 'U',
    recorded: clock.nowIso(),
    outcome: '0',
    agent: [{
      type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType', code: 'IRCP' }] },
      who: { display: performer ?? 'TCOC Platform' },
      requestor: true,
    }],
    source: { observer: { display: 'TCOC-Platform' } },
    entity: [
      ...(patientRef ? [{ what: { reference: patientRef }, type: { code: '1', display: 'Person' } }] : []),
      { what: { reference: `Observation/${obsId}` }, type: { code: '4', display: 'Other' }, detail: [{ type: 'tcoc-gap-id', valueBase64Binary: btoa(gapId) }] },
    ],
    extension: [{ url: 'http://tcoc.example.org/fhir/StructureDefinition/tcoc-gap-id', valueString: gapId }],
  };
  getFhirClient()
    .create(auditEvent as Record<string, unknown>)
    .catch((err) => console.warn('[AuditEvent] Post failed:', err));
}

export function GapClosureStoreProvider({ children }: { children: React.ReactNode }) {
  const [closures, setClosures] = useState<Record<string, GapClosureEvidence>>({});
  const [mostRecentClosedGapByPatient, setMostRecentClosedGapByPatient] = useState<Record<string, string>>({});
  const activePatientFhirIdRef = useRef<string>('');
  const activePatientPlatformIdRef = useRef<string>('');

  const getGapClosure = useCallback((gapId: string) => closures[gapId], [closures]);

  const startClosing = useCallback((gapId: string) => {
    setClosures((prev) => ({
      ...prev,
      [gapId]: { ...prev[gapId], gapId, status: 'CLOSING' },
    }));
  }, []);

  const submitClosure = useCallback((evidence: GapClosureEvidence) => {
    const closedAt = evidence.closedAt ?? clock.nowIso();
    const procedureCode = evidence.procedureCode ?? '83036';
    const resultUnit = evidence.resultUnit ?? '%';
    const hedisCompliance: HedisCompliance =
      evidence.resultValue !== undefined
        ? evidence.resultValue < 8.0 ? 'MET' : 'NOT_MET'
        : 'PENDING';

    const finalEvidence: GapClosureEvidence = {
      ...evidence,
      status: 'CLOSED',
      closedAt,
      gainshare: 8100,
      procedureCode,
      resultUnit,
      hedisCompliance,
    };

    const activePlatformId = activePatientPlatformIdRef.current;

    setClosures((prev) => {
      const existingFhirId = prev[evidence.gapId]?.fhirObservationId;
      finalEvidence.fhirObservationId = existingFhirId ?? finalEvidence.fhirObservationId;
      return { ...prev, [evidence.gapId]: finalEvidence };
    });

    if (activePlatformId) {
      setMostRecentClosedGapByPatient((prev) => ({
        ...prev,
        [activePlatformId]: evidence.gapId,
      }));
    }

    // Mark the corresponding FHIR Task as completed (fire-and-forget).
    if (!getFhirMockMode()) {
      const fhirId = activePatientFhirIdRef.current;
      if (fhirId) {
        const taskId = `patient-${fhirId}-task-${evidence.gapId}`;
        getFhirClient()
          .update({
            id: taskId, resourceType: 'Task', status: 'completed', intent: 'order',
            lastModified: clock.nowIso(),
            output: [{ type: { text: 'Gap Closure Evidence' }, valueReference: { reference: `Observation/patient-${fhirId}-gap-${evidence.gapId}` } }],
          })
          .then(() => console.info(`[GapClosureStore] Task/${taskId} → completed`))
          .catch(() => {/* task may not exist — silently ignore */});
      }
    }

    if (!getFhirMockMode()) {
      const patientRef = activePatientFhirIdRef.current
        ? `Patient/${activePatientFhirIdRef.current}`
        : undefined;

      setClosures((prev) => {
        const existingId = prev[evidence.gapId]?.fhirObservationId;

        const observationBase: Record<string, unknown> = {
          resourceType: 'Observation',
          status: 'final',
          category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'survey', display: 'Survey' }] }],
          code: {
            coding: [{ system: 'http://loinc.org', code: procedureCode, display: evidence.gapId }],
            text: evidence.gapId,
          },
          ...(patientRef ? { subject: { reference: patientRef } } : {}),
          effectiveDateTime: evidence.dateOfService ?? closedAt,
          ...(evidence.resultValue !== undefined ? { valueQuantity: { value: evidence.resultValue, unit: resultUnit } } : {}),
          extension: [
            { url: 'http://tcoc.example.org/fhir/StructureDefinition/tcoc-gap-id', valueString: evidence.gapId },
            { url: 'http://tcoc.example.org/fhir/StructureDefinition/care-gap-status', valueString: 'Closed' },
            { url: 'http://tcoc.example.org/fhir/StructureDefinition/hedis-compliance', valueString: hedisCompliance },
            ...(evidence.performingProvider ? [{ url: 'http://tcoc.example.org/fhir/StructureDefinition/performing-provider', valueString: evidence.performingProvider }] : []),
          ],
          note: [{ text: `Gap closed via ${evidence.closedFrom ?? 'PATIENT_DETAIL'} on ${closedAt}` }],
        };

        if (existingId) {
          console.info(`[GapClosureStore] PUT Observation/${existingId} (re-close gap ${evidence.gapId})`);
          getFhirClient()
            .update({ ...observationBase, id: existingId } as Record<string, unknown> & { id: string })
            .then(() => {
              console.info(`[GapClosureStore] PUT Observation/${existingId} succeeded`);
              postGapClosureAuditEvent(evidence.gapId, patientRef, existingId, evidence.performingProvider);
            })
            .catch((err) => console.warn(`[GapClosureStore] PUT Observation/${existingId} failed:`, err));
        } else {
          console.info(`[GapClosureStore] POST Observation (first closure of gap ${evidence.gapId})`);
          getFhirClient()
            .create(observationBase)
            .then((created: unknown) => {
              const id = (created as { id?: string })?.id;
              if (id) {
                setClosures((s) => ({
                  ...s,
                  [evidence.gapId]: { ...s[evidence.gapId], fhirObservationId: id },
                }));
                console.info(`[GapClosureStore] POST Observation succeeded → id=${id}`);
                postGapClosureAuditEvent(evidence.gapId, patientRef, id, evidence.performingProvider);
              }
            })
            .catch((err) => console.warn('[GapClosureStore] POST Observation failed:', err));
        }

        return prev; // no state change in this pass — side-effect only
      });
    }
  }, []);

  const completeTask = useCallback((gapId: string) => {
    if (getFhirMockMode()) return;
    const fhirId = activePatientFhirIdRef.current;
    if (!fhirId) return;
    const taskId = `patient-${fhirId}-task-${gapId}`;
    console.info(`[GapClosureStore] PUT Task/${taskId} → completed`);
    getFhirClient()
      .update({
        id: taskId,
        resourceType: 'Task',
        status: 'completed',
        intent: 'order',
        lastModified: clock.nowIso(),
        output: [{ type: { text: 'Gap Closure Evidence' }, valueReference: { reference: `Observation/patient-${fhirId}-gap-${gapId}` } }],
      })
      .then(() => console.info(`[GapClosureStore] Task/${taskId} marked completed`))
      .catch((err) => console.warn(`[GapClosureStore] Task PUT failed:`, err));
  }, []);

  const getMostRecentClosedGapId = useCallback(
    (patientId: string) => mostRecentClosedGapByPatient[patientId],
    [mostRecentClosedGapByPatient],
  );

  const setActivePatientContext = useCallback((platformId: string, fhirId: string) => {
    activePatientPlatformIdRef.current = platformId;
    activePatientFhirIdRef.current = fhirId;
  }, []);

  const seedObservationIds = useCallback((updates: Record<string, GapClosureEvidence>) => {
    setClosures((prev) => {
      const next = { ...prev };
      for (const [gapId, seed] of Object.entries(updates)) {
        const existing = prev[gapId];
        if (existing?.status === 'CLOSING' || existing?.status === 'CLOSED') continue;
        next[gapId] = { ...seed, status: seed.status };
      }
      return next;
    });
  }, []);

  const isGapClosed = useCallback((gapId: string) => closures[gapId]?.status === 'CLOSED', [closures]);
  const isGapClosing = useCallback((gapId: string) => closures[gapId]?.status === 'CLOSING', [closures]);

  return (
    <GapClosureStoreContext.Provider value={{ closures, mostRecentClosedGapByPatient, getGapClosure, getMostRecentClosedGapId, startClosing, submitClosure, isGapClosed, isGapClosing, setActivePatientContext, seedObservationIds, completeTask }}>
      {children}
    </GapClosureStoreContext.Provider>
  );
}

export function useGapClosureStore() {
  const ctx = useContext(GapClosureStoreContext);
  if (!ctx) throw new Error('useGapClosureStore must be used within GapClosureStoreProvider');
  return ctx;
}
