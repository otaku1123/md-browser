import { expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { extensionTest as test } from './fixtures';

const fileUrl = (dir: string, rel: string) => pathToFileURL(path.join(dir, rel)).href;

test('renders a local .md file in place', async ({ context, workdir }) => {
  const page = await context.newPage();
  await page.goto(fileUrl(workdir, 'README.md'));
  await expect(page.locator('.markdown-body h1')).toHaveText('MD Browser サンプル');
  await expect(page.locator('.toc a')).toHaveCount(8);
  await expect(page.locator('.diagram-mermaid svg')).toHaveCount(2);
  await expect(page.locator('.plantuml-note')).toBeVisible();
  await expect(page.locator('.status')).toHaveText('自動更新 ON');
  // Relative images resolve natively against the file URL.
  await expect(page.locator('img[alt="diagram"]')).toHaveJSProperty('naturalWidth', 240);
});

test('re-renders when the file is saved', async ({ context, workdir }) => {
  const page = await context.newPage();
  await page.goto(fileUrl(workdir, 'README.md'));
  await expect(page.locator('.status')).toHaveText('自動更新 ON');
  await fs.appendFile(path.join(workdir, 'README.md'), '\n## 追加した見出し\n');
  await expect(page.locator('.markdown-body h2', { hasText: '追加した見出し' })).toBeVisible();
  await expect(page.locator('.toc a', { hasText: '追加した見出し' })).toBeVisible();
});

test('follows relative links to other .md files', async ({ context, workdir }) => {
  const page = await context.newPage();
  await page.goto(fileUrl(workdir, 'README.md'));
  await page.getByRole('link', { name: '別のMDファイル' }).click();
  await expect(page).toHaveURL(/docs\/other\.md$/);
  await expect(page.locator('.markdown-body h1')).toBeVisible();
});

test('does not execute scripts embedded in Markdown', async ({ context, workdir }) => {
  const page = await context.newPage();
  await page.goto(fileUrl(workdir, 'xss.md'));
  await expect(page.locator('.markdown-body h1')).toHaveText('XSS');
  await expect(page.locator('a[href^="javascript:" i]')).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as { __xss?: number }).__xss)).toBeUndefined();
});

test('opens the viewer with setup guidance on install', async ({ context, extensionId }) => {
  const sw = context.serviceWorkers()[0];
  await expect
    .poll(() => sw.evaluate(() => chrome.runtime.getContexts({ contextTypes: ['TAB' as chrome.runtime.ContextType] }).then((cs) => cs.map((c) => c.documentUrl))))
    .toContain(`chrome-extension://${extensionId}/index.html`);

  const viewer = await context.newPage();
  await viewer.goto(`chrome-extension://${extensionId}/index.html`);
  await expect(viewer.locator('.setup-banner.ok')).toBeVisible();
  expect(await viewer.evaluate(() => chrome.action.getBadgeText({}))).toBe('');

  // Simulate a store install, where file URL access starts off.
  await viewer.evaluate(() => {
    chrome.extension.isAllowedFileSchemeAccess = async () => false;
    const opened: string[] = [];
    (window as { __opened?: string[] }).__opened = opened;
    const create = chrome.tabs.create.bind(chrome.tabs);
    chrome.tabs.create = ((opts: chrome.tabs.CreateProperties) => {
      opened.push(opts.url ?? '');
      return create(opts);
    }) as typeof chrome.tabs.create;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(viewer.locator('.setup-banner:not(.ok) button')).toBeVisible();
  await expect.poll(() => viewer.evaluate(() => chrome.action.getBadgeText({}))).toBe('!');
  await viewer.locator('.setup-banner button').click();
  expect(await viewer.evaluate(() => (window as { __opened?: string[] }).__opened)).toEqual([`chrome://extensions/?id=${extensionId}`]);
});

test('shares font settings between file tabs and the viewer', async ({ context, extensionId, workdir }) => {
  const a = await context.newPage();
  await a.goto(fileUrl(workdir, 'README.md'));
  await a.locator('.font-settings-toggle').click();
  await a.locator('.font-settings-row').nth(0).locator('input').fill('Georgia');
  const bodyFont = (p: typeof a) => p.locator('.markdown-body').evaluate((el) => getComputedStyle(el).fontFamily);
  await expect.poll(() => bodyFont(a)).toMatch(/^"?Georgia/);

  const b = await context.newPage();
  await b.goto(fileUrl(workdir, 'docs/other.md'));
  await expect.poll(() => bodyFont(b)).toMatch(/^"?Georgia/);

  const viewer = await context.newPage();
  await viewer.goto(`chrome-extension://${extensionId}/index.html`);
  await expect.poll(() => bodyFont(viewer)).toMatch(/^"?Georgia/);

  await viewer.locator('.font-settings-toggle').click();
  await viewer.getByRole('button', { name: '既定に戻す' }).click();
  await expect.poll(() => bodyFont(a)).not.toMatch(/Georgia/);
});
