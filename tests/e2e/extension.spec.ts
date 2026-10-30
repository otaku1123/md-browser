import { expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expectAccessible } from './a11y';
import { extensionTest as test } from './fixtures';

const fileUrl = (dir: string, rel: string) => pathToFileURL(path.join(dir, rel)).href;

test('renders a local .md file in place', async ({ context, workdir }) => {
  const page = await context.newPage();
  await page.goto(fileUrl(workdir, 'README.md'));
  await expect(page.locator('.markdown-body h1')).toHaveText('MD Browser サンプル');
  await expect(page.locator('.toc a')).toHaveCount(11);
  await expect(page.locator('.diagram-mermaid svg')).toHaveCount(2);
  await expect(page.locator('.diagram-plantuml svg')).toHaveCount(2);
  await expect(page.locator('.markdown-alert')).toHaveCount(5);
  await expect(page.locator('details.front-matter')).not.toHaveAttribute('open');
  await expect(page.locator('details.front-matter code')).toContainText('tags: [markdown, viewer]');
  await expect(page.locator('.markdown-alert-warning .markdown-alert-title')).toHaveText('警告');
  await expect(page.locator('.status')).toHaveText('自動更新 ON');
  // Relative images resolve natively against the file URL.
  await expect(page.locator('img[alt="diagram"]')).toHaveJSProperty('naturalWidth', 240);
});

test('typesets math with KaTeX and its fonts on a file:// page', async ({ context, workdir }) => {
  const page = await context.newPage();
  const problems: string[] = [];
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('requestfailed', (r) => problems.push(`${r.url()} ${r.failure()?.errorText}`));
  await page.goto(fileUrl(workdir, 'README.md'));
  await expect(page.locator('.math-inline .katex')).toHaveCount(1);
  await expect(page.locator('.math-display .katex-display')).toHaveCount(1);
  // The lazily loaded stylesheet applies and its woff2 files actually load.
  await expect(page.locator('.math-display .katex')).toHaveCSS('font-size', /^(?!16px$)/);
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return Array.from(document.fonts).filter((f) => f.family.startsWith('KaTeX') && f.status === 'loaded').length;
  });
  expect(loaded).toBeGreaterThan(0);
  // The sample deliberately links one missing image.
  expect(problems.filter((p) => !p.includes('not-found.png') && !/ERR_FILE_NOT_FOUND/.test(p))).toEqual([]);
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

test('shares the theme between file tabs', async ({ context, workdir }) => {
  const a = await context.newPage();
  await a.goto(fileUrl(workdir, 'README.md'));
  await a.locator('.font-settings-toggle').click();
  await a.getByRole('radio', { name: 'ダーク' }).check();
  await expect(a.locator('html')).toHaveAttribute('data-theme', 'dark');

  const b = await context.newPage();
  await b.goto(fileUrl(workdir, 'docs/other.md'));
  await expect(b.locator('html')).toHaveAttribute('data-theme', 'dark');
  await a.locator('.font-settings-panel').getByRole('radio', { name: 'OS 設定' }).check();
  await expect(b.locator('html')).not.toHaveAttribute('data-theme', /.*/);
});

test('remembers the size of one image and one diagram per file across reloads', async ({ context, extensionId, workdir }) => {
  expect(extensionId).toBeTruthy(); // the service worker is up
  const page = await context.newPage();
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(fileUrl(workdir, 'README.md'));
  const img = page.locator('img[alt="diagram"]'); // 240px wide
  const chart = page.locator('.diagram-plantuml').first();
  const frame = (item: typeof img) => item.locator('xpath=ancestor::*[contains(concat(" ", @class, " "), " media-frame ")][1]');
  const width = (item: typeof img) => item.evaluate((el) => Math.round(el.getBoundingClientRect().width));
  await expect.poll(() => width(img)).toBe(240);
  await expect(chart.locator('svg')).toBeVisible();
  const natural = await width(chart.locator('svg'));

  await img.hover();
  await frame(img).getByRole('button', { name: '小さくする' }).click();
  expect(await width(img)).toBe(180);
  await chart.hover();
  await frame(chart).getByRole('button', { name: '大きくする' }).click();
  await expect(frame(chart).getByRole('button', { name: 'サイズを戻す（現在 125%）' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expectAccessible(page);

  await page.reload();
  await expect.poll(() => width(img)).toBe(180);
  await expect.poll(async () => Math.abs((await width(chart.locator('svg'))) - natural * 1.25)).toBeLessThanOrEqual(1);
  // Saved locally (not synced), under the file's URL.
  const saved = await context.serviceWorkers()[0].evaluate(() => chrome.storage.local.get('md-browser:media-sizes'));
  expect(Object.keys(saved['md-browser:media-sizes'])).toEqual([fileUrl(workdir, 'README.md')]);

  // Another file (same image) keeps its own size.
  const other = await context.newPage();
  await other.goto(fileUrl(workdir, 'docs/other.md'));
  await expect.poll(() => width(other.locator('img'))).toBe(240);

  await frame(img).getByRole('button', { name: 'サイズを戻す（現在 75%）' }).click();
  expect(await width(img)).toBe(240);
});

test('adds copy buttons to code blocks', async ({ context, workdir }) => {
  const page = await context.newPage();
  await page.goto(fileUrl(workdir, 'README.md'));
  await expect(page.locator('.code-block .copy-button')).toHaveCount(1); // ts; diagrams have none
  const button = page.locator('.code-block .copy-button').first();
  await page.locator('.code-block').first().hover();
  await button.click();
  await expect(button).toHaveText('コピーしました');
});

test('marks the tab with the file name first and its own icon', async ({ context, workdir }) => {
  const page = await context.newPage();
  await page.goto(fileUrl(workdir, 'README.md'));
  await expect(page).toHaveTitle('README.md - MD Browser サンプル');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', /^data:image\/svg\+xml,/);
});

test('reports a missing file only after repeated failures, and recovers when it is back', async ({
  context,
  workdir,
}) => {
  const page = await context.newPage();
  const file = path.join(workdir, 'README.md');
  await page.goto(fileUrl(workdir, 'README.md'));
  await expect(page.locator('.status')).toHaveText('自動更新 ON');
  const saved = await fs.readFile(file);
  await fs.rm(file);
  await expect(page.locator('.status')).toHaveClass(/error/);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', /e5484d/);
  await fs.writeFile(file, saved);
  await expect(page.locator('.status')).toHaveText('自動更新 ON');
  await expect(page.locator('link[rel="icon"]')).not.toHaveAttribute('href', /e5484d/);
});

test('toggles and resizes the TOC on a file tab, shared with other tabs', async ({ context, workdir }) => {
  const page = await context.newPage();
  await page.goto(fileUrl(workdir, 'README.md'));
  const toggle = page.getByRole('button', { name: '目次' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('separator', { name: '目次の幅を調整' }).focus();
  await page.keyboard.press('End');
  await expect(page.locator('.toc')).toHaveJSProperty('offsetWidth', 480);
  await toggle.click();
  await expect(page.locator('.toc')).toBeHidden();

  // A second tab picks the saved choice up from chrome.storage.sync.
  const other = await context.newPage();
  await other.goto(fileUrl(workdir, 'README.md'));
  await expect(other.getByRole('button', { name: '目次' })).toHaveAttribute('aria-expanded', 'false');
  await expect(other.locator('.toc')).toBeHidden();
});

test('saves a Mermaid diagram as SVG and PNG from the file page (no downloads permission)', async ({ context, workdir }) => {
  const page = await context.newPage();
  await page.goto(fileUrl(workdir, 'README.md'));
  await page.locator('.diagram-mermaid').first().click();
  const zoom = page.getByRole('dialog');
  const [svg] = await Promise.all([page.waitForEvent('download'), zoom.getByRole('button', { name: 'SVG で保存' }).click()]);
  expect(svg.suggestedFilename()).toBe('diagram-1.svg');
  const [png] = await Promise.all([page.waitForEvent('download'), zoom.getByRole('button', { name: 'PNG で保存' }).click()]);
  expect(png.suggestedFilename()).toBe('diagram-1.png');
  await expect(zoom.locator('.diagram-save-error')).toBeEmpty();
});

/** Writes { relativePath: text } into a fresh temp folder. */
async function makeFolder(files: Record<string, string>): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mdb-tree-'));
  for (const [rel, text] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await fs.writeFile(path.join(dir, rel), text);
  }
  return dir;
}

test('lists Markdown files of the folder and its subfolders in a sidebar', async ({ context }) => {
  const dir = await makeFolder({
    'README.md': '# Top',
    'notes.md': '# Notes',
    'image.txt': 'not markdown',
    'sub dir/deep #1.md': '# Deep',
    'node_modules/pkg/README.md': '# skip',
    '.git/info.md': '# skip',
  });
  try {
    const page = await context.newPage();
    await page.goto(fileUrl(dir, 'README.md'));
    const sidebar = page.locator('.files');
    await expect(sidebar).toBeVisible();
    await expect(sidebar.locator('.file-tree-file')).toHaveText(['deep #1.md', 'notes.md', 'README.md']);
    await expect(sidebar.locator('summary')).toHaveText(['sub dir']);
    await expect(sidebar.locator('[aria-current="page"]')).toHaveAttribute('data-path', 'README.md');

    // Folders start collapsed (#122); the one holding the open document is expanded.
    const subDir = sidebar.locator('details[data-dir="sub dir"]');
    await expect(subDir).toHaveJSProperty('open', false);
    await subDir.locator('summary').click();
    await sidebar.getByRole('button', { name: 'deep #1.md' }).click();
    await expect(page).toHaveURL(/\/sub%20dir\/deep%20%231\.md$/);
    await expect(page.locator('.markdown-body h1')).toHaveText('Deep');
    // The tab keeps its root: same list, with the subfolder file active.
    await expect(sidebar.locator('.file-tree-file')).toHaveText(['deep #1.md', 'notes.md', 'README.md']);
    await expect(sidebar.locator('[aria-current="page"]')).toHaveAttribute('data-path', 'sub dir/deep #1.md');
    await expect(subDir).toHaveJSProperty('open', true);
    // Links resolve against the root, not the subfolder.
    await sidebar.getByRole('button', { name: 'notes.md' }).click();
    await expect(page).toHaveURL(/\/notes\.md$/);
    await expect(sidebar.locator('[aria-current="page"]')).toHaveAttribute('data-path', 'notes.md');

    // A file outside the root (here a sibling folder) starts a new root for the tab.
    const elsewhere = await makeFolder({ 'x.md': '# X', 'y.md': '# Y' });
    try {
      await page.goto(fileUrl(elsewhere, 'x.md'));
      await expect(sidebar.locator('.file-tree-file')).toHaveText(['x.md', 'y.md']);
      await expect(sidebar.locator('[aria-current="page"]')).toHaveAttribute('data-path', 'x.md');
    } finally {
      await fs.rm(elsewhere, { recursive: true, force: true });
    }

    // The toggle state is shared with other tabs through chrome.storage.sync.
    await page.goto(fileUrl(dir, 'notes.md'));
    await expect(page.locator('.files [aria-current="page"]')).toHaveAttribute('data-path', 'notes.md');
    await page.getByRole('button', { name: 'ファイル一覧' }).click();
    await expect(page.locator('.files')).toBeHidden();
    const other = await context.newPage();
    await other.goto(fileUrl(dir, 'README.md'));
    await expect(other.getByRole('button', { name: 'ファイル一覧' })).toHaveAttribute('aria-expanded', 'false');
    await expect(other.locator('.files')).toBeHidden();
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('switches files with the quick switcher and keeps the recent ones across file pages', async ({ context }) => {
  const dir = await makeFolder({ 'README.md': '# Top', 'notes.md': '# Notes', 'sub dir/deep #1.md': '# Deep' });
  try {
    const page = await context.newPage();
    await page.goto(fileUrl(dir, 'README.md'));
    await expect(page.locator('.files [aria-current="page"]')).toHaveAttribute('data-path', 'README.md');
    const switcher = page.getByRole('dialog', { name: 'ファイルへ移動' });
    await page.keyboard.press('ControlOrMeta+P');
    await expect(switcher.getByRole('combobox')).toBeFocused();
    await expectAccessible(page);
    await page.keyboard.type('deep');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/sub%20dir\/deep%20%231\.md$/);
    await expect(page.locator('.markdown-body h1')).toHaveText('Deep');

    // A new page was loaded: the previous document is still listed first.
    await expect(page.locator('.files [aria-current="page"]')).toHaveAttribute('data-path', 'sub dir/deep #1.md');
    await page.keyboard.press('ControlOrMeta+P');
    await expect(switcher.getByRole('option').first()).toHaveAttribute('data-path', 'README.md');
    await page.keyboard.press('Escape');
    await expect(switcher).toHaveCount(0);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('hides folders from the file sidebar per root folder, and shows them again', async ({ context }) => {
  const dir = await makeFolder({
    'README.md': '# Top',
    'notes.md': '# Notes',
    'src/b.md': '# B',
    'src/gen/a.md': '# A',
    'vendor/v.md': '# skip (default exclusion)',
  });
  try {
    const page = await context.newPage();
    await page.goto(fileUrl(dir, 'README.md'));
    const sidebar = page.locator('.files');
    await expect(sidebar.locator('.file-tree-file')).toHaveText(['a.md', 'b.md', 'notes.md', 'README.md']);

    await sidebar.locator('details[data-dir="src"] > summary').click(); // folders start collapsed; "src/gen" is inside
    await sidebar.getByRole('button', { name: '「src/gen」を一覧から隠す' }).click();
    await expect(sidebar.locator('.file-tree-file')).toHaveText(['b.md', 'notes.md', 'README.md']);
    await expect(sidebar.locator('.files-hidden summary')).toHaveText('非表示のフォルダ（1）');
    await expect(sidebar.locator('[aria-current="page"]')).toHaveAttribute('data-path', 'README.md');

    // Remembered for the root folder: another file of it lists the same.
    await page.goto(fileUrl(dir, 'notes.md'));
    await expect(sidebar.locator('[aria-current="page"]')).toHaveAttribute('data-path', 'notes.md');
    await expect(sidebar.locator('.file-tree-file')).toHaveText(['b.md', 'notes.md', 'README.md']);
    // Hiding the parent replaces the folder below it.
    await sidebar.getByRole('button', { name: '「src」を一覧から隠す' }).click();
    await expect(sidebar.locator('.file-tree-file')).toHaveText(['notes.md', 'README.md']);
    await sidebar.locator('.files-hidden summary').click();
    await expect(sidebar.locator('.files-hidden-name')).toHaveText(['src']);
    await expectAccessible(page);

    await sidebar.getByRole('button', { name: '「src」を一覧に表示' }).click();
    await expect(sidebar.locator('.file-tree-file')).toHaveText(['a.md', 'b.md', 'notes.md', 'README.md']);
    await expect(sidebar.locator('.files-hidden')).toHaveCount(0);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('keeps the file sidebar while folders are hidden, even with one file left', async ({ context }) => {
  const dir = await makeFolder({ 'only.md': '# Only', 'sub/x.md': '# X' });
  try {
    const page = await context.newPage();
    await page.goto(fileUrl(dir, 'only.md'));
    const sidebar = page.locator('.files');
    await sidebar.getByRole('button', { name: '「sub」を一覧から隠す' }).click();
    await expect(sidebar.locator('.file-tree-file')).toHaveText(['only.md']);
    await page.reload();
    await expect(sidebar.locator('.files-hidden summary')).toHaveText('非表示のフォルダ（1）');
    await sidebar.locator('.files-hidden summary').click();
    await sidebar.getByRole('button', { name: '「sub」を一覧に表示' }).click();
    await expect(sidebar.locator('.file-tree-file')).toHaveText(['x.md', 'only.md']);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('shows no file sidebar for a single Markdown file, until another one is added', async ({ context }) => {
  const dir = await makeFolder({ 'only.md': '# Only', 'other.txt': 'x' });
  try {
    const page = await context.newPage();
    await page.goto(fileUrl(dir, 'only.md'));
    await expect(page.locator('.status')).toHaveText('自動更新 ON');
    // The listing is requested after the first render; give it time to (not) show up.
    await page.waitForTimeout(500);
    await expect(page.locator('.files')).toBeHidden();
    await expect(page.getByRole('button', { name: 'ファイル一覧' })).toBeHidden();
    // #109: a file added later shows up when the user comes back to the tab.
    await fs.writeFile(path.join(dir, 'added.md'), '# Added');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.locator('.files .file-tree-file')).toHaveText(['added.md', 'only.md']);
    await expect(page.locator('.files [aria-current="page"]')).toHaveAttribute('data-path', 'only.md');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('switches a file tab to the Markdown source and follows saves', async ({ context, workdir }) => {
  const page = await context.newPage();
  await page.goto(fileUrl(workdir, 'README.md'));
  await expect(page.locator('.status')).toHaveText('自動更新 ON');
  const toggle = page.getByRole('button', { name: 'Markdown ソース' });
  const source = page.locator('.source-view');

  await page.keyboard.press('ControlOrMeta+Shift+M');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(source.locator('.source-line').first()).toHaveText('---\n');
  await expect(page.locator('.markdown-body')).toBeHidden();
  await expect(page.locator('.toc')).toBeHidden();
  await expect(page.getByRole('button', { name: '目次' })).toBeHidden();

  await page.evaluate(() => window.scrollTo(0, 300));
  await fs.appendFile(path.join(workdir, 'README.md'), '\n## 追加した見出し\n');
  await expect(source.locator('.source-line').last()).toHaveText('## 追加した見出し');
  expect(await page.evaluate(() => window.scrollY)).toBe(300);

  await toggle.click();
  await expect(source).toBeHidden();
  await expect(page.locator('.markdown-body h2', { hasText: '追加した見出し' })).toBeVisible();
  await expect(page.locator('.toc a', { hasText: '追加した見出し' })).toBeVisible();
});

test('does not run scripts shown in the Markdown source', async ({ context, workdir }) => {
  const page = await context.newPage();
  await page.goto(fileUrl(workdir, 'xss.md'));
  await page.getByRole('button', { name: 'Markdown ソース' }).click();
  await expect(page.locator('.source-view')).toContainText('<script>window.__xss = 4</script>');
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as { __xss?: number }).__xss)).toBeUndefined();
});

test('passes the axe accessibility checks on a file page and the viewer', async ({ context, workdir, extensionId }) => {
  const page = await context.newPage();
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(fileUrl(workdir, 'README.md'));
  await expect(page.locator('.diagram-mermaid svg')).toHaveCount(2);
  await expectAccessible(page);
  await page.goto(`chrome-extension://${extensionId}/index.html`);
  await expect(page.locator('.toolbar')).toBeVisible();
  await expectAccessible(page);
});
