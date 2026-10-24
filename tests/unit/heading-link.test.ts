import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../../src/core/render';
import { addHeadingLinks } from '../../src/core/heading-link';

function render(src: string): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = renderMarkdown(src).html;
  addHeadingLinks(div, false);
  return div;
}

describe('addHeadingLinks', () => {
  it('appends a permalink to each heading, pointing at its id', () => {
    const div = render('# Intro\n\n## 日本語の見出し\n');
    const links = [...div.querySelectorAll<HTMLAnchorElement>('h1 > a.heading-link, h2 > a.heading-link')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(
      [...div.querySelectorAll('h1, h2')].map((h) => `#${h.id}`),
    );
    expect(links[0].getAttribute('aria-label')).toBeTruthy();
  });

  it('does not leak the link into the table of contents', () => {
    const { toc, html } = renderMarkdown('# Title\n\n## Section `code`\n');
    expect(toc.map((h) => h.text)).toEqual(['Title', 'Section code']);
    expect(html).not.toContain('heading-link');
    expect(html).not.toContain('🔗');
  });

  it('skips headings without an id and front matter', () => {
    const div = document.createElement('div');
    div.innerHTML = '<h2>no id</h2><details class="front-matter"><h2 id="x">x</h2></details>';
    addHeadingLinks(div, false);
    expect(div.querySelectorAll('.heading-link')).toHaveLength(0);
  });
});
