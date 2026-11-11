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
      __writeFile: write,
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

/** Clicks a document in the sidebar. Folders start collapsed (#122), so its folders are opened first. */
async function openFromSidebar(page: Page, path: string): Promise<void> {
  const files = page.locator('#files');
  const segs = path.split('/');
  for (let i = 1; i < segs.length; i++) {
    const details = files.locator(`details[data-dir="${segs.slice(0, i).join('/')}"]`);
    if (!(await details.evaluate((d: HTMLDetailsElement) => d.open))) await details.locator(':scope > summary').click();
  }
  await files.locator(`[data-path="${path}"]`).click();
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
  await expect(page.locator('.breadcrumb')).toBeHidden();
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
  await expect(page.locator('#files .file-tree-file')).toHaveCount(4);
  await expect(page.locator('#files summary')).toHaveText(['docs']);
  await expect(page.locator('#files details[data-dir="docs"]')).toHaveJSProperty('open', false); // folders start collapsed (#122)
  await expect(page.locator('#files [aria-current="page"]')).toHaveAttribute('data-path', 'README.md');
  await expect(page.locator('.breadcrumb li')).toHaveText(['sample', 'README.md']);
});

test('folds every folder from the buttons above the list, and one with its subfolders on Alt+click', async ({ page }) => {
  await openSampleFolder(page);
  const files = page.locator('#files');
  const docs = files.locator('details[data-dir="docs"]');
  await expect(docs).toHaveJSProperty('open', false);
  await files.getByRole('button', { name: 'Expand all folders' }).click();
  await expect(docs).toHaveJSProperty('open', true);
  await files.getByRole('button', { name: 'Collapse all folders' }).click();
  await expect(docs).toHaveJSProperty('open', false);
  await docs.locator(':scope > summary').click({ modifiers: ['Alt'] });
  await expect(docs).toHaveJSProperty('open', true);
  await docs.locator(':scope > summary').click({ modifiers: ['Alt'] });
  await expect(docs).toHaveJSProperty('open', false);
});

test('shows the document path as a breadcrumb whose folders reveal themselves in the sidebar', async ({ page }) => {
  await openSampleFolder(page);
  await openFromSidebar(page, 'docs/other.md');
  const crumbs = page.locator('.breadcrumb li');
  await expect(crumbs).toHaveText(['sample', 'docs', 'other.md']);
  await expect(page.locator('.breadcrumb [aria-current="page"]')).toHaveText('other.md');
  // Close the sidebar and collapse the folder, then the crumb brings both back and focuses the folder.
  await page.locator('#files details[data-dir="docs"] > summary').click();
  await page.locator('#toggle-files').click();
  await expect(page.locator('#files')).toBeHidden();
  const crumb = page.locator('.breadcrumb button[data-dir="docs"]');
  await expect(crumb).toHaveAttribute('title', 'Show "docs" in the file list');
  await crumb.click();
  await expect(page.locator('#files')).toBeVisible();
  await expect(page.locator('#files details[data-dir="docs"]')).toHaveJSProperty('open', true);
  await expect(page.locator('#files details[data-dir="docs"] > summary')).toBeFocused();
  // Narrow window: only the file name.
  await page.setViewportSize({ width: 600, height: 700 });
  await expect(crumbs.filter({ visible: true })).toHaveText(['other.md']);
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
  await expect(page.locator('.breadcrumb-root')).toHaveText('other');
  await page.waitForTimeout(1500); // a poll of the previous folder's document would report an error
  await expect(page.locator('#status')).not.toHaveClass(/error/);
});

test('reopens the last folder and document after a reload', async ({ page }) => {
  await openSampleFolder(page);
  await openFromSidebar(page, 'docs/other.md');
  await expect(page.locator('#files [aria-current="page"]')).toHaveAttribute('data-path', 'docs/other.md');
  await page.waitForTimeout(300); // the remembered document is saved asynchronously
  await page.reload();
  await expect(page.locator('#files [aria-current="page"]')).toHaveAttribute('data-path', 'docs/other.md');
  await expect(page.locator('#files .file-tree-file')).toHaveCount(4);
  // The open document's folder is expanded, so the marked file is in view.
  await expect(page.locator('#files details[data-dir="docs"]')).toHaveJSProperty('open', true);
  await expect(page.locator('#files [data-path="docs/other.md"]')).toBeVisible();
  await expect(page.locator('.welcome')).toHaveCount(0);
});

test('hides a folder from the sidebar, remembers it, and shows it again', async ({ page }) => {
  await openSampleFolder(page);
  const files = page.locator('#files');
  await openFromSidebar(page, 'docs/other.md');
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
  await expect(files.locator('.file-tree-file')).toHaveCount(4); // README, xss, docs/other, docs/plantuml
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
  await openFromSidebar(page, 'docs/other.md');
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
  await expect(page.locator('.breadcrumb-root')).toHaveText('other');
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

test('opens a document with the quick switcher, recent ones first, with the shortcut from the settings', async ({ page }) => {
  await openSampleFolder(page);
  const switcher = page.getByRole('dialog', { name: 'Go to file' });
  await page.keyboard.press('ControlOrMeta+P');
  await expect(switcher.getByRole('combobox')).toBeFocused();
  await expect(switcher.getByRole('option').first()).toBeVisible();
  await expectAccessible(page);
  await page.keyboard.type('othr');
  await expect(switcher.getByRole('option')).toHaveText(['other.mddocs']);
  await page.keyboard.press('Enter');
  await expect(switcher).toHaveCount(0);
  await expect(page.locator('#files [aria-current="page"]')).toHaveAttribute('data-path', 'docs/other.md');

  // Empty query: the previous document first, so Enter goes back.
  await page.keyboard.press('ControlOrMeta+P');
  await expect(switcher.getByRole('option').first()).toHaveAttribute('data-path', 'README.md');
  await page.keyboard.press('Enter');
  await expect(page.locator('#files [aria-current="page"]')).toHaveAttribute('data-path', 'README.md');

  // Another shortcut from the display settings, shared with the other tabs through storage.
  await page.locator('.font-settings-toggle').click();
  await page.getByRole('radiogroup', { name: 'Go to file' }).getByText(/K$/).click();
  await page.locator('.font-settings-toggle').click();
  await page.keyboard.press('ControlOrMeta+K');
  await expect(switcher).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(switcher).toHaveCount(0);
});

// #159: starred documents sit above the tree and first in the quick switcher; remembered per folder name.
test('stars documents as favorites, lists them first, and remembers them', async ({ page }) => {
  await openSampleFolder(page);
  const files = page.locator('#files');
  await expect(files.locator('.files-favorites')).toHaveCount(0);
  await openFromSidebar(page, 'docs/other.md');
  const star = files.locator('.file-tree').getByRole('button', { name: 'Add "docs/other.md" to favorites' });
  await expect(star).toHaveAttribute('aria-pressed', 'false');
  await star.click();
  const section = files.locator('.files-favorites');
  await expect(section.locator('summary')).toHaveText('Favorites (1)');
  await expect(section.locator('.file-tree-file')).toHaveText(['other.md']);
  // Both rows of the open document are marked.
  await expect(files.locator('[aria-current="page"]')).toHaveCount(2);
  await expect(files.locator('.file-tree').getByRole('button', { name: 'Remove "docs/other.md" from favorites' })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('md-browser:favorites'))).toBe('{"sample":["docs/other.md"]}');
  await expectAccessible(page);

  // The quick switcher offers the favorites first, then the recent documents.
  await files.locator('.file-tree').getByRole('button', { name: 'Add "xss.md" to favorites' }).click();
  await expect(section.locator('.file-tree-file')).toHaveText(['other.md', 'xss.md']);
  await openFromSidebar(page, 'README.md');
  await expect(page.locator('.markdown-body h1')).toHaveText('MD Browser サンプル'); // shown: it is the current document now
  await page.keyboard.press('ControlOrMeta+P');
  const switcher = page.getByRole('dialog', { name: 'Go to file' });
  await expect(switcher.getByRole('option')).toHaveText(['other.mddocs', 'xss.md', 'plantuml.mddocs', 'README.md']); // then the rest, the current one included
  await page.keyboard.press('Escape');

  // Opening a favorite from its section; the stars survive a reload.
  await section.locator('button[data-path="docs/other.md"]').click(); // by name: the star's label has the path too
  await expect(page.locator('.markdown-body h1')).toHaveText('別ファイル');
  await page.waitForTimeout(300); // the remembered document is saved asynchronously
  await page.reload();
  await expect(section.locator('.file-tree-file')).toHaveText(['other.md', 'xss.md']);
  await section.getByRole('button', { name: 'Remove "xss.md" from favorites' }).click();
  await section.getByRole('button', { name: 'Remove "docs/other.md" from favorites' }).click();
  await expect(section).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('md-browser:favorites'))).toBe('{}');
});

test('follows relative links between documents', async ({ page }) => {
  await openSampleFolder(page);
  await page.getByRole('link', { name: '別のMDファイル' }).click();
  await expect(page.locator('#files [aria-current="page"]')).toHaveAttribute('data-path', 'docs/other.md');
});

// #198: the documents shown are history entries, so the browser's back / forward moves between them.
test('goes back and forward between the documents shown, restoring the scroll position', async ({ page }) => {
  await openSampleFolder(page);
  const current = page.locator('#files [aria-current="page"]');
  const entries = await page.evaluate(() => history.length);
  const left = await page.evaluate(() => {
    window.scrollTo(0, 200);
    return window.scrollY;
  });
  expect(left).toBe(200);
  await page.getByRole('link', { name: '別のMDファイル' }).click();
  await expect(current).toHaveAttribute('data-path', 'docs/other.md');
  await openFromSidebar(page, 'docs/plantuml.md');
  await expect(current).toHaveAttribute('data-path', 'docs/plantuml.md');

  await page.goBack();
  await expect(current).toHaveAttribute('data-path', 'docs/other.md');
  await expect(page).toHaveTitle(/^other\.md/);
  await page.goBack();
  await expect(current).toHaveAttribute('data-path', 'README.md');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(200);
  await page.goForward();
  await expect(current).toHaveAttribute('data-path', 'docs/other.md');
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  // The first document took over the page's own entry: two more entries for the two shown after it.
  expect(await page.evaluate(() => history.length)).toBe(entries + 2);
});

test('opens files from the sidebar and toggles it', async ({ page }) => {
  await openSampleFolder(page);
  await openFromSidebar(page, 'docs/other.md');
  await expect(page.locator('#files [aria-current="page"]')).toHaveAttribute('data-path', 'docs/other.md');
  const toggle = page.getByRole('button', { name: 'Files' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toggle.click();
  await expect(page.locator('#files')).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(page.locator('#files')).toBeVisible();
});

// #123: the arrow keys move through the sidebar like a tree view.
test('moves through the file sidebar with the keyboard', async ({ page }) => {
  await openSampleFolder(page);
  const files = page.locator('#files');
  const docs = files.locator('.file-tree summary', { hasText: 'docs' });
  const docsFolder = docs.locator('..');
  await page.evaluate(() => document.querySelectorAll<HTMLDetailsElement>('#files details').forEach((d) => (d.open = false)));
  await docs.focus();
  await page.keyboard.press('ArrowDown'); // the closed folder's files are skipped
  await expect(files.locator('[data-path="README.md"]')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(docs).toBeFocused();
  await page.keyboard.press('ArrowRight'); // opens the folder…
  await expect(docsFolder).toHaveJSProperty('open', true);
  await expect(docs).toBeFocused();
  await page.keyboard.press('ArrowRight'); // …then enters it
  await expect(files.locator('[data-path="docs/other.md"]')).toBeFocused();
  await page.keyboard.press('ArrowLeft'); // a file: back to its folder
  await expect(docs).toBeFocused();
  await page.keyboard.press('ArrowLeft'); // closes it
  await expect(docsFolder).toHaveJSProperty('open', false);
  await page.keyboard.press('End');
  await expect(files.locator('[data-path="xss.md"]')).toBeFocused();
  await page.keyboard.press('Enter'); // a file row opens the document
  await expect(page.locator('.markdown-body h1')).toHaveText('XSS');
  await expect(files.locator('[aria-current="page"]')).toHaveAttribute('data-path', 'xss.md');
  // xss.md's inline handlers are reported by DOMPurify's DOMParser (see the XSS test); nothing else may be.
  const violations = await page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations.splice(0));
  for (const v of violations) expect(v).toMatch(/^script-src-attr inline /);
  await page.keyboard.press('Home');
  await expect(docs).toBeFocused();
  await page.keyboard.press('Enter'); // a folder row toggles, as a <summary> does
  await expect(docsFolder).toHaveJSProperty('open', true);
});

// #109: files added outside show up when the user comes back to the tab, on the same document.
test('lists the folder again when the user comes back to the tab', async ({ page }) => {
  await openSampleFolder(page);
  await expect(page.locator('#files .file-tree-file')).toHaveCount(4);
  await page.locator('#files details[data-dir="docs"] summary').click(); // expanded by the user: stays so after the re-render
  await page.evaluate(async () => {
    await (window as unknown as { __writeFile(rel: string, text: string): Promise<void> }).__writeFile('docs/added.md', '# Added');
    window.dispatchEvent(new Event('focus'));
  });
  await expect(page.locator('#files .file-tree-file')).toHaveCount(5);
  await expect(page.locator('#files [data-path="docs/added.md"]')).toBeVisible();
  await expect(page.locator('#files [aria-current="page"]')).toHaveAttribute('data-path', 'README.md');
  await page.locator('#files').getByRole('button', { name: 'added.md', exact: true }).click();
  await expect(page.locator('.markdown-body h1')).toHaveText('Added');
});

test('re-renders when the file changes', async ({ page }) => {
  await openSampleFolder(page);
  await page.evaluate(() => (window as unknown as { __appendToFile(r: string, t: string): Promise<void> }).__appendToFile('README.md', '\n## Added heading\n'));
  await expect(page.locator('.markdown-body h2', { hasText: 'Added heading' })).toBeVisible();
});

test('does not execute scripts embedded in Markdown', async ({ page }) => {
  await openSampleFolder(page);
  await page.locator('#files').getByRole('button', { name: 'xss.md', exact: true }).click();
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

test('applies custom CSS to the document only and remembers it', async ({ page }) => {
  await openSampleFolder(page);
  const color = (selector: string) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).color);
  const before = await color('#open-file');

  await page.locator('.font-settings-toggle').click();
  const panel = page.locator('.font-settings-panel');
  const css = panel.getByRole('textbox', { name: 'Custom CSS' });
  await css.fill('h1 { color: rgb(200, 0, 0); } button { color: rgb(0, 200, 0); }');
  await expect.poll(() => color('#content h1')).toBe('rgb(200, 0, 0)');
  // Scoped to the document: the toolbar's buttons keep their colour.
  expect(await color('#open-file')).toBe(before);
  await expect(panel.locator('.custom-css-status')).toHaveText(/characters · saved/);

  await page.reload();
  await expect.poll(() => color('#content h1')).toBe('rgb(200, 0, 0)');
  await page.locator('.font-settings-toggle').click();
  await expect(css).toHaveValue(/rgb\(200, 0, 0\)/);

  // Off keeps the text; clear removes it.
  await panel.getByRole('checkbox', { name: 'Apply' }).uncheck();
  await expect.poll(() => color('#content h1')).not.toBe('rgb(200, 0, 0)');
  await expect(css).toHaveValue(/rgb\(200, 0, 0\)/);
  await panel.getByRole('button', { name: 'Clear' }).click();
  await expect(css).toHaveValue('');
});

test('prints with the paper, link URLs, table of contents and page breaks from the settings', async ({ page }) => {
  await openSampleFolder(page);
  // Two more top-level sections (auto-reload picks the change up), for the page breaks.
  await page.evaluate(() =>
    (window as unknown as { __appendToFile(r: string, t: string): Promise<void> }).__appendToFile('README.md', '\n\n# Second part\n\nMore text.\n\n# Third part\n\nThe end.\n'),
  );
  await expect(page.locator('.markdown-body h1')).toHaveCount(3);
  const pages = async () => ((await page.pdf({ preferCSSPageSize: true })).toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;
  const linkAfter = () => page.locator('.markdown-body a[href^="http"]').first().evaluate((a) => getComputedStyle(a, '::after').content);

  // Defaults: A4 portrait, nothing added.
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.print-toc')).toBeHidden();
  expect(await linkAfter()).toBe('none');
  const plainPdf = (await page.pdf({ preferCSSPageSize: true })).toString('latin1');
  expect(plainPdf).toMatch(/MediaBox \[0 0 59[45](\.\d+)? 84[12](\.\d+)?\]/); // 210 × 297 mm in points
  const plainPages = await pages();
  await page.emulateMedia({ media: 'screen' });

  await page.locator('.font-settings-toggle').click();
  const panel = page.locator('.font-settings-panel');
  await panel.getByRole('radiogroup', { name: 'Paper' }).getByRole('radio', { name: 'Letter' }).check();
  await panel.getByRole('radiogroup', { name: 'Orientation' }).getByRole('radio', { name: 'Landscape' }).check();
  await panel.getByRole('radiogroup', { name: 'Margins' }).getByRole('radio', { name: 'Narrow' }).check();
  await panel.getByRole('checkbox', { name: 'Write the URL after each link' }).check();
  await panel.getByRole('checkbox', { name: 'Table of contents on the first page' }).check();
  await panel.getByRole('checkbox', { name: 'New page before each h1' }).check();
  await expectAccessible(page);
  // The screen is untouched.
  await expect(page.locator('.print-toc')).toBeHidden();
  expect(await linkAfter()).toBe('none');

  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.print-toc')).toBeVisible();
  await expect(page.locator('.print-toc li').first()).toHaveText('MD Browser サンプル');
  expect(await page.locator('.print-toc li').count()).toBeGreaterThan(3);
  expect(await linkAfter()).toBe('" (https://example.com)"');
  const pdf = (await page.pdf({ preferCSSPageSize: true })).toString('latin1');
  expect(pdf).toMatch(/MediaBox \[0 0 79[12](\.\d+)? 61[12](\.\d+)?\]/); // 11 × 8.5 in
  // The TOC page, then a new page for the second and third h1.
  expect(await pages()).toBeGreaterThanOrEqual(plainPages + 3);

  // Remembered.
  await page.emulateMedia({ media: 'screen' });
  await page.reload();
  await expect(page.locator('.markdown-body h1')).toHaveCount(3);
  await page.locator('.font-settings-toggle').click();
  await expect(panel.getByRole('radio', { name: 'Landscape' })).toBeChecked();
  await expect(panel.getByRole('checkbox', { name: 'New page before each h1' })).toBeChecked();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('md-browser:print')!))).toEqual({
    paper: 'letter',
    orientation: 'landscape',
    margin: 'narrow',
    linkUrls: true,
    toc: true,
    breakBeforeH1: true,
  });
});

test('exports with the light theme, a table of contents and the math fonts it uses', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await openSampleFolder(page);
  await expect(page.locator('.math-display .katex-display')).toHaveCount(1);
  await page.locator('.font-settings-toggle').click();
  const panel = page.locator('.font-settings-panel');
  await panel.getByRole('radiogroup', { name: 'Theme' }).first().getByRole('radio', { name: 'Dark' }).check();
  await expect(page.locator('.diagram-print').first()).toBeAttached();
  const save = async () => {
    const [download] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Save as HTML' }).click()]);
    return readFile((await download.path())!, 'utf8');
  };

  // Defaults: as shown (dark, both diagram copies), no TOC, the used math fonts embedded.
  const shown = await save();
  expect(shown).toContain('data-theme="dark"');
  expect(shown).toContain('class="diagram-screen"');
  expect(shown).not.toContain('<details class="export-toc"');
  const faces = shown.match(/@font-face\{[^}]*\}/g) ?? [];
  expect(faces.length).toBeGreaterThan(0);
  expect(faces.length).toBeLessThan(19); // KaTeX ships 19; the sample's math uses a few
  for (const face of faces) expect(face).toContain('src: url(data:font/woff2;base64,');
  expect(shown).not.toMatch(/url\(https?:[^)]*\.woff2\)/);

  const exportGroup = panel.locator('.export-setting');
  await exportGroup.getByRole('radio', { name: 'Light' }).check();
  await exportGroup.getByRole('checkbox', { name: 'Table of contents at the top' }).check();
  await exportGroup.getByRole('checkbox', { name: 'Embed the math fonts (when there is math)' }).uncheck();
  await expectAccessible(page);
  const light = await save();
  expect(light).toContain('data-theme="light"');
  expect(light).not.toContain('class="diagram-screen"');
  expect(light).not.toContain('class="diagram-print"');
  expect(light).toContain('<details class="export-toc" open=""><summary>Table of contents</summary><ol class="toc-list">');
  expect(light).not.toContain('@font-face');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('md-browser:export')!))).toEqual({ theme: 'light', toc: true, mathFonts: false });

  // The saved file shows the TOC and the light diagrams.
  const saved = await page.context().newPage();
  await saved.setContent(light);
  await expect(saved.locator('.export-toc li').first()).toHaveText('MD Browser サンプル');
  expect(await saved.locator('.diagram svg').count()).toBeGreaterThanOrEqual(2);
  await saved.close();
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

/** The size buttons of an image or diagram, which sit in a frame around it. */
const sizeButtons = (item: ReturnType<Page['locator']>) =>
  item.locator('xpath=ancestor::*[contains(concat(" ", @class, " "), " media-frame ")][1]').getByRole('group', { name: 'Display size' });
/** Mermaid's own width for a diagram (its svg's max-width), before any scaling. */
const naturalWidth = (svg: ReturnType<Page['locator']>) => svg.evaluate((el) => parseFloat((el as SVGSVGElement).style.maxWidth));
const widthOf = (locator: ReturnType<Page['locator']>) => locator.evaluate((el) => Math.round(el.getBoundingClientRect().width));
/** Width of the text column, the most an image or diagram may take. */
const columnWidth = (page: Page) =>
  page.locator('#content').evaluate((el) => {
    const style = getComputedStyle(el);
    return Math.round(el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
  });

test('scales images and diagrams by the image setting, scrolling them sideways beyond the text width', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await openSampleFolder(page);
  const img = page.locator('img[alt="diagram"]'); // 240px wide
  const chart = page.locator('.diagram-mermaid svg').first();
  await expect.poll(() => widthOf(img)).toBe(240);
  const natural = await naturalWidth(chart);
  const column = await columnWidth(page);
  // At 100% a wide diagram is fitted to the text, as a large image is.
  expect(await widthOf(chart)).toBe(Math.min(Math.round(natural), column));
  const images = page.locator('.font-settings-panel').getByRole('radiogroup', { name: 'Images & diagrams' });
  const scrolls = (box: ReturnType<Page['locator']>) => box.evaluate((el) => el.scrollWidth > el.clientWidth);

  await page.locator('.font-settings-toggle').click();
  await images.getByRole('radio', { name: '50%', exact: true }).check();
  expect(await widthOf(img)).toBe(120);
  expect(Math.abs((await widthOf(chart)) - natural / 2)).toBeLessThanOrEqual(1);
  await images.getByRole('radio', { name: '150%', exact: true }).check();
  expect(await widthOf(img)).toBe(360);
  expect(Math.abs((await widthOf(chart)) - natural * 1.5)).toBeLessThanOrEqual(1);
  // Twice the flowchart is wider than the text (#197): it keeps that size and scrolls in its box,
  // which stays within the column. The image still fits.
  await images.getByRole('radio', { name: '200%', exact: true }).check();
  expect(await widthOf(img)).toBe(480);
  expect(natural * 2).toBeGreaterThan(column);
  expect(Math.abs((await widthOf(chart)) - natural * 2)).toBeLessThanOrEqual(1);
  const chartBox = page.locator('.diagram-mermaid').first();
  expect(await widthOf(chartBox)).toBeLessThanOrEqual(column);
  expect(await scrolls(chartBox)).toBe(true);
  const imgScroll = img.locator('xpath=ancestor::*[contains(concat(" ", @class, " "), " media-scroll ")][1]');
  expect(await scrolls(imgScroll)).toBe(false);
  // The scroller is one only while enlarged: a scroll container would add a gap under every image.
  const overflow = () => imgScroll.evaluate((el) => getComputedStyle(el).overflowX);
  expect(await overflow()).toBe('auto');
  await images.getByRole('radio', { name: '100%', exact: true }).check();
  expect(await overflow()).toBe('visible');
  await images.getByRole('radio', { name: '200%', exact: true }).check();
  await page.locator('.font-settings-toggle').click();

  // A narrower window: the enlarged image is wider than the text and scrolls in its frame too.
  await page.setViewportSize({ width: 420, height: 800 });
  await expect.poll(() => columnWidth(page)).toBeLessThan(480);
  expect(await widthOf(img)).toBe(480);
  expect(await widthOf(imgScroll)).toBeLessThanOrEqual(await columnWidth(page));
  expect(await scrolls(imgScroll)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect.poll(() => scrolls(imgScroll)).toBe(false);

  // The zoom still shows the image at its natural size.
  await img.click();
  const zoom = page.getByRole('dialog', { name: 'diagram' });
  await expect(zoom).toBeVisible();
  await expect(zoom.locator('img')).toHaveJSProperty('naturalWidth', 240);
  expect(await widthOf(zoom.locator('img'))).toBe(240);
  await page.keyboard.press('Escape');
  await expect(zoom).toHaveCount(0);
  await img.click();
  await zoom.click();
  await expect(zoom).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('md-browser:fonts') ?? '{}').image)).toBe(200);
});

test('resizes one image or diagram from its buttons and remembers it for the document', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await openSampleFolder(page);
  const img = page.locator('img[alt="diagram"]');
  const imgSize = sizeButtons(img);
  const chart = page.locator('.diagram-mermaid').first();
  const chartSvg = chart.locator('svg');
  const chartSize = sizeButtons(chart);
  await expect.poll(() => widthOf(img)).toBe(240);
  const natural = await naturalWidth(chartSvg);
  const second = page.locator('.diagram-mermaid svg').nth(1);
  const secondWidth = await widthOf(second);

  // Shown on hover; a click resizes without opening the zoom.
  await expect(imgSize).toHaveCSS('opacity', '0');
  await img.hover();
  await expect(imgSize).toHaveCSS('opacity', '1');
  await imgSize.getByRole('button', { name: 'Make larger' }).click();
  await imgSize.getByRole('button', { name: 'Make larger' }).click();
  expect(await widthOf(img)).toBe(360);
  await expect(imgSize.getByRole('button', { name: 'Reset size (now 150%)' })).toHaveText('150%');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // From the keyboard: the buttons follow the diagram in the tab order and show on focus.
  await chart.focus();
  await page.keyboard.press('Tab');
  await expect(chartSize.getByRole('button', { name: 'Make smaller' })).toBeFocused();
  await expect(chartSize).toHaveCSS('opacity', '1');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(Math.abs((await widthOf(chartSvg)) - natural / 2)).toBeLessThanOrEqual(1);
  await expectAccessible(page);
  // Other items keep the setting.
  expect(await widthOf(second)).toBe(secondWidth);

  await page.reload();
  await expect(page.locator('.markdown-body h1')).toHaveText('MD Browser サンプル');
  await expect.poll(() => widthOf(img)).toBe(360);
  await expect.poll(async () => Math.abs((await widthOf(chartSvg)) - natural / 2)).toBeLessThanOrEqual(1);

  // The n% button goes back to the setting; the next setting applies to it again.
  await chartSize.getByRole('button', { name: 'Reset size (now 50%)' }).click();
  expect(Math.abs((await widthOf(chartSvg)) - Math.min(natural, await columnWidth(page)))).toBeLessThanOrEqual(1);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('.font-settings-toggle').click();
  await page.getByRole('radio', { name: '50%', exact: true }).check();
  expect(Math.abs((await widthOf(chartSvg)) - natural / 2)).toBeLessThanOrEqual(1);
  expect(await widthOf(img)).toBe(360); // its own size stays
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('md-browser:media-sizes')!));
  expect(saved['sample/README.md'].items).toEqual({ 'img:img/diagram.svg#1': 150 });
});

test('keeps a diagram size across a theme change and in print', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await openSampleFolder(page);
  const chart = page.locator('.diagram-mermaid').first();
  const chartSize = sizeButtons(chart);
  const natural = await naturalWidth(chart.locator('svg'));
  await chart.hover();
  await chartSize.getByRole('button', { name: 'Make smaller' }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(chart.locator('.diagram-screen svg')).toHaveCount(1);
  await expect.poll(async () => Math.abs((await widthOf(chart.locator('.diagram-screen svg'))) - natural * 0.75)).toBeLessThanOrEqual(2);
  await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
  await expect(chartSize).toBeHidden();
  expect(Math.abs((await widthOf(chart.locator('.diagram-print svg'))) - natural * 0.75)).toBeLessThanOrEqual(2);
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

  // The export section has a "Light" too (its own theme choice).
  await page.getByRole('radiogroup', { name: 'Theme' }).first().getByRole('radio', { name: 'Light' }).check();
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

// #156: GitHub's theme-specific images follow the shown theme, and printing uses the light ones.
const THEMED_MD = [
  '# Themed',
  '![light](../img/diagram.svg#gh-light-mode-only)',
  '![dark](../img/loading.gif#gh-dark-mode-only)',
  '<picture>',
  '<source media="(prefers-color-scheme: dark)" srcset="../img/loading.gif">',
  '<img src="../img/diagram.svg" alt="pic">',
  '</picture>',
].join('\n\n');
const pictureShows = (page: Page) =>
  page.locator('picture').evaluate((p) => {
    const img = p.querySelector('img')!;
    return img.currentSrc === p.querySelector('source')!.srcset ? 'dark' : img.currentSrc === img.src ? 'light' : img.currentSrc;
  });

test('shows the images for the current theme (GitHub #gh-…-mode-only and <picture>)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await openSampleFolder(page);
  await page.evaluate(async (md) => {
    await (window as unknown as { __writeFile(rel: string, text: string): Promise<void> }).__writeFile('docs/themed.md', md);
    window.dispatchEvent(new Event('focus'));
  }, THEMED_MD);
  await openFromSidebar(page, 'docs/themed.md');
  const light = page.locator('img[alt="light"]');
  const dark = page.locator('img[alt="dark"]');
  await expect(light).toBeVisible();
  await expect(dark).toBeHidden();
  await expect(light).toHaveAttribute('src', /^blob:/); // the marker was read before the ref was resolved
  await expect(page.locator('picture source')).toHaveAttribute('srcset', /^blob:/);
  await expect.poll(() => pictureShows(page)).toBe('light');

  await page.locator('.font-settings-toggle').click();
  await page.getByRole('radio', { name: 'Dark' }).check();
  await expect(dark).toBeVisible();
  await expect(light).toBeHidden();
  await expect.poll(() => pictureShows(page)).toBe('dark');
  await expectAccessible(page);

  // Printing (beforeprint / afterprint) switches to the light images and back.
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await expect(light).toBeVisible();
  await expect(dark).toBeHidden();
  await expect.poll(() => pictureShows(page)).toBe('light');
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(dark).toBeVisible();
  await expect.poll(() => pictureShows(page)).toBe('dark');

  // Back to the OS setting, then the OS flips: the images follow without a re-render.
  await page.getByRole('radio', { name: 'System' }).check();
  await expect(light).toBeVisible();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(dark).toBeVisible();
  await expect.poll(() => pictureShows(page)).toBe('dark');
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

// #111: on narrow screens the TOC sits above the text, so bringing its active entry into view
// must scroll only the TOC, not pull the page back up while the user scrolls down.
test('keeps the page where the user scrolled on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 700 });
  await openSampleFolder(page);
  await page.evaluate(() => scrollTo(0, 1500));
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => scrollY)).toBe(1500);
  // The TOC still follows inside its own box.
  const inBox = await page.locator('.toc').evaluate((toc) => {
    const box = toc.getBoundingClientRect();
    const a = toc.querySelector('a.active')!.getBoundingClientRect();
    return a.top >= box.top && a.bottom <= box.bottom;
  });
  expect(inBox).toBe(true);
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
  await openFromSidebar(page, 'docs/other.md');
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
  await openFromSidebar(page, 'docs/other.md');
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

test('fetches a PlantUML standard library as data from the host named in the settings', async ({ page }) => {
  // A bundle in the official host's shape, served by the test: a script that is read, never run.
  // The engine only knows the real library names (c4, awslib, …) and looks paths up in lower case.
  const bundle =
    '(function(){window.PLANTUML_STDLIB_INFO=window.PLANTUML_STDLIB_INFO||{};window.PLANTUML_STDLIB_INFO.c4={name:"C4",display_name:"C4 (test)"};' +
    'window.PLANTUML_STDLIB=window.PLANTUML_STDLIB||{};window.PLANTUML_STDLIB.c4=window.PLANTUML_STDLIB.c4||{};\n' +
    'window.PLANTUML_STDLIB.c4["c4_context"]=\'rectangle "From the library" as lib;\\\' a PlantUML comment, not code\'.split(";")})();';
  const requested: string[] = [];
  await page.route('https://stdlib.test/**', (route) => {
    requested.push(route.request().url());
    void route.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body: bundle });
  });
  await openSampleFolder(page);
  // Without a host the include fails; naming one redraws the diagram in place (#183).
  await page.evaluate(() =>
    (window as unknown as { __appendToFile: (rel: string, text: string) => Promise<void> }).__appendToFile(
      'README.md',
      '\n```plantuml\n!include <C4/C4_Context>\nlib --> [App]\n```\n',
    ),
  );
  const diagram = page.locator('.diagram-plantuml').nth(2);
  await expect(diagram).toHaveClass(/diagram-error/);
  expect(requested).toEqual([]);

  await page.locator('.font-settings-toggle').click();
  const panel = page.locator('.font-settings-panel');
  const host = panel.getByRole('textbox', { name: 'Library host' });
  await host.fill('ftp://stdlib.test/');
  await host.press('Enter');
  await expect(panel.locator('.plantuml-setting [role="alert"]')).toHaveText(/must start with https:\/\//);
  await host.fill('https://stdlib.test/libs');
  await host.press('Enter');
  await expect(host).toHaveValue('https://stdlib.test/libs/');
  await expect(panel.locator('.plantuml-setting [role="alert"]')).toBeEmpty();
  await page.keyboard.press('Escape');

  await expect(diagram.locator('svg')).toHaveCount(1);
  await expect(diagram).toContainText('From the library');
  await expect(diagram).not.toHaveClass(/diagram-error/);
  // One bundle, named after the library; the diagram source stays in the page.
  expect(requested).toEqual(['https://stdlib.test/libs/c4.min.js']);
  expect(await page.evaluate(() => localStorage.getItem('md-browser:plantuml'))).toBe('{"stdlibUrl":"https://stdlib.test/libs/"}');
});

test('draws JSON, YAML, mind map, WBS and Gantt diagrams with PlantUML', async ({ page }) => {
  await openSampleFolder(page);
  await openFromSidebar(page, 'docs/plantuml.md');
  const diagrams = page.locator('.diagram-plantuml');
  await expect(diagrams).toHaveCount(6);
  await expect(diagrams.locator('svg')).toHaveCount(5); // the standard library example has no host to fetch from
  await expect(diagrams.filter({ hasText: 'md-browser' })).toHaveCount(2); // JSON and YAML
  await expect(diagrams.nth(2)).toContainText('見出し');
  await expect(diagrams.nth(3)).toContainText('単体テスト');
  await expect(diagrams.nth(4)).toContainText('設計');
  await expect(diagrams.nth(5)).toHaveClass(/diagram-error/);
  await expect(diagrams.nth(5).locator('.diagram-error-message')).toContainText('cannot include <C4/C4_Context>');
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

test('searches the text of every file in the folder from a panel', async ({ page }) => {
  await openSampleFolder(page);
  await page.keyboard.press('ControlOrMeta+Shift+F');
  const panel = page.getByRole('search', { name: 'Search in folder' });
  await expect(panel).toBeVisible();
  const input = panel.getByRole('searchbox');
  await expect(input).toBeFocused();
  await input.fill('ファイル');
  await expect(panel.locator('.search-panel-status')).toHaveText(/^\d+ matches in 2 files$/);
  // Most matches first: the README mentions files many times, docs/other.md once in its title.
  await expect(panel.locator('.search-file-path')).toContainText(['README.md', 'docs/other.md']);
  const other = panel.locator('.search-file[aria-label="docs/other.md"]'); // the README's excerpts mention that path too
  await expect(other.locator('.search-hit mark')).toHaveText(['ファイル']);
  await expect(other.locator('.search-hit-line')).toHaveText(['L1']);
  await expectAccessible(page);
  await other.locator('.search-hit').first().click();
  await expect(page.locator('.markdown-body h1')).toHaveText('別ファイル');
  await expect(panel).toBeVisible(); // stays open to browse the other matches

  // A hit further down the README: the page opens it scrolled to that block, with the matches
  // highlighted (CSS Custom Highlight API) and the ones on that line marked as current.
  const highlights = () =>
    page.evaluate(() => ({
      all: CSS.highlights.get('md-browser-search')?.size ?? 0,
      current: CSS.highlights.get('md-browser-search-current')?.size ?? 0,
    }));
  expect(await highlights()).toEqual({ all: 1, current: 1 });
  const linkHit = panel.locator('.search-file[aria-label="README.md"] .search-hit', { hasText: '別のMDファイル' });
  const line = await linkHit.getAttribute('data-line');
  await linkHit.click();
  await expect(page.locator('.markdown-body h1')).toHaveText('MD Browser サンプル');
  await expect(page.locator(`.markdown-body [data-line="${line}"]`)).toBeInViewport();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  const marked = await highlights();
  expect(marked.all).toBeGreaterThan(marked.current);
  expect(marked.current).toBeGreaterThan(0);
  // The highlights are ranges of the rendered nodes: a re-render renews them.
  await page.evaluate(async () => {
    await (window as unknown as { __appendToFile(rel: string, text: string): Promise<void> }).__appendToFile('README.md', '\n\nもう一つのファイル\n');
  });
  await expect(page.locator('.markdown-body p', { hasText: 'もう一つのファイル' })).toBeVisible();
  expect((await highlights()).all).toBe(marked.all + 1);

  // "This file": only the shown document, and Enter / Shift+Enter walk its matches.
  await panel.getByRole('button', { name: 'This file', exact: true }).click();
  await expect(panel.locator('.search-panel-status')).toHaveText(/^\d+ matches in 1 files$/);
  await expect(panel.locator('.search-file-path')).toHaveCount(1);
  await input.focus();
  await page.keyboard.press('Enter');
  await expect(panel.locator('.search-panel-status')).toHaveText(/ · 1 \/ \d+$/);
  await expect(panel.locator('.search-hit[aria-current="true"]')).toHaveAttribute('data-line', /^\d+$/);
  const firstLine = await panel.locator('.search-hit[aria-current="true"]').getAttribute('data-line');
  await page.keyboard.press('Enter');
  await expect(panel.locator('.search-panel-status')).toHaveText(/ · 2 \/ \d+$/);
  await expect(panel.locator('.search-hit[aria-current="true"]')).not.toHaveAttribute('data-line', firstLine!);
  expect((await highlights()).current).toBeGreaterThan(0);
  await page.keyboard.press('Shift+Enter');
  await expect(panel.locator('.search-panel-status')).toHaveText(/ · 1 \/ \d+$/);
  await expectAccessible(page);

  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(page.getByRole('button', { name: 'Search in folder' })).toHaveAttribute('aria-expanded', 'false');
  expect(await highlights()).toEqual({ all: 0, current: 0 }); // closing the search clears them
});

/** Opens a generated folder: README.md plus `count` ~2 KB documents spread over nested subfolders. */
async function openGeneratedFolder(page: Page, count: number): Promise<void> {
  await page.addInitScript((count: number) => {
    Object.assign(window, {
      showDirectoryPicker: async () => {
        const root = await navigator.storage.getDirectory();
        await root.removeEntry('big', { recursive: true }).catch(() => {});
        const dir = await root.getDirectoryHandle('big', { create: true });
        const write = async (rel: string, text: string) => {
          let d = dir;
          const parts = rel.split('/');
          for (const part of parts.slice(0, -1)) d = await d.getDirectoryHandle(part, { create: true });
          const w = await (await d.getFileHandle(parts[parts.length - 1], { create: true })).createWritable();
          await w.write(text);
          await w.close();
        };
        await write('README.md', '# Big folder\n');
        const para = 'ここは本文です。BLE の接続について説明します。 The quick brown fox jumps over the lazy dog. ';
        for (let i = 0; i < count; i++) {
          await write(`d${i % 10}/s${i % 5}/doc-${i}.md`, `# Doc ${i}\n\n${para.repeat(25)}\n\n再接続シーケンス ${i}\n`);
        }
        return dir;
      },
    });
  }, count);
  await page.goto('/');
  await page.getByRole('button', { name: 'Open folder' }).click();
  await expect(page.locator('.markdown-body h1')).toHaveText('Big folder');
}

// #137: a folder of 500 documents (~1 MB): the first search reads them all; the time is reported.
test('searches a folder of 500 files, reporting how long the first search takes', async ({ page }) => {
  await openGeneratedFolder(page, 500);
  await expect(page.locator('#files .file-tree-file')).toHaveCount(501);
  const panel = page.getByRole('search', { name: 'Search in folder' });
  const started = Date.now();
  await page.keyboard.press('ControlOrMeta+Shift+F');
  await panel.getByRole('searchbox').fill('シーケンス');
  await expect(panel.locator('.search-panel-status')).toHaveText('500 matches in 500 files', { timeout: 30_000 });
  const ms = Date.now() - started;
  const line = `[perf] web app: 500 files read and searched ${ms} ms after opening the panel`;
  console.log(line);
  test.info().annotations.push({ type: 'perf', description: line });
  expect(ms).toBeLessThan(15_000);
  // Every later keystroke searches in memory.
  const again = Date.now();
  await panel.getByRole('searchbox').fill('シーケンス 499');
  await expect(panel.locator('.search-panel-status')).toHaveText('2 matches in 1 files'); // "Doc 499" and "シーケンス 499"
  console.log(`[perf] web app: the next search took ${Date.now() - again} ms`);
  await expect(panel.locator('.search-file')).toHaveAttribute('aria-label', 'd9/s4/doc-499.md');
  await expectAccessible(page);
});

test('exports the document as one HTML file, and prints for PDF', async ({ page, context }) => {
  await openSampleFolder(page);
  await expect(page.locator('img[alt="diagram"]')).toHaveAttribute('src', /^blob:/);
  await expect(page.locator('.diagram-mermaid svg')).toHaveCount(2);
  await page.locator('.font-settings-toggle').click();
  const panel = page.locator('.font-settings-panel');
  await panel.getByRole('radiogroup', { name: 'Text size' }).getByRole('radio', { name: 'Large', exact: true }).check();
  await panel.getByRole('textbox', { name: 'Custom CSS' }).fill('h1 { color: rgb(200, 0, 0); }');
  await expectAccessible(page);

  const [download] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Save as HTML' }).click()]);
  expect(download.suggestedFilename()).toBe('README.html');
  const html = await readFile((await download.path())!, 'utf8');
  expect(html).toMatch(/^<!doctype html>\n<html lang="en" data-theme="light">/);
  expect(html).toContain('<title>MD Browser サンプル</title>');
  // The custom CSS comes along, scoped as on the page; unchecking the box leaves it out.
  expect(html).toContain('@scope (.content) {\nh1 { color: rgb(200, 0, 0); }\n}');
  await panel.getByRole('checkbox', { name: 'Include in HTML export' }).uncheck();
  const [plain] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Save as HTML' }).click()]);
  expect(await readFile((await plain.path())!, 'utf8')).not.toContain('@scope');
  expect(html).toContain('<main class="content markdown-body"><details class="front-matter">');
  expect(html).toMatch(/<h1 id="[^"]+">MD Browser サンプル<\/h1>/);
  expect(html).toContain('--doc-font-size: 18px');
  // The viewer's controls and source-line attributes are left out; the diagrams and the images come along.
  for (const marker of ['class="copy-button"', 'class="heading-link"', 'class="media-size', 'class="diagram-actions"', 'data-line=', '<script', 'blob:']) {
    expect(html, marker).not.toContain(marker);
  }
  expect(html).toMatch(/<img src="data:image\/svg\+xml;base64,[^"]+"[^>]*alt="diagram"/);
  expect(html).toMatch(/<img src="data:image\/gif;base64,[^"]+"[^>]*alt="animation"/);
  expect(html.match(/<svg/g)?.length ?? 0).toBeGreaterThanOrEqual(2);

  // The file stands on its own: no scripts, styles inline, images embedded.
  const saved = await context.newPage();
  await saved.setContent(html);
  await expect(saved.locator('h1')).toHaveText('MD Browser サンプル');
  await expect(saved.locator('img[alt="diagram"]')).toHaveJSProperty('naturalWidth', 240);
  expect(await saved.locator('main').evaluate((el) => getComputedStyle(el).fontSize)).toBe('18px');
  await expect(saved.locator('button')).toHaveCount(0);
  await saved.close();

  await page.evaluate(() => {
    (window as unknown as { __printed: number }).__printed = 0;
    window.print = () => void ((window as unknown as { __printed: number }).__printed += 1);
  });
  await panel.getByRole('button', { name: 'Save as PDF' }).click();
  expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);
});

test('zooms and pans a diagram in the overlay with the wheel, a drag, a double-click and the keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 500 }); // the flowchart (686 wide) is fitted below 100%
  await openSampleFolder(page);
  await page.locator('.diagram-mermaid').first().click();
  const zoom = page.getByRole('dialog', { name: /Diagram at full size/ });
  const svg = zoom.locator('svg');
  const level = zoom.getByRole('status');
  await expect(svg).toBeVisible();
  const levelNow = async () => Number((await level.textContent())!.replace('%', ''));
  const fitLevel = await levelNow();
  expect(fitLevel).toBeGreaterThan(0);
  expect(fitLevel).toBeLessThan(100);
  const transform = () => svg.evaluate((el) => (el as SVGElement).style.transform);
  const box = (await svg.boundingBox())!;
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  // Ctrl + wheel zooms around the pointer: a point left of the center moves the content right.
  await svg.dispatchEvent('wheel', { deltaY: -100, ctrlKey: true, clientX: center.x - 200, clientY: center.y, bubbles: true, cancelable: true });
  expect(await levelNow()).toBeGreaterThan(fitLevel);
  expect(await transform()).toMatch(/translate\((\d|[1-9]\d*)(\.\d+)?px, 0px\) scale\(1\.2/);
  await expect(zoom).toBeVisible();

  // A plain wheel pans; a drag pans too and does not close the overlay.
  await svg.dispatchEvent('wheel', { deltaX: 30, deltaY: 50, bubbles: true, cancelable: true });
  const afterWheel = await transform();
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 60, center.y + 20, { steps: 4 });
  await page.mouse.up();
  await expect(zoom).toBeVisible();
  expect(await transform()).not.toBe(afterWheel);

  // Double-click: 100% (one viewBox unit per screen pixel), then back to fit. Screen coordinates:
  // the zoomed svg is taller than the window, which Playwright's element actions cannot scroll into view.
  await page.mouse.dblclick(center.x, center.y);
  await expect(level).toHaveText('100%');
  await page.mouse.dblclick(center.x, center.y);
  await expect(level).toHaveText(`${fitLevel}%`);
  expect(await transform()).toBe('translate(0px, 0px) scale(1)');

  // Keyboard: + and − zoom, arrows pan, 0 resets.
  await page.keyboard.press('+');
  expect(Math.abs((await levelNow()) - fitLevel * 1.25)).toBeLessThanOrEqual(1);
  await page.keyboard.press('ArrowRight');
  expect(await transform()).toBe('translate(-40px, 0px) scale(1.25)');
  await page.keyboard.press('-');
  await page.keyboard.press('0');
  await expect(level).toHaveText(`${fitLevel}%`);
  await expectAccessible(page);

  // A click without movement still closes it (after the double-click delay).
  await page.mouse.click(5, 5);
  await expect(zoom).toHaveCount(0);
});

test('zooms a document image in the overlay', async ({ page }) => {
  await openSampleFolder(page);
  await page.getByRole('button', { name: 'diagram (Enter to open at full size)' }).click();
  const zoom = page.getByRole('dialog', { name: 'diagram' });
  const level = zoom.getByRole('status');
  await expect(level).toHaveText('100%'); // 240px wide: natural size fits the window
  await page.keyboard.press('+');
  await expect(level).toHaveText('125%');
  await expect(zoom.locator('img')).toHaveJSProperty('naturalWidth', 240);
  await zoom.locator('img').dblclick(); // fit and 100% coincide here: back to fit
  await expect(level).toHaveText('100%');
  await page.keyboard.press('Escape');
  await expect(zoom).toHaveCount(0);
});

test('folds TOC sections and remembers them per document', async ({ page }) => {
  await openSampleFolder(page);
  const toc = page.locator('.toc');
  await expect(toc.locator('a')).toHaveCount(11);
  await expect(toc.locator('.toc-fold')).toHaveCount(3); // the h1, 画像 (h2 with an h3) and 深い見出し (h3 with an h4)
  const images = toc.locator('a[data-target]', { hasText: /^画像$/ }).locator('..');
  await images.locator(':scope > .toc-fold').click();
  await expect(images.locator(':scope > .toc-fold')).toHaveAttribute('aria-expanded', 'false');
  await expect(toc.locator('a:visible')).toHaveCount(9);
  await expect(toc.locator('a', { hasText: '深い見出し' }).first()).toBeHidden();
  // Inside the folded section, the section itself is the current entry; it is not unfolded.
  await page.locator('#content h4').evaluate((el) => el.scrollIntoView());
  await expect(toc.locator('a.active')).toHaveText('画像');
  await expect(toc.locator('a:visible')).toHaveCount(9);
  await expectAccessible(page);

  await openFromSidebar(page, 'docs/other.md');
  await expect(page.locator('.markdown-body h1')).toHaveText('別ファイル');
  await openFromSidebar(page, 'README.md');
  await expect(page.locator('.markdown-body h1')).toHaveText('MD Browser サンプル');
  await expect(toc.locator('a:visible')).toHaveCount(9);

  await images.locator(':scope > a').focus();
  await page.keyboard.press('ArrowRight');
  await expect(toc.locator('a:visible')).toHaveCount(11);
  await page.keyboard.press('ArrowRight');
  await expect(toc.locator('a', { hasText: '深い見出し' }).first()).toBeFocused();
});
