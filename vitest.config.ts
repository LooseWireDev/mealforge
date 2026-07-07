import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
    // e2e/ is Playwright's turf — vitest must not collect those specs
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
});
