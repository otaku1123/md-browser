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
