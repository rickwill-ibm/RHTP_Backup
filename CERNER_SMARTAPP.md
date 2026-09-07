# Cerner MD SmartApp — Integration Record

**Date integrated:** September 3, 2026  
**Status:** ✅ Active — production route in RHTP platform  
**Branch backup:** `Cerner-MDSmartApp-090326` in `rickwill-ibm/RHTP_Backup`

---

## What This Is

The **Cerner MD SmartApp** is a SMART on FHIR application embedded inside the
RHTP platform. It provides a Cerner PowerChart-style clinical visit workflow
launched from the RHTP navigation menu.

---

## Route

```
/md-smart-launch
```

Registered in [`src/components/AppLayout.tsx`](src/components/AppLayout.tsx)
under **Care Team Workflows** as **"MD Smart Launch"**.

> ⚠️ **DO NOT change this route or replace this nav entry.**  
> The route `/md-smart-launch` MUST always point to the Cerner SmartApp.

---

## File Locations

| Path | Purpose |
|---|---|
| `src/app/md-smart-launch/page.tsx` | Main Cerner MPage entry point |
| `src/app/md-smart-launch/components/cerner/PatientBanner.tsx` | Persistent patient header |
| `src/app/md-smart-launch/components/cerner/CernerMenu.tsx` | Left chart-section navigation |
| `src/app/md-smart-launch/components/cerner/ProviderViewReview.tsx` | Review column |
| `src/app/md-smart-launch/components/cerner/ProviderViewAct.tsx` | Act/gap-closure column |
| `src/app/md-smart-launch/components/cerner/ProviderViewDocument.tsx` | Document/sign column |
| `src/app/md-smart-launch/components/cerner/ChartPages.tsx` | All 12 chart section pages |
| `src/app/md-smart-launch/components/cerner/MPageCard.tsx` | Shared card wrapper |
| `src/app/md-smart-launch/components/cerner/theme.ts` | Cerner colour/style tokens |
| `src/lib/fhir/hooks.ts` | FHIR R4 React hooks (useMedications, useAllergies, etc.) |
| `src/lib/fhir/types.ts` | FHIR R4 type definitions |
| `src/lib/fhir/store.ts` | In-memory FHIR store (mock mode) |
| `src/lib/fhir/cdsHooks.ts` | CDS Hooks patient-view invocation |
| `src/lib/services/fhirClient.ts` | FHIR client with mock/live toggle |
| `src/lib/hooks/useFhirModeSync.ts` | Syncs AppContext mock flag to fhirClient |
| `fhir/seed/maria-redhawk.bundle.json` | US Core FHIR R4 seed bundle (52 resources) |

---

## Key Dependencies

- `src/lib/appContext.tsx` — must export `useMockData` and `setUseMockData`
- `src/lib/services/fhirClient.ts` — must export `setFhirMockMode`, `getFhirMockMode`, `getFhirClient`

---

## Rules for Future Developers

1. **Never replace** `src/app/md-smart-launch/page.tsx` with the old tab-based SmartApp version
2. **Never remove** the `cerner/` component subfolder
3. **Never change** the nav entry in `AppLayout.tsx` away from `/md-smart-launch`
4. If `fhirClient.ts` or `appContext.tsx` are updated, they **must** retain `setFhirMockMode`, `getFhirMockMode`, `useMockData`, and `setUseMockData`
5. The FHIR seed bundle at `fhir/seed/maria-redhawk.bundle.json` **must remain present**

---

## GitHub Backup

- **Repo:** `rickwill-ibm/RHTP_Backup`
- **Main branch:** includes the full Cerner SmartApp as of 2026-09-03
- **Dedicated branch:** `Cerner-MDSmartApp-090326` — full standalone SmartApp snapshot
- **Source of truth on Desktop:** `~/Desktop/MDSmartAPP_071826/`
