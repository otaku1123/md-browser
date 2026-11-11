// Opens the built extension in a throwaway Chromium, so a change can be looked at by eye without
// loading dist-extension/ into Chrome by hand (#186). File URL access is granted to an extension
// loaded with --load-extension, so the document renders at once; the profile is deleted on exit.
//
//   npm run ext:try                        build, then open sample/README.md
//   npm run ext:try -- path/to/doc.md      open another document
//   npm run ext:try -- --watch             rebuild on source changes, then restart Chromium with the same tabs
//   npm run ext:try -- --no-build          use dist-extension/ as it is
//
// Playwright's Chromium, not Chrome: since Chrome 137 the branded Chrome ignores --load-extension.
// --watch runs `vite build --watch`, which does not type-check (the editor and `npm run typecheck` do).
// After a rebuild the browser is restarted rather than the extension reloaded: under Playwright,
// chrome.runtime.reload() leaves a --load-extension extension unloaded for good.
import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const EXT = resolve(root, 'dist-extension');
const DEFAULT_DOC = resolve(root, 'sample', 'README.md');

export function parseArgs(argv) {
  const opts = { watch: false, build: true, doc: DEFAULT_DOC };
  for (const arg of argv) {
    if (arg === '--watch') opts.watch = true;
    else if (arg === '--no-build') opts.build = false;
    else if (arg.startsWith('--')) throw new Error(`unknown option ${arg}`);
    else opts.doc = resolve(arg);
  }
  return opts;
}

/** `npm run build:ext` (type check + build); exits with its status when it fails. */
function buildOnce(log) {
  log('building the extension (npm run build:ext)…');
  const res = spawnSync('npm', ['run', 'build:ext'], { cwd: root, stdio: 'inherit' });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

/**
 * `vite build --watch` for the extension. Resolves after the first build; `onBuilt` runs after
 * every later one (vite prints "built in" each time, so no file watcher of our own is needed).
 */
function buildAndWatch(onBuilt, log) {
  log('building the extension and watching for changes (vite build --watch)…');
  const child = spawn('npx', ['vite', 'build', '--watch', '--config', 'vite.extension.config.ts'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let first;
  const ready = new Promise((res) => (first = res));
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    process.stdout.write(chunk);
    if (!chunk.includes('built in')) return;
    if (first) {
      first();
      first = null;
    } else onBuilt();
  });
  child.on('exit', (code) => {
    if (code !== null && code !== 0) {
      log(`vite exited with ${code}`);
      process.exit(code);
    }
  });
  return { child, ready };
}

/**
 * Launches Chromium with dist-extension/ loaded and the given URLs open (one tab each). Returns
 * the context and a `close` that also removes the profile. `headless` is for a scripted check.
 */
export async function openExtension({ urls, headless = false, log = console.log } = {}) {
  if (!existsSync(join(EXT, 'manifest.json'))) throw new Error(`${EXT} has no manifest.json: build the extension first`);
  const profile = await mkdtemp(join(os.tmpdir(), 'mdb-try-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless,
    viewport: null,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  // A fresh profile is an install, so the extension opens its setup guidance (the viewer) in a tab
  // of its own soon after starting: closed when it shows up in the first seconds. The same viewer
  // opened later from the toolbar icon stays.
  const closeSetupPage = async (page) => {
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    if (page.url().startsWith('chrome-extension://')) await page.close().catch(() => {});
  };
  const onPage = (page) => void closeSetupPage(page);
  context.on('page', onPage);
  setTimeout(() => context.off('page', onPage), 3000);
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  log(`extension ${new URL(sw.url()).host} loaded from ${EXT}`);
  for (const [i, url] of urls.entries()) {
    const page = (i === 0 && context.pages()[0]) || (await context.newPage());
    await page.goto(url).catch((err) => log(`could not open ${url}: ${err.message}`));
  }
  for (const page of context.pages()) void closeSetupPage(page);
  const close = async () => {
    await context.close().catch(() => {});
    await rm(profile, { recursive: true, force: true });
  };
  return { context, close };
}

/** The URLs of the open tabs, for reopening them after a restart (about:blank and the extension's own pages left out). */
export function openUrls(context) {
  return context.pages().map((p) => p.url()).filter((u) => u && u !== 'about:blank' && !u.startsWith('chrome-extension://'));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const log = (msg) => console.log(`[ext:try] ${msg}`);
  if (!existsSync(opts.doc)) throw new Error(`${opts.doc} does not exist`);
  let watcher = null;
  let session = null;
  let restarting = false;
  const quit = async (code) => {
    watcher?.child.kill();
    await session?.close();
    process.exit(code);
  };
  const open = async (urls) => {
    session = await openExtension({ urls, log });
    session.context.on('close', () => {
      if (!restarting) void quit(0);
    });
  };
  const restart = async () => {
    if (!session || restarting) return;
    restarting = true;
    const urls = openUrls(session.context);
    log('rebuilt: restarting Chromium with the same tabs');
    await session.close();
    await open(urls.length ? urls : [pathToFileURL(opts.doc).href]);
    restarting = false;
  };

  if (opts.watch) {
    watcher = buildAndWatch(() => void restart(), log);
    await watcher.ready;
  } else if (opts.build) buildOnce(log);

  await open([pathToFileURL(opts.doc).href]);
  log(`opened ${opts.doc}`);
  log(opts.watch ? 'edit the sources; close the window or press Ctrl+C to quit' : 'close the window or press Ctrl+C to quit');
  process.on('SIGINT', () => void quit(0));
  process.on('SIGTERM', () => void quit(0));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(`[ext:try] ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
