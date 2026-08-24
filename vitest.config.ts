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
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
