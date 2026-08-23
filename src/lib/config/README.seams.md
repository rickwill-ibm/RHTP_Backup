# DataMode seams — the fail-closed invariant and its gate

This is the enforcement contract for the platform's mock-vs-production seams. It
turns the "gates over prose" rule into a mechanical CI gate so the class of
defect a manual audit had to catch (fail-open, mock-in-production, dead-wiring —
see `verification/STUB_LEGITIMACY_FINDINGS.md`, findings U1–U4) cannot recur
silently.

## The invariant

A seam is a point where behavior switches on `getDataMode('<seam>')`
(`mock` | `seeded` | `production`). The rule for **production** mode:

> A seam with no real backend yet MUST fail closed — throw a named
> `*NotConfiguredError` and let the caller refuse to proceed. It must NEVER
> return a plausible-but-fake value on a production code path. A seam with a real
> backend MUST NOT silently fall back to the mock/in-memory implementation.

Every ACCEPTABLE seam in the audit uses this pattern (consent, terminology, all
three dataSources, backbone). Every UNACCEPTABLE finding was a place it was
skipped or inverted.

## The two artifacts that enforce it

- **`src/lib/config/seamDispositions.ts`** — a manifest with one entry per seam
  in `DATA_MODE_SEAMS`, declaring its production disposition:
  - `real-impl` — a real production implementation exists and is wired.
  - `fail-closed-stub` — production throws a named `*NotConfiguredError` until a
    real backend is wired.
  - `mock-only` — registered for config/ops visibility only; it has **no
    production consumer** (`getDataMode('<seam>')` is never called on a decision
    path), so production cannot serve a fake value from it (a demo/UI source,
    findings A14/A15).
- **`tests/governance/seamFailClosed.test.ts`** and
  **`tests/governance/noFailOpenDefaults.test.ts`** — the gate. They prove the
  manifest is honest and complete, and that the U1 fail-open class cannot return.

## Adding a new seam — you MUST declare its disposition

1. Register the seam id in `DATA_MODE_SEAMS` (`src/lib/config/dataMode.ts`).
2. Add an entry in `seamDispositions.ts`. **If you skip this, the completeness
   test goes red** — a new seam with no disposition fails CI.
3. Pick the disposition honestly:
   - **`fail-closed-stub`** — implement the production path to throw a named
     `*NotConfiguredError` (copy any dataSource loader, `getIdentitySource`,
     `getEvidenceStore`, or the terminology/profile gate). You must ALSO add a
     **prober** in `seamFailClosed.test.ts` that drives the production path and
     asserts the throw. If you don't, the proof-coverage test goes red — the
     fail-closed proof can never be skipped.
   - **`real-impl`** — wire the real backend and add a prober asserting production
     does NOT return the mock/in-memory implementation (the U4 dead-wiring class).
   - **`mock-only`** — allowed only while the seam has no production consumer. The
     moment you call `getDataMode('<seam>')` on a decision path, the mock-only
     inertness test goes red and forces you to reclassify it `real-impl` or
     `fail-closed-stub` and add a prober.

## Mock-mode fallbacks must be gated on explicit mock mode

A demo/mock fallback (canned data, in-memory store, authored actions) may only be
served when the seam is explicitly in `mock`/`seeded` mode — never as a default
that also survives production. The U1 pattern to avoid: a dev/mock flag that
defaults ON, or is gated on the flag alone. Any such flag MUST default OFF and be
excluded once real auth/backbone is configured (see `devMockEnabled()` in
`src/lib/server/devStubs.ts`). `noFailOpenDefaults.test.ts` statically forbids any
dev-mock / dev-fallback / fail-open env flag in `src/` from defaulting to `true`.

## Running the gate

```
npx tsc --noEmit
npx vitest run tests/governance
bash check-file-sizes.sh
```

All three are part of CI; a red governance suite blocks merge.
