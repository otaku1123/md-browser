import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { expectAccessible } from './a11y';
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

// The build ships a Content-Security-Policy (vite.config.ts); every test must run without violating it.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const violations: string[] = [];
    Object.assign(window, { __cspViolations: violations });
    document.addEventListener('securitypolicyviolation', (e) => violations.push(`${e.effectiveDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}:${e.columnNumber} ${e.sample}`));
  });
});

test.afterEach(async ({ page }) => {
  const violations = await page.evaluate(() => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? []);
  expect(violations).toEqual([]);
});

test('ships a Content-Security-Policy that blocks inline scripts', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', /script-src 'self'/);
  const ran = await page.evaluate(() => {
    const s = document.createElement('script');
    s.textContent = 'window.__inlineRan = true';
    document.head.append(s);
    return (window as unknown as { __inlineRan?: boolean }).__inlineRan === true;
  });
  expect(ran).toBe(false);
  await page.evaluate(() => ((window as unknown as { __cspViolations: string[] }).__cspViolations.length = 0));
});

test('shows the welcome screen in the browser language', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open file' })).toBeVisible();
  await expect(page.locator('.toc')).toHaveClass(/empty/);
  await expect(page.locator('#workspace-name')).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('typesets inline and display math with KaTeX', async ({ page }) => {
  await openSampleFolder(page);
  await expect(page.locator('.math-inline .katex')).toHaveCount(1);
  await expect(page.locator('.math-display .katex-display')).toHaveCount(1);
  await expect(page.locator('.math .katex-error')).toHaveCount(0);
});

test('renders a folder: TOC, diagrams and relative images', async ({ page }) => {
  await openSampleFolder(page);
  await expect(page.locator('.toc a')).toHaveCount(11);
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
  await expect(page.locator('#workspace-name')).toHaveText('sample/');
});

test('jumps between a footnote reference and its note', async ({ page }) => {
  await openSampleFolder(page);
  await page.locator('.footnote-ref a').first().click();
  await expect(page.locator('.footnotes li').first()).toBeInViewport();
  await expect(page).toHaveURL(/#fn-md-1$/);
  await page.locator('.footnote-backref').first().click();
  await expect(page.locator('.footnote-ref a').first()).toBeInViewport();
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
  await expect(page.locator('#workspace-name')).toHaveText('other/');
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

test('hides a folder from the sidebar, remembers it, and shows it again', async ({ page }) => {
  await openSampleFolder(page);
  const files = page.locator('#files');
  await files.locator('[data-path="docs/other.md"]').click();
  await expect(page.locator('.markdown-body h1')).toHaveText('別ファイル');
  // Hiding the open document's folder falls back to the README.
  await files.getByRole('button', { name: 'Hide "docs" from the list' }).click();
  await expect(files.locator('.file-tree-file')).toHaveText(['README.md', 'xss.md']);
  await expect(files.locator('.file-tree summary')).toHaveCount(0);
  await expect(files.locator('[aria-current="page"]')).toHaveAttribute('data-path', 'README.md');
  await expect(page.locator('.markdown-body h1')).toHaveText('MD Browser サンプル');
  const section = files.locator('.files-hidden');
  await expect(section.locator('summary')).toHaveText('Hidden folders (1)');
  expect(await page.evaluate(() => localStorage.getItem('md-browser:hidden-dirs'))).toBe('{"sample":["docs"]}');

  await page.waitForTimeout(300); // the remembered document is saved asynchronously
  await page.reload();
  await expect(files.locator('[aria-current="page"]')).toHaveAttribute('data-path', 'README.md');
  await expect(files.locator('.file-tree-file')).toHaveText(['README.md', 'xss.md']);
  await section.locator('summary').click();
  await expectAccessible(page);
  await section.getByRole('button', { name: 'Show "docs" in the list' }).click();
  await expect(files.locator('.file-tree-file')).toHaveCount(3);
  await expect(files.locator('.file-tree summary')).toHaveText(['docs']);
  await expect(section).toHaveCount(0);
  // The open document stays.
  await expect(files.locator('[aria-current="page"]')).toHaveAttribute('data-path', 'README.md');
  expect(await page.evaluate(() => localStorage.getItem('md-browser:hidden-dirs'))).toBe('{}');
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
  const button = page.getByRole('button', { name: /sample\// }).first();
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.locator('.markdown-body h1')).toHaveText('MD Browser サンプル');
  await expect(page.locator('.welcome')).toHaveCount(0); // the welcome screen is gone
});

test('lists recent folders, most recent first, and removes them', async ({ page }) => {
  await openSampleFolder(page);
  await page.locator('#files [data-path="docs/other.md"]').click();
  await page.waitForTimeout(300);
  // A second folder, opened later, goes on top.
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
  await expect(page.locator('#workspace-name')).toHaveText('other/');
  await page.waitForTimeout(300);
  // Permission has lapsed after the reload: the list is shown instead of reopening.
  await page.addInitScript(() => {
    FileSystemHandle.prototype.queryPermission = async () => 'prompt';
    FileSystemHandle.prototype.requestPermission = async () => 'granted';
  });
  await page.reload();
  const rows = page.locator('.recent-open');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('other/');
  await expect(rows.nth(1)).toContainText('sample/');
  await expect(rows.nth(1)).toContainText('docs/other.md');
  await page.getByRole('button', { name: 'Remove other/ from the list' }).click();
  await expect(rows).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.recent-open')).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page.locator('#recent')).toBeHidden();
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
  // DOMPurify parses the raw HTML with DOMParser, which inherits the CSP: Chrome reports the
  // onerror / onload attributes there before DOMPurify strips them. Nothing else may be blocked.
  const violations = await page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations.splice(0));
  for (const v of violations) expect(v).toMatch(/^script-src-attr inline /);
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

test('applies the folder scan limit from the settings', async ({ page }) => {
  await page.goto('/');
  await page.locator('.font-settings-toggle').click();
  const limit = page.getByRole('spinbutton', { name: 'Scan limit' });
  await expect(limit).toHaveValue('5000');
  // Out-of-range input is clamped when committed.
  await limit.fill('1');
  await limit.press('Enter');
  await expect(limit).toHaveValue('100');
  await page.reload();
  await page.locator('.font-settings-toggle').click();
  await expect(limit).toHaveValue('100');

  // A folder with more entries than the limit: the shallow document is kept, the scan is cut short.
  await page.evaluate(() => {
    window.showDirectoryPicker = async () => {
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('big', { create: true });
      const write = async (d: FileSystemDirectoryHandle, name: string, text: string) => {
        const w = await (await d.getFileHandle(name, { create: true })).createWritable();
        await w.write(text);
        await w.close();
      };
      await write(dir, 'README.md', '# Big');
      const code = await dir.getDirectoryHandle('code', { create: true });
      for (let i = 0; i < 150; i++) await write(code, `f${i}.ts`, '');
      return dir;
    };
  });
  await page.getByRole('button', { name: 'Open folder' }).click();
  await expect(page.locator('.markdown-body h1')).toHaveText('Big');
  await expect(page.locator('#status')).toHaveText(/^⚠ Folder too large: scanned only 100 entries/);

  // Raising the limit rescans the open folder right away, staying on the same document.
  await page.locator('.font-settings-toggle').click();
  await limit.fill('1000');
  await limit.press('Enter');
  await expect(page.locator('#status')).toHaveText(/^README\.md · /);
  await expect(page.locator('.markdown-body h1')).toHaveText('Big');
});

test('limits the image size and shows an image at full size on click', async ({ page }) => {
  await openSampleFolder(page);
  const img = page.locator('img[alt="diagram"]');
  const limits = () => img.evaluate((el) => ({ w: getComputedStyle(el).maxWidth, h: getComputedStyle(el).maxHeight }));
  expect(await limits()).toEqual({ w: '100%', h: 'none' });

  await page.locator('.font-settings-toggle').click();
  await page
    .locator('.font-settings-panel')
    .getByRole('radiogroup', { name: 'Images' })
    .getByRole('radio', { name: 'Medium', exact: true })
    .check();
  expect(await limits()).toEqual({ w: 'min(100%, 480px)', h: '480px' });
  await page.locator('.font-settings-toggle').click();

  await img.click();
  const zoom = page.getByRole('dialog', { name: 'diagram' });
  await expect(zoom).toBeVisible();
  await expect(zoom.locator('img')).toHaveJSProperty('naturalWidth', 240);
  await page.keyboard.press('Escape');
  await expect(zoom).toHaveCount(0);
  await img.click();
  await zoom.click();
  await expect(zoom).toHaveCount(0);
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

test('keeps sequence diagram box colours readable in the dark theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openSampleFolder(page);
  await page.evaluate(() =>
    (window as unknown as { __appendToFile: (rel: string, text: string) => Promise<void> }).__appendToFile(
      'README.md',
      '\n```mermaid\nsequenceDiagram\n  box rgb(220,232,250) Software\n    participant A\n  end\n  A->>A: hello\n```\n',
    ),
  );
  const seq = page.locator('.diagram-mermaid').filter({ hasText: 'hello' });
  // Light grey text on the pastel box: only the on-screen (dark) copy is dimmed, not the print copy.
  await expect(seq.locator('.diagram-screen rect.rect')).toHaveAttribute('fill-opacity', '0.25');
  await expect(seq.locator('.diagram-print rect.rect')).not.toHaveAttribute('fill-opacity', /./);
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
  await expect(page.locator('.code-block .copy-button')).toHaveCount(1); // ts; diagrams have none
  const block = page.locator('.code-block').first();
  await block.hover();
  await block.locator('.copy-button').click();
  await expect(block.locator('.copy-button')).toHaveText('Copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'function greet(name: string): string {\n  return `Hello, ${name}`; // comment\n}',
  );
});

test('copies a heading link to the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openSampleFolder(page);
  const heading = page.locator('.markdown-body h2').first();
  const link = heading.locator('.heading-link');
  await expect(link).toHaveCSS('opacity', '0');
  await heading.hover();
  await expect(link).toHaveCSS('opacity', '1');
  const id = await heading.getAttribute('id');
  await link.click();
  await expect(link).toHaveClass(/done/);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`#${id}`);
});

test('prints only the document, on white, even in dark mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openSampleFolder(page);
  await expect(page.locator('.diagram-mermaid .diagram-screen svg')).toHaveCount(2);
  await expect(page.locator('.diagram-print').first()).toBeHidden();
  await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
  for (const sel of ['.toolbar', '#files', '.toc', '.diagram-screen']) await expect(page.locator(sel).first()).toBeHidden();
  await expect(page.locator('.diagram-print svg')).toHaveCount(4); // 2 Mermaid + 2 PlantUML
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

test('toggles the TOC and keeps the choice across reloads', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await openSampleFolder(page);
  const toggle = page.getByRole('button', { name: 'Table of contents' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.toc')).toBeVisible();
  const before = (await page.locator('#content').boundingBox())!.width;
  await toggle.click();
  await expect(page.locator('.toc')).toBeHidden();
  await expect(page.locator('.toc-resizer')).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect((await page.locator('#content').boundingBox())!.width).toBeGreaterThan(before);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Table of contents' })).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Table of contents' }).click();
  await expect(page.locator('.toc')).toBeVisible();
});

test('hides the TOC toggle when the document has no headings', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Table of contents' })).toBeHidden();
  await expect(page.locator('.toc-resizer')).toBeHidden();
});

test('resizes the TOC by dragging, with the keyboard, and resets on double-click', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await openSampleFolder(page);
  const toc = page.locator('.toc');
  const handle = page.getByRole('separator', { name: 'Resize table of contents' });
  const width = async () => Math.round((await toc.boundingBox())!.width);
  expect(await width()).toBe(280);

  const box = (await handle.boundingBox())!;
  const y = box.y + 200;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x - 100, y, { steps: 5 });
  await page.mouse.up();
  expect(await width()).toBeGreaterThan(340);
  await expect(handle).toHaveAttribute('aria-valuenow', String(await width()));

  await handle.focus();
  const w = await width();
  await page.keyboard.press('ArrowLeft');
  expect(await width()).toBe(w + 16);
  await page.keyboard.press('ArrowRight');
  expect(await width()).toBe(w);
  await page.keyboard.press('End');
  expect(await width()).toBe(480);

  expect(await page.evaluate(() => localStorage.getItem('md-browser:toc-panel'))).toBe('{"open":true,"width":480}');
  await handle.dblclick();
  expect(await width()).toBe(280);
});


test('resizes the file list, keeps the handle across documents, and resets on double-click', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await openSampleFolder(page);
  const files = page.locator('#files');
  const handle = page.getByRole('separator', { name: 'Resize file list' });
  const width = async () => Math.round((await files.boundingBox())!.width);
  expect(await width()).toBe(240);

  const box = (await handle.boundingBox())!;
  const y = box.y + 200;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + 100, y, { steps: 5 });
  await page.mouse.up();
  expect(await width()).toBeGreaterThan(300);
  await expect(handle).toHaveAttribute('aria-valuenow', String(await width()));

  await handle.focus();
  const w = await width();
  await page.keyboard.press('ArrowRight');
  expect(await width()).toBe(w + 16);
  await page.keyboard.press('ArrowLeft');
  expect(await width()).toBe(w);
  await page.keyboard.press('Home');
  expect(await width()).toBe(160);
  expect(await page.evaluate(() => localStorage.getItem('md-browser:files-sidebar'))).toBe('{"open":true,"width":160}');

  // Opening another document re-renders the list; the handle stays.
  await files.locator('[data-path="docs/other.md"]').click();
  await expect(files.locator('[aria-current="page"]')).toHaveAttribute('data-path', 'docs/other.md');
  await expect(handle).toBeVisible();
  await handle.dblclick();
  expect(await width()).toBe(240);
});

test('keeps keyboard focus inside the diagram dialog and closes it with Esc', async ({ page }) => {
  await openSampleFolder(page);
  const diagram = page.locator('.diagram-mermaid').first();
  await diagram.focus();
  await page.keyboard.press('Enter');
  const zoom = page.getByRole('dialog', { name: /Diagram at full size/ });
  await expect(zoom).toBeVisible();
  for (const name of ['Save SVG', 'Save PNG', 'Save SVG']) {
    await page.keyboard.press('Tab');
    await expect(zoom.getByRole('button', { name })).toBeFocused();
  }
  await page.keyboard.press('Shift+Tab');
  await expect(zoom.getByRole('button', { name: 'Save PNG' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(zoom).toHaveCount(0);
  await expect(diagram).toBeFocused();
});

test('opens a document image at full size from the keyboard', async ({ page }) => {
  await openSampleFolder(page);
  const img = page.getByRole('button', { name: 'diagram (Enter to open at full size)' });
  await img.focus();
  await page.keyboard.press('Enter');
  const zoom = page.getByRole('dialog', { name: 'diagram' });
  await expect(zoom).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(zoom).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(zoom).toHaveCount(0);
  await expect(img).toBeFocused();
});

test('names task list checkboxes after their items', async ({ page }) => {
  await openSampleFolder(page);
  await expect(page.getByRole('checkbox', { name: '完了したタスク' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: '未完了のタスク' })).not.toBeChecked();
});

test('opens a Mermaid diagram large and saves it as SVG and PNG', async ({ page }) => {
  await openSampleFolder(page);
  const diagram = page.locator('.diagram-mermaid').first();
  await expect(diagram.locator('svg')).toBeVisible();
  await expect(diagram).toHaveAttribute('tabindex', '0');

  await diagram.click();
  const zoom = page.getByRole('dialog', { name: /Diagram at full size/ });
  await expect(zoom.locator('svg')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(zoom).toHaveCount(0);

  await diagram.focus();
  await page.keyboard.press('Enter');
  await expect(zoom).toBeVisible();

  const [svgDownload] = await Promise.all([page.waitForEvent('download'), zoom.getByRole('button', { name: 'Save SVG' }).click()]);
  expect(svgDownload.suggestedFilename()).toBe('diagram-1.svg');
  expect(await readFile((await svgDownload.path())!, 'utf8')).toContain('xmlns="http://www.w3.org/2000/svg"');
  await expect(zoom).toBeVisible(); // saving doesn't close it

  const [pngDownload] = await Promise.all([page.waitForEvent('download'), zoom.getByRole('button', { name: 'Save PNG' }).click()]);
  expect(pngDownload.suggestedFilename()).toBe('diagram-1.png');
  expect((await readFile((await pngDownload.path())!)).subarray(1, 4).toString()).toBe('PNG');
  await expect(zoom.locator('.diagram-save-error')).toBeEmpty();
});

test('saves the second (sequence) diagram as PNG', async ({ page }) => {
  await openSampleFolder(page);
  await page.locator('.diagram-mermaid').nth(1).click();
  const zoom = page.getByRole('dialog', { name: /Diagram at full size/ });
  const [png] = await Promise.all([page.waitForEvent('download'), zoom.getByRole('button', { name: 'Save PNG' }).click()]);
  expect(png.suggestedFilename()).toBe('diagram-2.png');
  await expect(zoom.locator('.diagram-save-error')).toBeEmpty();
});

test('keeps HTML labels on screen and opens a diagram with Space', async ({ page }) => {
  await openSampleFolder(page);
  const diagram = page.locator('.diagram-mermaid').first();
  await expect(diagram.locator('svg foreignObject').first()).toBeAttached();
  await diagram.focus();
  await page.keyboard.press('Space');
  const zoom = page.getByRole('dialog', { name: /Diagram at full size/ });
  await expect(zoom).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(diagram.locator('svg foreignObject').first()).toBeAttached();
  await expect(page.locator('body > [id^="dmermaid-export"], body > #mermaid-export-1')).toHaveCount(0);
});

test('switches to the Markdown source and back, and starts each document in the preview', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 1400, height: 900 });
  await openSampleFolder(page);
  const toggle = page.getByRole('button', { name: 'Markdown source' });
  const source = page.locator('.source-view');
  await page.evaluate(() => window.scrollTo(0, 600));
  const previewY = await page.evaluate(() => window.scrollY);
  expect(previewY).toBeGreaterThan(0);

  await page.keyboard.press('ControlOrMeta+Shift+M');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(source).toBeVisible();
  await expect(page.locator('#content')).toBeHidden();
  await expect(page.locator('.toc')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Table of contents' })).toBeHidden();
  await expect(source.locator('.source-line')).toHaveCount(122);
  await expect(source.locator('.source-line').nth(1)).toHaveText('title: MD Browser サンプル\n');
  const number = await source.locator('.source-line').nth(1).evaluate((el) => getComputedStyle(el, '::before').content);
  expect(number).toBe('counter(source-line)');
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  // A copied selection keeps the line breaks and leaves out the numbers.
  await page.evaluate(() => {
    const lines = document.querySelectorAll('.source-line');
    getSelection()!.setBaseAndExtent(lines[0], 0, lines[2], lines[2].childNodes.length);
  });
  await page.keyboard.press('ControlOrMeta+c');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('---\ntitle: MD Browser サンプル\ntags: [markdown, viewer]');
  // The newline kept at each line's end adds no empty row.
  const row = await source.locator('.source-line').first().evaluate((el) => ({
    height: el.getBoundingClientRect().height,
    lineHeight: parseFloat(getComputedStyle(el).lineHeight),
  }));
  expect(row.height).toBeCloseTo(row.lineHeight, 0);
  await source.locator('.copy-button').click();
  await expect(source.locator('.copy-button')).toHaveText('Copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^---\ntitle: MD Browser サンプル\n[\s\S]*\n$/);

  // Playwright scrolls before clicking, so the preview's position is set by the shortcut and checked after a click.
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#content')).toBeVisible();
  await expect(page.locator('.toc')).toBeVisible();
  await expect(source).toBeHidden();
  expect(await page.evaluate(() => window.scrollY)).toBe(previewY);

  // Another document opens in the preview.
  await page.keyboard.press('ControlOrMeta+Shift+M');
  await expect(source).toBeVisible();
  await page.locator('#files').getByRole('button', { name: 'other.md' }).click();
  await expect(page.locator('.markdown-body h1')).toHaveText('別ファイル');
  await expect(source).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
});

test('hides the source toggle on the welcome screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Markdown source' })).toBeHidden();
  await page.keyboard.press('ControlOrMeta+Shift+M');
  await expect(page.locator('.welcome')).toBeVisible();
});

test('updates the shown source when the file changes', async ({ page }) => {
  await openSampleFolder(page);
  await page.getByRole('button', { name: 'Markdown source' }).click();
  await page.evaluate(() => (window as unknown as { __appendToFile(r: string, t: string): Promise<void> }).__appendToFile('README.md', '\n## Added heading\n'));
  await expect(page.locator('.source-line').last()).toHaveText('## Added heading');
  await page.getByRole('button', { name: 'Markdown source' }).click();
  await expect(page.locator('.markdown-body h2', { hasText: 'Added heading' })).toBeVisible();
});

test('skips from the toolbar to the document, or to its source', async ({ page }) => {
  await openSampleFolder(page);
  await page.reload(); // reopens the folder, with focus back at the start of the page
  await expect(page.locator('.markdown-body h1')).toHaveText('MD Browser サンプル');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await expect(page).not.toHaveURL(/#/);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.querySelector('main')!.contains(document.activeElement))).toBe(true);

  await page.locator('.source-toggle').click();
  await skip.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main', { name: 'Markdown source' })).toBeFocused();
});

test('passes the axe accessibility checks on the welcome screen and a document', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expectAccessible(page);
  await openSampleFolder(page);
  await expect(page.locator('.diagram-mermaid svg')).toHaveCount(2);
  await expect(page.locator('.math-display .katex-display')).toHaveCount(1);
  await expectAccessible(page);
  // The folder rows' hide buttons, shown on focus.
  await page.locator('#files .file-tree-hide').first().focus();
  await expectAccessible(page);
});

test('passes the axe accessibility checks in dark mode, settings and dialogs', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openSampleFolder(page);
  await expect(page.locator('.diagram-mermaid .diagram-screen svg')).toHaveCount(2);
  await expectAccessible(page);
  await page.locator('.font-settings-toggle').click();
  await expectAccessible(page);
  await page.locator('.font-settings-toggle').click();
  await page.locator('.diagram-mermaid').first().click();
  await expect(page.getByRole('dialog').locator('svg')).toBeVisible();
  await expectAccessible(page);
  await page.keyboard.press('Escape');
});

test('passes the axe accessibility checks in the Markdown source view', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await openSampleFolder(page);
  await page.locator('.source-toggle').click();
  await expect(page.locator('.source-code')).toBeVisible();
  // The source has no rendered headings.
  await expectAccessible(page, ['page-has-heading-one']);
});

test('renders PlantUML diagrams offline, in both themes', async ({ page }) => {
  const offsite: string[] = [];
  page.on('request', (r) => {
    if (!/^(http:\/\/localhost:4179\/|blob:|data:)/.test(r.url())) offsite.push(r.url());
  });
  await page.emulateMedia({ colorScheme: 'light' });
  await openSampleFolder(page);
  const diagrams = page.locator('.diagram-plantuml');
  await expect(diagrams.locator('svg')).toHaveCount(2);
  await expect(diagrams.nth(0)).toContainText('Hello');
  await expect(diagrams.nth(1)).toContainText('信号'); // @startuml left out
  await expect(diagrams.nth(0)).toHaveAttribute('role', 'button');

  await page.locator('.font-settings-toggle').click();
  await page.getByRole('radio', { name: 'Dark' }).check();
  await expect(diagrams.locator('.diagram-screen svg')).toHaveCount(2);
  await expect(diagrams.locator('.diagram-print svg')).toHaveCount(2);

  // The standard library is not bundled: PlantUML reports it instead of fetching it.
  await page.evaluate(() =>
    (window as unknown as { __appendToFile: (rel: string, text: string) => Promise<void> }).__appendToFile(
      'README.md',
      '\n```plantuml\n!include <C4/C4_Context>\nPerson(u, "User")\n```\n',
    ),
  );
  await expect(diagrams).toHaveCount(3);
  // Shown like a Mermaid error (message + source), with the line in the code block.
  await expect(diagrams.nth(2)).toHaveClass(/diagram-error/);
  await expect(diagrams.nth(2).locator('.diagram-error-message')).toContainText('line 1: cannot include <C4/C4_Context>');
  await expect(diagrams.nth(2).locator('pre')).toContainText('Person(u, "User")');
  await expect(diagrams.nth(2)).not.toHaveAttribute('role', 'button');
  expect(offsite).toEqual([]);
});

test('opens a PlantUML diagram large and saves it as SVG and PNG', async ({ page }) => {
  await openSampleFolder(page);
  const diagram = page.locator('.diagram-plantuml').first();
  await expect(diagram.locator('svg')).toBeVisible();
  await diagram.click();
  const zoom = page.getByRole('dialog', { name: /Diagram at full size/ });
  await expect(zoom.locator('svg')).toBeVisible();

  const [svgDownload] = await Promise.all([page.waitForEvent('download'), zoom.getByRole('button', { name: 'Save SVG' }).click()]);
  expect(svgDownload.suggestedFilename()).toBe('diagram-3.svg'); // after the two Mermaid diagrams
  expect(await readFile((await svgDownload.path())!, 'utf8')).toContain('Hello');
  const [pngDownload] = await Promise.all([page.waitForEvent('download'), zoom.getByRole('button', { name: 'Save PNG' }).click()]);
  expect(pngDownload.suggestedFilename()).toBe('diagram-3.png');
  expect((await readFile((await pngDownload.path())!)).subarray(1, 4).toString()).toBe('PNG');
  await expect(zoom.locator('.diagram-save-error')).toBeEmpty();
});
