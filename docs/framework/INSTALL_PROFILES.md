# Install profiles — frontend-only + mock is a first-class, tested path (HW0 / I12)

Governing constraint #3: the demo must install and run with **zero backend** (no
Postgres, Neo4j, Docker, or external feeds). HW1–HW6 add durable stores and external
feeds ONLY as the production disposition of a seam; none of them may make the
frontend-only mock demo require infrastructure.

## Profiles

| Profile | Backend | Data mode | Use |
|---------|---------|-----------|-----|
| **frontend-only + mock** (default) | none | every seam `mock` | demo, laptop, CI smoke, sales |
| seeded | local Postgres (optional) | `seeded` per seam | integration dev |
| production | full substrate + external feeds | `production` per seam | pilot / go-live |

The profile is chosen entirely by configuration (`deploy.config.yaml` → `DATA_MODE*`
env), never by a code change. With no `DATA_MODE*` env set, every registered seam
resolves to `mock` (see `src/lib/config/dataMode.ts`), so a bare `npm install &&
npm run dev` is the frontend-only + mock profile.

## The mechanical lock

Two gates keep this profile from silently breaking:

1. **Mock-default lock** — `tests/demoPreservation/seam-parity.test.ts` asserts every
   registered seam DEFAULTS to `mock` and resolves to `mock` with no env set. If a
   future change makes a seam default to `production` (which would demand a backend
   for the demo), this test fails.
2. **Demo-preservation golden** — `tests/demoPreservation/demo-preservation.test.ts`
   pins the authored demo surface (graph, SMART cards, rosters, the authored
   HEDIS/STARS/MIPS gap sets, seam config) as a golden. Any regression to what the
   demo renders fails the gate. Run: `npm run check:demo`.

## For the installer scripts (install.bat / install.ps1 / setup.ps1)

The frontend-only + mock profile requires only: install Node deps, build/run the
Next.js app, set no `DATA_MODE*` env. The installer's "demo" path must not invoke
`backbone:up`, Docker, or any seed that needs a database. Any production-profile step
is gated behind an explicit `--production` (or profile) flag.
