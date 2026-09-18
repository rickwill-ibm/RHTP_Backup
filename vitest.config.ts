import { defineConfig, configDefaults } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    // Integration suites (tests/integration/**) need provisioned services
    // (Postgres/Neo4j/Temporal via testcontainers). They run in a dedicated lane
    // (npm run test:integration), NOT in the default unit run or the PR gate.
    exclude: [...configDefaults.exclude, 'tests/integration/**'],
    globals: true,
    // pg-mem schema setup + multi-slug ingest in some suite hooks can exceed the 10s
    // default on slower machines; give hooks headroom so timing variance can't flake the gate.
    hookTimeout: 30000,
    // Static-scan tests (session-secret fail-closed, no-fail-open-defaults, seam-fail-closed,
    // one-way-dependency, coding-gap-drift, privacy/security corpus) walk the ENTIRE src tree,
    // which grows as the codebase does; the walk can exceed the 5s default on a large tree/slow
    // FS and flake the gate. Give tests the same 30s headroom as hooks — no assertion is weakened.
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
