// GitHub compatibility: every tests/fixtures/gfm/<name>.md is rendered by renderMarkdown() and
// compared, after normalizing (gfm-normalize.ts), with <name>.github.html, GitHub's own
// rendering saved by scripts/gfm-fixtures.mjs. A failing fixture is a difference from GitHub;
// the ones listed in GAPS are known and expected to fail until they are fixed (the test then
// fails the other way round, so the entry has to be removed).
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../../src/core/render';
import { type Mode, normalizeGfm } from './gfm-normalize';

// Read at build time by Vite (no node:fs: the project has no Node type definitions).
const FILES = import.meta.glob('../fixtures/gfm/*.{md,html}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const file = (name: string) => FILES[`../fixtures/gfm/${name}`] ?? '';
// Written by scripts/gfm-fixtures.mjs: the SHA-256 of the Markdown the HTML was made from, and
// the API mode it asked for (see the script for why some fixtures use "gfm").
const HEADER = /^<!-- gfm-fixture sha256=([0-9a-f]{64}) mode=(markdown|gfm) -->\n/;

/** Known differences, by fixture: GitHub renders these and md-browser does not (yet). */
const GAPS: Record<string, string> = {
  'autolink-www': 'www.example.com is linked on GitHub, not by markdown-it linkify',
  'autolink-ftp': 'ftp://… is linked by markdown-it linkify, not on GitHub',
  'strikethrough-tildes': '~text~ (one tilde) is strikethrough on GitHub and ~~~text~~~ (three) is not; markdown-it does the opposite',
  'headings-unicode': 'GitHub drops non-ASCII punctuation (：！“—) from heading ids; ours keeps it',
};

/** Fixtures where the two outputs differ by design: GitHub shows the source of unsafe HTML as
 *  text, DOMPurify removes it. Only the absence of anything executable is compared. */
const SECURITY_ONLY = new Set(['html-unsafe']);

function dom(html: string): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

const names = Object.keys(FILES)
  .filter((f) => f.endsWith('.md'))
  .map((f) => f.slice('../fixtures/gfm/'.length, -3))
  .sort();

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

describe('GitHub rendering compatibility (tests/fixtures/gfm)', () => {
  for (const name of names) {
    const md = file(`${name}.md`);
    const saved = file(`${name}.github.html`);
    const header = HEADER.exec(saved);

    it(`${name}: the GitHub fixture is current (else run: npm run gfm:fetch)`, async () => {
      expect(header?.[1]).toBe(await sha256(md));
    });

    const github = saved.slice(header?.[0].length ?? 0);
    const mode = (header?.[2] ?? 'markdown') as Mode;
    const ours = renderMarkdown(md).html;

    if (SECURITY_ONLY.has(name)) {
      it(`${name}: neither output keeps anything executable`, () => {
        for (const html of [github, ours]) {
          const root = dom(html);
          expect(root.querySelector('script, iframe, object, embed')).toBeNull();
          expect(root.querySelector('[onerror], [onclick], [onload]')).toBeNull();
          for (const a of root.querySelectorAll('a[href]')) expect(a.getAttribute('href')).not.toMatch(/^\s*javascript:/i);
        }
      });
      continue;
    }

    const gap = GAPS[name];
    const run = gap ? it.fails : it;
    run(`${name}: renders like GitHub${gap ? ` (known gap: ${gap})` : ''}`, () => {
      expect(normalizeGfm(ours, 'ours', mode)).toBe(normalizeGfm(github, 'github', mode));
    });
  }
});

describe('normalizeGfm', () => {
  it('treats <s> and <del> alike and keeps only meaningful attributes', () => {
    expect(normalizeGfm('<p class="x" dir="auto"><s>a</s> <a href="/u" rel="nofollow">b</a></p>', 'github')).toBe(
      normalizeGfm('<p data-line="1"><del>a</del> <a href="/u" target="_blank">b</a></p>', 'ours'),
    );
  });

  it("unwraps GitHub's heading permalink and decodes our heading id", () => {
    const github = '<div class="markdown-heading"><h2 class="heading-element">見出し</h2><a id="user-content-x" class="anchor" href="#%E8%A6%8B%E5%87%BA%E3%81%97"></a></div>';
    const ours = '<h2 data-line="1" id="%E8%A6%8B%E5%87%BA%E3%81%97" tabindex="-1">見出し</h2>';
    expect(normalizeGfm(github, 'github')).toBe('<h2 id="見出し">\n  "見出し"');
    expect(normalizeGfm(ours, 'ours')).toBe(normalizeGfm(github, 'github'));
  });

  it('shows a difference in structure', () => {
    expect(normalizeGfm('<p>a <em>b</em></p>', 'ours')).not.toBe(normalizeGfm('<p>a b</p>', 'github'));
  });
});
