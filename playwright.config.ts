import { defineConfig, devices } from '@playwright/test';

const { defaultBrowserType: _ignored, ...iphone } = devices['iPhone 14'];

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4174/boucle/',
    geolocation: { latitude: 47.2184, longitude: -1.5536 },
    permissions: ['geolocation'],
    locale: 'fr-FR',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx vite build && npx vite preview --port 4174 --strictPort',
    url: 'http://localhost:4174/boucle/',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: 'mac', use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } } },
    { name: 'iphone', use: { ...iphone, browserName: 'webkit' } },
  ],
});
