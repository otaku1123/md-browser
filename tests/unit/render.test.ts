import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../../src/core/render';

function dom(html: string): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

describe('renderMarkdown', () => {
  it('builds the table of contents from headings', () => {
    const { toc } = renderMarkdown('# Title\n\n## Section `code`\n\n### 日本語の見出し\n');
    expect(toc.map((h) => [h.level, h.text])).toEqual([
      [1, 'Title'],
      [2, 'Section code'],
      [3, '日本語の見出し'],
    ]);
  });

  it('gives each heading an id that matches its TOC entry', () => {
    const { html, toc } = renderMarkdown('## 日本語の見出し\n\n## Same\n\n## Same\n');
    const ids = [...dom(html).querySelectorAll('h2')].map((h) => h.id);
    expect(ids).toEqual(toc.map((h) => h.id));
    expect(new Set(ids).size).toBe(3);
  });

  it('renders GFM tables, task lists and highlighted code', () => {
    const root = dom(renderMarkdown('| a |\n|---|\n| 1 |\n\n- [x] done\n- [ ] todo\n\n```ts\nconst x = 1;\n```\n').html);
    expect(root.querySelector('table td')?.textContent).toBe('1');
    expect(root.querySelectorAll('input[type="checkbox"]').length).toBe(2);
    expect(root.querySelector('pre code .hljs-keyword')?.textContent).toBe('const');
  });

  it('keeps Mermaid source as text so arrows survive sanitizing', () => {
    const root = dom(renderMarkdown('```mermaid\nflowchart LR\n  A --> B\n```\n').html);
    expect(root.querySelector('.diagram-mermaid .diagram-source')?.textContent).toContain('A --> B');
  });

  it('labels PlantUML blocks as unsupported and shows the source', () => {
    const root = dom(renderMarkdown('```plantuml\n@startuml\nA -> B\n@enduml\n```\n').html);
    expect(root.querySelector('.plantuml-note')).not.toBeNull();
    expect(root.querySelector('pre code')?.textContent).toContain('A -> B');
  });
});

describe('sanitizing', () => {
  const cases: [string, string][] = [
    ['script tag', '<script>alert(1)</script>'],
    ['event handler', '<img src="x" onerror="alert(1)">'],
    ['javascript: link', '[click](javascript:alert(1))'],
    ['javascript: href in raw HTML', '<a href="javascript:alert(1)">x</a>'],
    ['iframe', '<iframe src="https://example.com"></iframe>'],
    ['svg onload', '<svg onload="alert(1)"></svg>'],
  ];
  it.each(cases)('removes %s', (_name, src) => {
    const root = dom(renderMarkdown(src).html);
    expect(root.querySelector('script, iframe')).toBeNull();
    for (const el of root.querySelectorAll('*')) {
      for (const attr of el.attributes) {
        expect(attr.name.startsWith('on')).toBe(false);
        expect(attr.value.toLowerCase()).not.toContain('javascript:');
      }
    }
  });

  it('drops <form> but keeps its contents', () => {
    const root = dom(renderMarkdown('<form action="https://evil.example"><p>inside</p></form>').html);
    expect(root.querySelector('form')).toBeNull();
    expect(root.textContent).toContain('inside');
  });
});

describe('ChatGPT export markers', () => {
  it('keeps entity names and drops citations', () => {
    const src = 'A \uE200entity\uE202["organization","OpenAI",""]\uE201 B \uE200cite\uE202turn0search1\uE201C';
    expect(dom(renderMarkdown(src).html).textContent?.trim()).toBe('A OpenAI B C');
  });

  it('removes stray marker characters that do not form a marker', () => {
    expect(dom(renderMarkdown('x\uE201y\uE202z').html).textContent?.trim()).toBe('xyz');
  });

  it('handles many unclosed markers in linear time (no ReDoS)', () => {
    const src = '\uE200cite\uE202a'.repeat(20000);
    const start = performance.now();
    renderMarkdown(src);
    expect(performance.now() - start).toBeLessThan(2000);
  });
});

describe('GitHub alerts', () => {
  const types = ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'];

  it.each(types)('turns > [!%s] into a callout with a title', (type) => {
    const root = dom(renderMarkdown(`> [!${type}]\n> Body text\n`).html);
    const alert = root.querySelector(`div.markdown-alert.markdown-alert-${type.toLowerCase()}`);
    expect(alert).not.toBeNull();
    expect(root.querySelector('blockquote')).toBeNull();
    expect(alert?.querySelector('.markdown-alert-title')?.textContent).toBeTruthy();
    expect(alert?.querySelector('p:not(.markdown-alert-title)')?.textContent).toBe('Body text');
    expect(alert?.textContent).not.toContain('[!');
  });

  it('is case-insensitive and keeps multiple paragraphs and lists', () => {
    const root = dom(renderMarkdown('> [!warning]\n>\n> First\n>\n> - item\n').html);
    const alert = root.querySelector('.markdown-alert-warning');
    expect(alert?.querySelectorAll('p').length).toBe(2); // title + "First"
    expect(alert?.querySelector('li')?.textContent).toBe('item');
  });

  it.each([
    ['text after the marker', '> [!NOTE] inline text\n> more\n'],
    ['unknown type', '> [!FOO]\n> text\n'],
    ['marker not on the first line', '> text\n> [!NOTE]\n'],
    ['ordinary blockquote', '> just a quote\n'],
  ])('leaves %s as a blockquote', (_name, src) => {
    const root = dom(renderMarkdown(src).html);
    expect(root.querySelector('blockquote')).not.toBeNull();
    expect(root.querySelector('.markdown-alert')).toBeNull();
  });

  it('closes the right element when alerts are nested in quotes', () => {
    const root = dom(renderMarkdown('> [!TIP]\n> outer\n> > inner quote\n>\n> after\n\nOutside\n').html);
    const alert = root.querySelector('.markdown-alert-tip');
    expect(alert?.querySelector('blockquote')?.textContent?.trim()).toBe('inner quote');
    expect(alert?.textContent).toContain('after');
    expect(alert?.textContent).not.toContain('Outside');
  });

  it('still sanitizes content inside alerts', () => {
    const root = dom(renderMarkdown('> [!NOTE]\n> <img src="x" onerror="alert(1)">\n').html);
    expect(root.querySelector('img')?.hasAttribute('onerror')).toBe(false);
  });
});

describe('front matter', () => {
  const fm = (html: string) => dom(html).querySelector('details.front-matter');

  it('moves YAML front matter into a collapsed block', () => {
    const { html, toc } = renderMarkdown('---\ntitle: Plan\ntags: [a, b]\n---\n# Heading\n');
    const block = fm(html);
    expect(block).not.toBeNull();
    expect(block?.hasAttribute('open')).toBe(false);
    expect(block?.querySelector('code.language-yaml')?.textContent).toBe('title: Plan\ntags: [a, b]');
    expect(dom(html).querySelector('hr')).toBeNull();
    expect(toc.map((h) => h.text)).toEqual(['Heading']);
  });

  it('supports TOML (+++), "..." closing, CRLF, BOM and empty blocks', () => {
    expect(fm(renderMarkdown('+++\ntitle = "x"\n+++\nbody').html)?.querySelector('code.language-toml')?.textContent).toBe('title = "x"');
    expect(fm(renderMarkdown('---\na: 1\n...\nbody').html)).not.toBeNull();
    expect(fm(renderMarkdown('---\r\na: 1\r\n---\r\nbody').html)?.textContent).toContain('a: 1');
    expect(fm(renderMarkdown('\uFEFF---\na: 1\n---\nbody').html)).not.toBeNull();
    expect(fm(renderMarkdown('---\n---\nbody').html)).not.toBeNull();
  });

  it('keeps a TOML block intact when a line inside is "..."', () => {
    const block = fm(renderMarkdown('+++\na = 1\n...\nb = 2\n+++\nbody').html);
    expect(block?.textContent).toContain('b = 2');
  });

  it.each([
    ['not at the top', 'intro\n\n---\na: 1\n---\n'],
    ['unclosed', '---\na: 1\n\nbody'],
    ['mismatched delimiters', '+++\na = 1\n---\nbody'],
    ['a longer rule as the closer', '---\na: 1\n----\nbody'],
  ])('ignores front matter that is %s', (_name, src) => {
    expect(fm(renderMarkdown(src).html)).toBeNull();
  });

  it('escapes HTML inside front matter', () => {
    const root = dom(renderMarkdown('---\ntitle: <img src=x onerror=alert(1)>\n---\n').html);
    expect(root.querySelector('img')).toBeNull();
    expect(fm(root.innerHTML)?.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('scans an unclosed block in linear time', () => {
    const src = '---\n' + 'a: 1\n'.repeat(200000);
    const start = performance.now();
    renderMarkdown(src);
    expect(performance.now() - start).toBeLessThan(3000);
  });
});
