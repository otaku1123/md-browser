import { defineConfig } from '@playwright/test';

// Run `npm run build && npm run build:ext` first (`npm run test:e2e` does both).
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'retain-on-failure' },
  webServer: {
    command: 'npx vite preview --port 4179 --strictPort',
    url: 'http://localhost:4179/',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'web', testMatch: 'web.spec.ts', use: { browserName: 'chromium', baseURL: 'http://localhost:4179/', locale: 'en-US' } },
    { name: 'extension', testMatch: 'extension.spec.ts' },
  ],
});
