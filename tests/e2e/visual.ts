import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

/** Markdown documents captured by the visual tests (English only: CI has no CJK fonts). */
export const VISUAL_DOCS = path.join(import.meta.dirname, 'visual');

/**
 * Font rendering differs between OSes, so baselines are made on CI (Linux) only and the tests
 * skip elsewhere. VISUAL_LOCAL=<dir> runs them on any OS against snapshots in <dir> instead
 * (see playwright.config.ts), to try them out without putting local PNGs in the repo.
 */
export function onlyOnBaselinePlatform(): void {
  test.skip(process.platform !== 'linux' && !process.env.VISUAL_LOCAL, 'Screenshot baselines are made on CI (Linux)');
}

/** Waits until diagrams, math, images and fonts are drawn, so a capture doesn't catch them halfway. */
export async function settle(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
        const diagrams = Array.from(document.querySelectorAll('.diagram-mermaid, .diagram-plantuml'));
        // The dark theme keeps a light copy for print next to the on-screen one.
        const drawn = diagrams.every((d) => d.querySelector(dark ? '.diagram-screen svg' : ':scope > svg'));
        const math = document.querySelectorAll('.math:not(.math-done)').length === 0;
        const images = Array.from(document.images).every((img) => img.complete);
        return drawn && math && images;
      }),
    )
    .toBe(true);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}
