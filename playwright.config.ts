import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  use: { baseURL: process.env.BASE_URL ?? 'http://localhost:3100', viewport: { width: 1440, height: 900 } },
  webServer: process.env.BASE_URL
    ? undefined
    : { command: 'pnpm exec next dev -p 3100', url: 'http://localhost:3100', reuseExistingServer: true, timeout: 120_000 },
});
