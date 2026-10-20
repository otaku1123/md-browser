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
  await expect(page.locator('details.front-matter')).not.toHaveAttribute('open');
  await expect(page.locator('details.front-matter code')).toContainText('tags: [markdown, viewer]');
  await expect(page.locator('.markdown-alert-note .markdown-alert-title')).toHaveText('Note');
  await expect(page.locator('img[alt="diagram"]')).toHaveAttribute('src', /^blob:/);
  await expect(page.locator('img.img-missing')).toHaveCount(1);
  await expect(page.locator('#files .file-tree-file')).toHaveCount(3);
  await expect(page.locator('#files summary')).toHaveText(['docs']);
  await expect(page.locator('#files [aria-current="page"]')).toHaveAttribute('data-path', 'README.md');
});

test('opens another folder in the same tab', async ({ page }) => {
  await openSampleFolder(page);
  // The second pick returns a different folder, without the first one's documents.
  await page.evaluate(() => {
    window.showDirectoryPicker = async () => {
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('other', { create: true });
      const w = await (await dir.getFileHandle('notes.md', { create: true })).createWritable();
      await w.write('# Notes');
      await w.close();
      return dir;
    };
  });
  await page.getByRole('button', { name: 'Open folder' }).click();
  await expect(page.locator('.markdown-body h1')).toHaveText('Notes');
  await expect(page.locator('#status')).toHaveText(/^notes\.md · /);
  await page.waitForTimeout(1500); // a poll of the previous folder's document would report an error
  await expect(page.locator('#status')).not.toHaveClass(/error/);
});

test('reopens the last folder and document after a reload', async ({ page }) => {
  await openSampleFolder(page);
  await page.locator('#files [data-path="docs/other.md"]').click();
  await expect(page.locator('#files [aria-current="page"]')).toHaveAttribute('data-path', 'docs/other.md');
  await page.waitForTimeout(300); // the remembered document is saved asynchronously
  await page.reload();
  await expect(page.locator('#files [aria-current="page"]')).toHaveAttribute('data-path', 'docs/other.md');
  await expect(page.locator('#files .file-tree-file')).toHaveCount(3);
  await expect(page.locator('.welcome')).toHaveCount(0);
});

test('offers a button when the permission must be asked again', async ({ page }) => {
  await openSampleFolder(page);
  await page.waitForTimeout(300);
  // Chrome asks again after the permission has lapsed; reproduce that state.
  await page.addInitScript(() => {
    let asked = false;
    FileSystemHandle.prototype.queryPermission = async () => (asked ? 'granted' : 'prompt');
    FileSystemHandle.prototype.requestPermission = async () => ((asked = true), 'granted');
  });
  await page.reload();
  const button = page.getByRole('button', { name: 'Reopen sample/' });
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.locator('.markdown-body h1')).toHaveText('MD Browser サンプル');
  await expect(button).toHaveCount(0); // the welcome screen is gone
});

test('follows relative links between documents', async ({ page }) => {
  await openSampleFolder(page);
  await page.getByRole('link', { name: '別のMDファイル' }).click();
  await expect(page.locator('#files [aria-current="page"]')).toHaveAttribute('data-path', 'docs/other.md');
});

test('opens files from the sidebar and toggles it', async ({ page }) => {
  await openSampleFolder(page);
  await page.locator('#files').getByRole('button', { name: 'other.md' }).click();
  await expect(page.locator('#files [aria-current="page"]')).toHaveAttribute('data-path', 'docs/other.md');
  const toggle = page.getByRole('button', { name: 'Files' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toggle.click();
  await expect(page.locator('#files')).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(page.locator('#files')).toBeVisible();
});

test('re-renders when the file changes', async ({ page }) => {
  await openSampleFolder(page);
  await page.evaluate(() => (window as unknown as { __appendToFile(r: string, t: string): Promise<void> }).__appendToFile('README.md', '\n## Added heading\n'));
  await expect(page.locator('.markdown-body h2', { hasText: 'Added heading' })).toBeVisible();
});

test('does not execute scripts embedded in Markdown', async ({ page }) => {
  await openSampleFolder(page);
  await page.locator('#files').getByRole('button', { name: 'xss.md' }).click();
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

test('sets the text size and content width, and resets them', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openSampleFolder(page);
  const doc = () =>
    page.locator('#content').evaluate((el) => ({ font: getComputedStyle(el).fontSize, max: getComputedStyle(el).maxWidth }));
  expect(await doc()).toEqual({ font: '16px', max: '980px' });

  await page.locator('.font-settings-toggle').click();
  const panel = page.locator('.font-settings-panel');
  await panel.getByRole('radiogroup', { name: 'Text size' }).getByRole('radio', { name: 'Large', exact: true }).check();
  await panel.getByRole('radiogroup', { name: 'Width' }).getByRole('radio', { name: 'Full', exact: true }).check();
  expect(await doc()).toEqual({ font: '18px', max: 'none' });
  // The toolbar keeps its size.
  expect(await page.locator('#open-file').evaluate((el) => getComputedStyle(el).fontSize)).toBe('13px');

  await page.waitForTimeout(600); // saves are debounced
  await page.reload();
  await expect.poll(doc).toEqual({ font: '18px', max: 'none' });
  await page.locator('.font-settings-toggle').click();
  await expect(panel.getByRole('radiogroup', { name: 'Width' }).getByRole('radio', { name: 'Full', exact: true })).toBeChecked();

  await panel.getByRole('button', { name: 'Reset to default' }).click();
  expect(await doc()).toEqual({ font: '16px', max: '980px' });
  await expect(panel.getByRole('radiogroup', { name: 'Text size' }).getByRole('radio', { name: 'Default', exact: true })).toBeChecked();
});

const LIGHT_NODE = 'rgb(236, 236, 255)'; // mermaid "default" theme
const DARK_NODE = 'rgb(31, 32, 32)'; // mermaid "dark" theme
const nodeFill = (page: Page) =>
  page.locator('.diagram-mermaid svg').first().evaluate((svg) => getComputedStyle(svg.querySelector('rect')!).fill);
const bodyBg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('switches the theme from the display settings and redraws diagrams', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await openSampleFolder(page);
  expect(await nodeFill(page)).toBe(LIGHT_NODE);

  await page.locator('.font-settings-toggle').click();
  await page.getByRole('radio', { name: 'Dark' }).check();
  expect(await bodyBg(page)).toBe('rgb(13, 17, 23)');
  await expect.poll(() => nodeFill(page)).toBe(DARK_NODE);
  expect(await page.evaluate(() => localStorage.getItem('md-browser:theme'))).toBe('"dark"');

  // Printing stays light even when dark is picked by hand.
  await page.emulateMedia({ media: 'print' });
  expect(await bodyBg(page)).toBe('rgb(255, 255, 255)');
  await expect(page.locator('.diagram-print').first()).toBeVisible();
  await page.emulateMedia({ media: 'screen' });

  await page.getByRole('radio', { name: 'Light' }).check();
  expect(await bodyBg(page)).toBe('rgb(255, 255, 255)');
  await expect.poll(() => nodeFill(page)).toBe(LIGHT_NODE);
});

test('redraws diagrams when the OS theme changes after loading', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await openSampleFolder(page);
  expect(await nodeFill(page)).toBe(LIGHT_NODE);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => nodeFill(page)).toBe(DARK_NODE);
  await expect(page.locator('.diagram-mermaid svg')).toHaveCount(4); // screen + print copies
});

test('remembers the theme across reloads', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await page.locator('.font-settings-toggle').click();
  await page.getByRole('radio', { name: 'Dark' }).check();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('.font-settings-toggle').click();
  await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();
});

test('copies code blocks to the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openSampleFolder(page);
  await expect(page.locator('.code-block .copy-button')).toHaveCount(2); // ts + plantuml; not mermaid
  const block = page.locator('.code-block').first();
  await block.hover();
  await block.locator('.copy-button').click();
  await expect(block.locator('.copy-button')).toHaveText('Copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'function greet(name: string): string {\n  return `Hello, ${name}`; // comment\n}',
  );
});

test('prints only the document, on white, even in dark mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openSampleFolder(page);
  await expect(page.locator('.diagram-screen svg')).toHaveCount(2);
  await expect(page.locator('.diagram-print').first()).toBeHidden();
  await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
  for (const sel of ['.toolbar', '#files', '.toc', '.diagram-screen']) await expect(page.locator(sel).first()).toBeHidden();
  await expect(page.locator('.diagram-print svg')).toHaveCount(2);
  await expect(page.locator('.diagram-print').first()).toBeVisible();
  const style = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    const content = document.getElementById('content')!.getBoundingClientRect();
    return {
      bg: body.backgroundColor,
      fg: body.color,
      contentWidth: content.width,
      layoutWidth: document.querySelector('.layout')!.getBoundingClientRect().width,
    };
  });
  expect(style.bg).toBe('rgb(255, 255, 255)');
  expect(style.fg).toBe('rgb(31, 35, 40)'); // light --fg
  expect(style.contentWidth).toBe(style.layoutWidth);
});

