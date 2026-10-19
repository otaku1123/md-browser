"""Generates Chrome Web Store assets and smoke-tests the extension.

Usage: python scripts/store-assets.py <profile-tmp-dir>
Requires Playwright for Python with Chromium installed, and `npm run build:ext` done first.
Outputs to docs/store/assets/.
"""
import json
import pathlib
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
EXT = ROOT / 'dist-extension'
OUT = ROOT / 'docs' / 'store' / 'assets'
TMP = pathlib.Path(sys.argv[1])
SIZE = {'width': 1280, 'height': 800}

ICON_SVG = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="{s}" height="{s}">
<rect x="4" y="4" width="120" height="120" rx="24" fill="#0969da"/>
<text x="64" y="72" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="54" fill="#fff" text-anchor="middle">M</text>
<path d="M44 86 L64 106 L84 86 Z" fill="#fff"/></svg>'''

TAGLINE = {
    'en': ('MD Browser', 'Markdown viewer<br>with TOC, Mermaid<br>&amp; live reload'),
    'ja': ('MD Browser', '目次・Mermaid 図・自動更新<br>Markdown ビューアー'),
}

# Extra files around release-plan.md so the viewer's file tree has something to show.
FOLDER_STUBS = {
    'en': {
        'CHANGELOG.md': '# Changelog',
        'docs/architecture.md': '# Architecture',
        'docs/deployment.md': '# Deployment',
        'docs/api/endpoints.md': '# API endpoints',
        'notes/kickoff.md': '# Kickoff notes',
        'notes/retrospective.md': '# Retrospective',
    },
    'ja': {
        'CHANGELOG.md': '# 変更履歴',
        'docs/architecture.md': '# システム構成',
        'docs/deployment.md': '# デプロイ手順',
        'docs/api/endpoints.md': '# API 一覧',
        'notes/kickoff.md': '# キックオフ議事録',
        'notes/retrospective.md': '# ふりかえり',
    },
}

failures = []


def check(cond, label):
    print(('  ok  ' if cond else '  FAIL') + ' ' + label)
    if not cond:
        failures.append(label)


def run_locale(p, loc):
    out = OUT / loc
    out.mkdir(parents=True, exist_ok=True)
    ctx = p.chromium.launch_persistent_context(
        str(TMP / f'profile-{loc}'), channel='chromium', headless=True,
        locale='ja-JP' if loc == 'ja' else 'en-US', viewport=SIZE,
        args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}'])
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event('serviceworker', timeout=10000)
    ext_id = sw.url.split('/')[2]
    time.sleep(1.5)

    print(f'[{loc}] onboarding')
    # Playwright doesn't attach to the tab opened by onInstalled, so ask the extension itself.
    opened = sw.evaluate("chrome.runtime.getContexts({contextTypes: ['TAB']}).then(cs => cs.map(c => c.documentUrl))")
    check(f'chrome-extension://{ext_id}/index.html' in opened, 'viewer opens automatically on install')
    viewer = ctx.new_page()
    viewer.goto(f'chrome-extension://{ext_id}/index.html')
    viewer.set_viewport_size(SIZE)
    viewer.wait_for_selector('.setup-banner')
    check(viewer.evaluate("document.querySelector('.setup-banner').classList.contains('ok')"),
          'banner shows "enabled" when file access is allowed')
    # Simulate a store install (file access off) and re-check.
    viewer.evaluate('''() => {
      chrome.extension.isAllowedFileSchemeAccess = async () => false;
      document.dispatchEvent(new Event('visibilitychange'));
    }''')
    viewer.wait_for_selector('.setup-banner:not(.ok) button')
    check(viewer.evaluate('document.documentElement.lang') == loc, f'viewer UI language is {loc}')
    viewer.screenshot(path=str(out / '3-setup.png'))
    # Playwright attaches to chrome:// tabs unreliably, so record what the button asks Chrome to open.
    viewer.evaluate('''() => {
      window.__opened = [];
      const create = chrome.tabs.create.bind(chrome.tabs);
      chrome.tabs.create = (opts) => { window.__opened.push(opts.url); return create(opts); };
    }''')
    viewer.click('.setup-banner button')
    opened_urls = viewer.evaluate('window.__opened')
    check(opened_urls == [f'chrome://extensions/?id={ext_id}'], f'settings button opens chrome://extensions {opened_urls}')

    print(f'[{loc}] file:// rendering')
    doc = (ROOT / 'docs' / 'store' / 'demo' / loc / 'release-plan.md').as_uri()
    page = ctx.new_page()
    page.goto(doc)
    page.wait_for_selector('.diagram-mermaid svg', timeout=10000)
    time.sleep(1)
    state = page.evaluate('''() => ({
      svgs: document.querySelectorAll('.diagram-mermaid svg').length,
      toc: document.querySelectorAll('.toc a').length,
      status: document.querySelector('.status').textContent,
      lang: document.documentElement.lang,
    })''')
    check(state['svgs'] == 2 and state['toc'] >= 8, f'renders diagrams and TOC {state}')
    check(state['status'] == ('自動更新 ON' if loc == 'ja' else 'Auto-reload ON'), 'status text localized')
    page.screenshot(path=str(out / '1-document.png'))

    dark = ctx.new_page()
    dark.emulate_media(color_scheme='dark')
    dark.goto(doc)
    dark.wait_for_selector('.diagram-mermaid svg', timeout=10000)
    dark.evaluate("document.querySelectorAll('h2')[1].scrollIntoView()")
    time.sleep(1)
    dark.screenshot(path=str(out / '2-dark.png'))

    print(f'[{loc}] viewer with a folder')
    # The folder picker can't be driven headlessly, so stand it in with an OPFS folder (as the e2e tests do).
    files = {'release-plan.md': (ROOT / 'docs' / 'store' / 'demo' / loc / 'release-plan.md').read_text(encoding='utf-8'),
             **FOLDER_STUBS[loc]}
    folder = ctx.new_page()
    folder.goto(f'chrome-extension://{ext_id}/index.html')
    folder.evaluate('''(files) => {
      window.showDirectoryPicker = async () => {
        const root = await navigator.storage.getDirectory();
        await root.removeEntry('release-v2', { recursive: true }).catch(() => {});
        const top = await root.getDirectoryHandle('release-v2', { create: true });
        for (const [rel, text] of Object.entries(files)) {
          const parts = rel.split('/');
          let dir = top;
          for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create: true });
          const w = await (await dir.getFileHandle(parts.at(-1), { create: true })).createWritable();
          await w.write(text);
          await w.close();
        }
        return top;
      };
    }''', files)
    folder.click('#open-dir')
    folder.wait_for_selector('#files .file-tree-file')
    folder.click('#files button[data-path="release-plan.md"]')
    folder.wait_for_selector('#files [aria-current="page"][data-path="release-plan.md"]')
    folder.wait_for_selector('.diagram-mermaid svg', timeout=10000)
    time.sleep(1)
    tree = folder.evaluate('''() => ({
      files: document.querySelectorAll('#files .file-tree-file').length,
      folders: [...document.querySelectorAll('#files summary')].map((s) => s.textContent),
      visible: !document.getElementById('files').hidden,
    })''')
    check(tree == {'files': len(files), 'folders': ['docs', 'api', 'notes'], 'visible': True},
          f'file tree lists the folder {tree}')
    folder.screenshot(path=str(out / '4-folder.png'))

    print(f'[{loc}] promo tile')
    tile = ctx.new_page()
    tile.set_viewport_size({'width': 440, 'height': 280})
    name, sub = TAGLINE[loc]
    tile.set_content(f'''<html><body style="margin:0;width:440px;height:280px;display:flex;align-items:center;gap:24px;
      padding:0 32px;box-sizing:border-box;background:linear-gradient(135deg,#0d1117,#1f3a5f);color:#fff;
      font-family:-apple-system,'Hiragino Sans','Noto Sans JP',sans-serif">
      {ICON_SVG.format(s=112)}
      <div><div style="font-size:34px;font-weight:700">{name}</div>
      <div style="font-size:17px;line-height:1.5;margin-top:8px;color:#c9d1d9;white-space:nowrap">{sub}</div></div></body></html>''')
    tile.screenshot(path=str(out / 'promo-small-440x280.png'))
    ctx.close()


with sync_playwright() as p:
    for loc in ('en', 'ja'):
        run_locale(p, loc)
    # Store icon: 96x96 artwork centred in a transparent 128x128 canvas (Web Store guideline).
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 128, 'height': 128})
    pg.set_content(f'<html><body style="margin:0;padding:16px;background:transparent">{ICON_SVG.format(s=96)}</body></html>')
    pg.screenshot(path=str(OUT / 'store-icon-128.png'), omit_background=True)
    b.close()

print(json.dumps({'failures': failures}, ensure_ascii=False))
sys.exit(1 if failures else 0)
