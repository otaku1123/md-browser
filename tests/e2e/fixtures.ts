import { test as base, chromium, type BrowserContext } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '../..');
const EXT = path.join(ROOT, 'dist-extension');
const SAMPLE = path.join(ROOT, 'sample');

export const XSS_MD = [
  '# XSS',
  '<img src="x" onerror="window.__xss = 1">',
  '<svg onload="window.__xss = 2"></svg>',
  '[link](javascript:window.__xss=3)',
  '<script>window.__xss = 4</script>',
].join('\n\n');

/** Copies sample/ into a fresh temp folder (plus an XSS probe) so tests can edit files freely. */
async function makeWorkdir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mdb-docs-'));
  await fs.cp(SAMPLE, dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'xss.md'), XSS_MD);
  return dir;
}

/** Reads sample/ as { relativePath: base64 } for loading into the web app's OPFS stand-in. */
export async function readSampleFiles(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const entry of await fs.readdir(SAMPLE, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const abs = path.join(entry.parentPath, entry.name);
    out[path.relative(SAMPLE, abs).split(path.sep).join('/')] = (await fs.readFile(abs)).toString('base64');
  }
  out['xss.md'] = Buffer.from(XSS_MD).toString('base64');
  return out;
}

type ExtensionFixtures = { context: BrowserContext; extensionId: string; workdir: string };

/** Chromium with the built extension loaded (file URL access is granted for --load-extension). */
export const extensionTest = base.extend<ExtensionFixtures>({
  context: async ({}, use) => {
    const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'mdb-profile-'));
    const context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      locale: 'ja-JP',
      args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    });
    await use(context);
    await context.close();
    await fs.rm(profile, { recursive: true, force: true });
  },
  extensionId: async ({ context }, use) => {
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(new URL(sw.url()).host);
  },
  workdir: async ({}, use) => {
    const dir = await makeWorkdir();
    await use(dir);
    await fs.rm(dir, { recursive: true, force: true });
  },
});
