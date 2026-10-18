import { expect, test, type Page } from '@playwright/test';
import { readSampleFiles } from './fixtures';

// The folder picker can't be driven by Playwright, so stand it in with an OPFS folder
// filled with sample/ (OPFS handles support getFile(), values() and writes, like real ones).
async function openSampleFolder(page: Page): Promise<void> {
  const files = await readSampleFiles();
  await page.addInitScript((files: Record<string, string>) => {
    async function fileHandle(rel: string, create: boolean) {
      let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('sample', { create: true });
      const parts = rel.split('/');
      for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create });
      return dir.getFileHandle(parts[parts.length - 1], { create });
    }
    async function write(rel: string, data: BufferSource | string) {
      const w = await (await fileHandle(rel, true)).createWritable();
      await w.write(data);
      await w.close();
    }
    Object.assign(window, {
      showDirectoryPicker: async () => {
        const root = await navigator.storage.getDirectory();
        await root.removeEntry('sample', { recursive: true }).catch(() => {});
        for (const [rel, b64] of Object.entries(files)) await write(rel, Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
        return root.getDirectoryHandle('sample');
      },
      __appendToFile: async (rel: string, text: string) => {
        const old = await (await (await fileHandle(rel, false)).getFile()).text();
        await write(rel, old + text);
      },
    });
  }, files);
  await page.goto('/');
  await page.getByRole('button', { name: 'Open folder' }).click();
  await expect(page.locator('.markdown-body h1')).toHaveText('MD Browser サンプル');
}

test('shows the welcome screen in the browser language', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open file' })).toBeVisible();
  await expect(page.locator('.toc')).toHaveClass(/empty/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('renders a folder: TOC, diagrams and relative images', async ({ page }) => {
  await openSampleFolder(page);
  await expect(page.locator('.toc a')).toHaveCount(9);
  await expect(page.locator('.diagram-mermaid svg')).toHaveCount(2);
  await expect(page.locator('.markdown-alert')).toHaveCount(5);
  await expect(page.locator('.markdown-alert-note .markdown-alert-title')).toHaveText('Note');
  await expect(page.locator('img[alt="diagram"]')).toHaveAttribute('src', /^blob:/);
  await expect(page.locator('img.img-missing')).toHaveCount(1);
  await expect(page.locator('#file-select option')).toHaveCount(3);
});

test('follows relative links between documents', async ({ page }) => {
  await openSampleFolder(page);
  await page.getByRole('link', { name: '別のMDファイル' }).click();
  await expect(page.locator('#file-select')).toHaveValue('docs/other.md');
});

test('re-renders when the file changes', async ({ page }) => {
  await openSampleFolder(page);
  await page.evaluate(() => (window as unknown as { __appendToFile(r: string, t: string): Promise<void> }).__appendToFile('README.md', '\n## Added heading\n'));
  await expect(page.locator('.markdown-body h2', { hasText: 'Added heading' })).toBeVisible();
});

test('does not execute scripts embedded in Markdown', async ({ page }) => {
  await openSampleFolder(page);
  await page.locator('#file-select').selectOption('xss.md');
  await expect(page.locator('.markdown-body h1')).toHaveText('XSS');
  await expect(page.locator('a[href^="javascript:" i]')).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as { __xss?: number }).__xss)).toBeUndefined();
});

test('remembers font settings across reloads', async ({ page }) => {
  await page.goto('/');
  await page.locator('.font-settings-toggle').click();
  await page.locator('.font-settings-row').nth(1).locator('input').fill('Courier New');
  await page.waitForTimeout(600); // saves are debounced
  await page.reload();
  await expect(page.locator('.font-settings-row').nth(1).locator('input')).toHaveValue('Courier New');
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--font-code'))).toContain('Courier New');
});
