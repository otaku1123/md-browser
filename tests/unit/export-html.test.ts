import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildStandaloneHtml, cleanedCopy, exportFilename, stripFontFaces } from '../../src/core/export-html';

vi.mock('../../src/style.css?inline', () => ({ default: 'body { color: red; } @font-face { font-family: X; src: url(x.woff2); }' }));

function rendered(): HTMLElement {
  const root = document.createElement('main');
  root.id = 'content';
  root.tabIndex = -1;
  root.innerHTML = [
    '<h1 data-line="1">Title<a class="heading-link" href="#title">🔗</a></h1>',
    '<p data-line="3" tabindex="0">Text with <code>code</code>.</p>',
    '<div class="code-block"><pre data-line="5"><code>x</code></pre><button class="copy-button">Copy</button></div>',
    '<div class="media-frame media-ready"><img src="blob:http://x/1" alt="pic" style="--media-w: 200px"><span class="media-size"><button>−</button></span></div>',
    '<div class="mermaid"><div class="diagram-screen"><svg></svg></div><div class="diagram-actions"><button>Save SVG</button></div></div>',
    '<img src="file:///tmp/local.png" alt="local">',
    '<img src="data:image/png;base64,AAAA" alt="inline">',
    '<img src="img/rel.png" alt="relative">',
  ].join('');
  return root;
}

function fakeFetch(ok = true): typeof fetch {
  return vi.fn(async () =>
    ok
      ? new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { 'Content-Type': 'image/png' } })
      : new Response('', { status: 404 }),
  ) as unknown as typeof fetch;
}

// jsdom has no matchMedia (theme.ts asks it for the OS theme when none is pinned).
beforeEach(() => vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} })));

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.style.cssText = '';
  delete document.documentElement.dataset.theme;
});

describe('cleanedCopy', () => {
  it('drops the viewer controls and source-line attributes, keeping the content', async () => {
    const copy = await cleanedCopy(rendered(), fakeFetch());
    expect(copy.querySelector('.copy-button, .heading-link, .media-size, .diagram-actions')).toBeNull();
    expect(copy.querySelector('[data-line], [tabindex]')).toBeNull();
    expect(copy.id).toBe('');
    expect(copy.querySelector('h1')?.textContent).toBe('Title');
    expect(copy.querySelector('pre code')?.textContent).toBe('x');
    expect(copy.querySelector('.diagram-screen svg')).not.toBeNull();
    expect(copy.querySelector<HTMLElement>('img[alt="pic"]')?.style.getPropertyValue('--media-w')).toBe('200px');
  });

  it('embeds fetchable images as data URLs and leaves file:// and data: sources alone', async () => {
    const fetchImpl = fakeFetch();
    const copy = await cleanedCopy(rendered(), fetchImpl);
    expect(copy.querySelector('img[alt="pic"]')?.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    expect(copy.querySelector('img[alt="local"]')?.getAttribute('src')).toBe('file:///tmp/local.png');
    expect(copy.querySelector('img[alt="inline"]')?.getAttribute('src')).toBe('data:image/png;base64,AAAA');
    expect(fetchImpl).toHaveBeenCalledTimes(2); // the blob: and the relative one; never file: or data:
    expect(fetchImpl).toHaveBeenCalledWith('blob:http://x/1');
  });

  it('keeps the URL, made absolute, when the image cannot be fetched', async () => {
    const copy = await cleanedCopy(rendered(), fakeFetch(false));
    expect(copy.querySelector('img[alt="pic"]')?.getAttribute('src')).toBe('blob:http://x/1');
    // jsdom's document lives at http://localhost:3000/
    expect(copy.querySelector('img[alt="relative"]')?.getAttribute('src')).toBe('http://localhost:3000/img/rel.png');
  });

  it('does not touch the live document', async () => {
    const root = rendered();
    await cleanedCopy(root, fakeFetch());
    expect(root.querySelector('.copy-button')).not.toBeNull();
    expect(root.querySelector('img[alt="pic"]')?.getAttribute('src')).toBe('blob:http://x/1');
  });
});

describe('buildStandaloneHtml', () => {
  it('writes a complete page with the stylesheet, the theme and the font settings', async () => {
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.style.setProperty('--doc-font-size', '18px');
    document.documentElement.style.setProperty('--font-body', '"Meiryo", var(--font-body-default)');
    const html = await buildStandaloneHtml(rendered(), { title: 'A <b>title</b>', fetchImpl: fakeFetch() });
    expect(html.startsWith('<!doctype html>\n<html lang="en" data-theme="dark">')).toBe(true);
    expect(html).toContain('<meta charset="UTF-8" />');
    expect(html).toContain('<title>A &lt;b&gt;title&lt;/b&gt;</title>');
    expect(html).toContain('<style>body { color: red; } </style>');
    expect(html).not.toContain('@font-face');
    expect(html).toContain(':root { --font-body: "Meiryo", var(--font-body-default); --doc-font-size: 18px; }');
    expect(html).toContain('<main class="content markdown-body"><h1>Title</h1>');
    expect(html).not.toContain('<script');
  });

  it('follows the light theme and skips the variables block when nothing is set', async () => {
    const html = await buildStandaloneHtml(rendered(), { title: 't', fetchImpl: fakeFetch() });
    expect(html).toContain('data-theme="light"');
    expect(html).not.toContain(':root {');
  });

  it('appends extra CSS (math) without its font faces', async () => {
    const extraCss = '.katex { x: y } @font-face { font-family: KaTeX_Main; src: url(fonts/a.woff2); }';
    const html = await buildStandaloneHtml(rendered(), { title: 't', extraCss, fetchImpl: fakeFetch() });
    expect(html).toContain('.katex { x: y }');
    expect(html).not.toContain('KaTeX_Main');
  });
});

describe('helpers', () => {
  it('names the file after the document', () => {
    expect(exportFilename('README.md')).toBe('README.html');
    expect(exportFilename('notes.markdown')).toBe('notes.html');
    expect(exportFilename('仕様.MD')).toBe('仕様.html');
    expect(exportFilename('.md')).toBe('document.html');
  });

  it('strips every @font-face block', () => {
    expect(stripFontFaces('a{} @font-face{font-family:X;src:url(a)} b{} @font-face { c: d }')).toBe('a{}  b{} ');
  });
});
