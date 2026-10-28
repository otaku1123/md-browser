import { expect } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { extensionTest as test } from './fixtures';
import { onlyOnBaselinePlatform, settle, VISUAL_DOCS } from './visual';

// Screenshot comparisons of the extension's file:// viewer (baselines: tests/e2e/__screenshots__/, made on CI).
onlyOnBaselinePlatform();
test.use({ extensionLocale: 'en-US' }); // CI has no CJK fonts

for (const theme of ['light', 'dark'] as const) {
  test(`renders a local .md file (${theme})`, async ({ context }) => {
    const page = await context.newPage();
    await page.emulateMedia({ colorScheme: theme });
    await page.goto(pathToFileURL(path.join(VISUAL_DOCS, 'README.md')).href);
    await expect(page.locator('.markdown-body h1')).toHaveText('Visual test document');
    await settle(page);
    await expect(page).toHaveScreenshot(`document-${theme}.png`);
  });
}
