import { defineConfig, devices } from '@playwright/test';

// Serves dist/ with the real _headers (CSP included), so e2e sees production behaviour.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://127.0.0.1:4329', trace: 'retain-on-failure' },
  webServer: {
    command: 'bun scripts/serve-dist.ts 4329',
    url: 'http://127.0.0.1:4329/',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
