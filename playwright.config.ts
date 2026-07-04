import { defineConfig, devices } from '@playwright/test';

// E2E runs the production build: the built api serving the built web bundle,
// exactly like the Docker container. Run `pnpm nx run-many -t build` first.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3010',
    ...devices['Pixel 5'],
  },
  webServer: {
    command:
      'mkdir -p e2e/.tmp && rm -f e2e/.tmp/e2e.db e2e/.tmp/e2e.db-wal e2e/.tmp/e2e.db-shm && node apps/api/dist/index.js',
    port: 3010,
    reuseExistingServer: false,
    env: {
      PORT: '3010',
      DATABASE_URL: 'file:e2e/.tmp/e2e.db',
      WEB_DIST: 'apps/web/dist',
      APP_URL: 'http://localhost:3010',
    },
  },
});
