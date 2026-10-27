import { expect, test, type Page } from '@playwright/test';
import { readFolderFiles } from './fixtures';
import { onlyOnBaselinePlatform, settle, VISUAL_DOCS } from './visual';

// Screenshot comparisons of the web app (baselines: tests/e2e/__screenshots__/, made on CI).
onlyOnBaselinePlatform();

const THEMES = ['light', 'dark'] as const;

/** Opens tests/e2e/visual/ as the folder (an OPFS stand-in for the picker, as in web.spec.ts). */
async function openVisualFolder(page: Page, colorScheme: 'light' | 'dark' = 'light'): Promise<void> {
  const files = await readFolderFiles(VISUAL_DOCS);
  await page.emulateMedia({ colorScheme });
  await page.addInitScript((files: Record<string, string>) => {
    window.showDirectoryPicker = async () => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry('visual', { recursive: true }).catch(() => {});
      for (const [rel, b64] of Object.entries(files)) {
        let dir = await root.getDirectoryHandle('visual', { create: true });
        const parts = rel.split('/');
        for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create: true });
        const w = await (await dir.getFileHandle(parts[parts.length - 1], { create: true })).createWritable();
        await w.write(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
        await w.close();
      }
      return root.getDirectoryHandle('visual');
    };
  }, files);
  await page.goto('/');
  await page.getByRole('button', { name: 'Open folder' }).click();
  await expect(page.locator('.markdown-body h1')).toHaveText('Visual test document');
  await settle(page);
}

async function openDiagrams(page: Page): Promise<void> {
  await page.locator('#files [data-path="diagrams.md"]').click();
  await expect(page.locator('.markdown-body h1')).toHaveText('Diagrams and math');
  await settle(page);
}

for (const theme of THEMES) {
  test(`renders a document (${theme})`, async ({ page }) => {
    await openVisualFolder(page, theme);
    await expect(page).toHaveScreenshot(`document-${theme}.png`);
    // The rest: alerts, the image and the footnotes.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page).toHaveScreenshot(`document-end-${theme}.png`);
  });

  test(`renders diagrams (${theme})`, async ({ page }) => {
    await openVisualFolder(page, theme);
    await openDiagrams(page);
    const mermaid = page.locator('.diagram-mermaid');
    await expect(mermaid.first()).toHaveScreenshot(`mermaid-flowchart-${theme}.png`);
    // Box and rect colours from the source, dimmed in the dark theme (#90).
    await expect(mermaid.nth(1)).toHaveScreenshot(`mermaid-sequence-${theme}.png`);
    await expect(page.locator('.diagram-plantuml')).toHaveScreenshot(`plantuml-${theme}.png`);
  });
}

test('typesets inline and display math', async ({ page }) => {
  await openVisualFolder(page);
  await openDiagrams(page);
  await expect(page.locator('p', { has: page.locator('.math-inline') })).toHaveScreenshot('math-inline.png');
  await expect(page.locator('.math-display')).toHaveScreenshot('math-display.png');
});

test('shows the settings panel', async ({ page }) => {
  await openVisualFolder(page);
  await page.locator('.font-settings-toggle').click();
  await expect(page.locator('.font-settings-panel')).toHaveScreenshot('settings-panel.png');
});

test('shows the file list and the TOC', async ({ page }) => {
  await openVisualFolder(page);
  await expect(page.locator('#files')).toHaveScreenshot('files-sidebar.png');
  await expect(page.locator('.toc')).toHaveScreenshot('toc-sidebar.png');
});

test('shows the Markdown source', async ({ page }) => {
  await openVisualFolder(page);
  await page.keyboard.press('ControlOrMeta+Shift+M');
  await expect(page.locator('.source-view')).toBeVisible();
  await expect(page).toHaveScreenshot('source-view.png');
});

test('shows the size buttons of an image on hover', async ({ page }) => {
  await openVisualFolder(page);
  const frame = page.locator('.media-frame', { has: page.locator('img[alt="shape"]') });
  await frame.hover();
  await expect(frame.locator('.media-size')).toHaveCSS('opacity', '1');
  await expect(frame).toHaveScreenshot('image-size-buttons.png');
});
