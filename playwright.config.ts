import { defineConfig } from '@playwright/test';

const web = { browserName: 'chromium', baseURL: 'http://localhost:4179/', locale: 'en-US' } as const;
// Fixed size for the screenshot tests (visual*.spec.ts), so captures don't depend on the machine.
const viewport = { width: 1280, height: 800 };

// Run `npm run build && npm run build:ext` first (`npm run test:e2e` does both).
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.01, stylePath: 'tests/e2e/screenshot.css' },
  },
  // No platform suffix: baselines come from CI (Linux) only. VISUAL_LOCAL=<dir> keeps local runs
  // (on any OS, see tests/e2e/visual.ts) out of the repo.
  snapshotPathTemplate: `${process.env.VISUAL_LOCAL || '{testDir}/__screenshots__'}/{testFileName}/{arg}{ext}`,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'retain-on-failure' },
  webServer: {
    command: 'npx vite preview --port 4179 --strictPort',
    url: 'http://localhost:4179/',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'web', testMatch: 'web.spec.ts', use: web },
    { name: 'extension', testMatch: 'extension.spec.ts' },
    { name: 'visual-web', testMatch: 'visual-web.spec.ts', use: { ...web, viewport } },
    { name: 'visual-extension', testMatch: 'visual-extension.spec.ts', use: { viewport } },
  ],
});
