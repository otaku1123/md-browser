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

  it('keeps PlantUML source (plantuml / puml / uml) as text for the diagram renderer', () => {
    for (const lang of ['plantuml', 'puml', 'uml']) {
      const root = dom(renderMarkdown(`\`\`\`${lang}\n@startuml\nA -> B\n@enduml\n\`\`\`\n`).html);
      expect(root.querySelector('.diagram-plantuml .diagram-source')?.textContent).toContain('A -> B');
    }
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

  it('keeps heading ids that collide with document / form properties (#48)', () => {
    const names = ['Title', 'Name', 'Length', 'Id', 'Action', 'Location', 'Cookie'];
    const { html, toc } = renderMarkdown(names.map((n) => `## ${n}`).join('\n\n'));
    const root = dom(html);
    expect(toc.map((t) => t.id)).toEqual(names.map((n) => n.toLowerCase()));
    for (const { id } of toc) expect(root.querySelector(`h2[id="${id}"]`)).not.toBeNull();
  });

  it('keeps GitHub-style <picture> markup with its theme sources', () => {
    const root = dom(renderMarkdown('<picture>\n<source media="(prefers-color-scheme: dark)" srcset="dark.png">\n<img src="light.png" alt="a">\n</picture>').html);
    expect(root.querySelector('picture > source')?.getAttribute('srcset')).toBe('dark.png');
    expect(root.querySelector('picture > source')?.getAttribute('media')).toBe('(prefers-color-scheme: dark)');
    expect(root.querySelector('picture > img')?.getAttribute('src')).toBe('light.png');
  });

  it('still drops clobbering ids and names on other elements', () => {
    const root = dom(renderMarkdown('<img src="x.png" id="cookie" name="title">\n\n<p id="location">x</p>').html);
    expect(root.querySelector('img')!.hasAttribute('id')).toBe(false);
    expect(root.querySelector('img')!.hasAttribute('name')).toBe(false);
    expect(root.querySelector('p')!.hasAttribute('id')).toBe(false);
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

  describe('emoji shortcodes', () => {
    it('renders known shortcodes as Unicode emoji', () => {
      const { html } = renderMarkdown(':smile: :+1: :tada:\n');
      expect(dom(html).textContent).toContain('😄 👍 🎉');
    });

    it('leaves unknown shortcodes as text', () => {
      expect(dom(renderMarkdown(':notanemoji:\n').html).textContent).toContain(':notanemoji:');
    });

    it('does not convert inside inline code or fenced code', () => {
      const d = dom(renderMarkdown('`:smile:`\n\n```\n:tada:\n```\n').html);
      expect(d.querySelector('p code')!.textContent).toBe(':smile:');
      expect(d.querySelector('pre code')!.textContent).toBe(':tada:\n');
    });

    it('does not convert times, URLs, Windows paths or text shortcuts', () => {
      const src = '10:30:00 http://example.com C:\\Users\\me :) :-( :D ;)\n';
      expect(dom(renderMarkdown(src).html).textContent).toContain(
        '10:30:00 http://example.com C:\\Users\\me :) :-( :D ;)',
      );
    });

    it('does not touch colons in front matter', () => {
      const { html } = renderMarkdown('---\nmood: :smile:\n---\n\nbody\n');
      expect(dom(html).querySelector('.front-matter')!.textContent).toContain('mood: :smile:');
    });

    it('shows the emoji in the TOC and keeps the heading id stable', () => {
      const { html, toc } = renderMarkdown('## Done :tada:\n');
      expect(toc).toHaveLength(1);
      expect(toc[0].text).toBe('Done 🎉');
      expect(toc[0].id).toBe('done');
      expect(dom(html).querySelector('h2')!.id).toBe(toc[0].id);
      expect(dom(html).querySelector('h2')!.textContent).toContain('🎉');
    });
  });
});

describe('footnotes', () => {
  const src = 'Text[^1] and more[^note] again[^1].\n\n[^1]: First *note*.\n[^note]: Named.\n';

  it('renders references and a footnote section with back-references', () => {
    const root = dom(renderMarkdown(src).html);
    const refs = root.querySelectorAll('sup.footnote-ref a');
    expect(refs).toHaveLength(3);
    const target = refs[0].getAttribute('href')!;
    expect(root.querySelector(target)?.textContent).toContain('First note.');
    expect(root.querySelectorAll('section.footnotes li')).toHaveLength(2);
    expect(root.querySelector('hr.footnotes-sep')).not.toBeNull();
  });

  it('links every reference to the same note and back to each reference', () => {
    const root = dom(renderMarkdown(src).html);
    const refs = [...root.querySelectorAll('sup.footnote-ref a')];
    expect(refs[0].getAttribute('href')).toBe(refs[2].getAttribute('href'));
    expect(refs[0].id).not.toBe(refs[2].id);
    const backrefs = [...root.querySelectorAll('li:first-child a.footnote-backref')].map((a) => a.getAttribute('href'));
    expect(backrefs).toEqual([`#${refs[0].id}`, `#${refs[2].id}`]);
  });

  it('keeps ids and in-page links through sanitization', () => {
    const root = dom(renderMarkdown(src).html);
    for (const a of root.querySelectorAll('a.footnote-backref, sup.footnote-ref a')) {
      // Attribute selector: ids like "fnref-md-1:1" contain a colon.
      expect(root.querySelector(`[id="${a.getAttribute('href')!.slice(1)}"]`)).not.toBeNull();
    }
  });

  it('leaves the table of contents alone', () => {
    const { toc } = renderMarkdown('# Title\n\nText[^1]\n\n[^1]: Note\n');
    expect(toc).toEqual([{ level: 1, text: 'Title', id: 'title' }]);
  });

  it('does not carry footnotes over to the next render', () => {
    renderMarkdown(src);
    expect(renderMarkdown('No notes here.\n').html).not.toContain('footnote');
  });
});

describe('GFM autolinks and strikethrough (as on GitHub)', () => {
  const links = (src: string) => [...dom(renderMarkdown(src).html).querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')]);

  it('links www. hosts with an http:// prefix, keeping the path and leaving trailing punctuation', () => {
    expect(links('See www.example.com/a?x=1. Or (WWW.Example.com:8080).\n')).toEqual([
      ['www.example.com/a?x=1', 'http://www.example.com/a?x=1'],
      ['WWW.Example.com:8080', 'http://WWW.Example.com:8080'],
    ]);
  });

  it('does not link bare domains, ftp:// or protocol-relative URLs', () => {
    expect(links('example.com ftp://example.com/f //example.com/x\n')).toEqual([]);
  });

  it('still links http(s)://, mailto: and bare emails', () => {
    expect(links('https://a.example mailto:x@example.com x@example.com\n').map(([, href]) => href)).toEqual([
      'https://a.example',
      'mailto:x@example.com',
      'mailto:x@example.com',
    ]);
  });

  it('strikes through text in one or two tildes, but not three', () => {
    const html = renderMarkdown('~one~ ~~two~~ ~~~three~~~\n').html;
    expect(html).toContain('<s>one</s> <s>two</s> ~~~three~~~');
  });

  it('pairs only runs of the same length and nests them', () => {
    expect(renderMarkdown('~~a ~b~ c~~ and ~~a~ b~~\n').html).toContain('<s>a <s>b</s> c</s> and ~~a~ b~~');
  });

  it('follows the emphasis flanking rules for a single tilde', () => {
    const html = renderMarkdown('~/home or a~b, but ~ spaced ~ and ~/path\n').html;
    expect(html).toContain('<s>/home or a</s>b, but ~ spaced ~ and ~/path');
  });

  describe('emphasis next to CJK punctuation (#194)', () => {
    const inline = (src: string) => renderMarkdown(`${src}\n`).html.replace(/^<p[^>]*>|<\/p>\n?$/g, '');

    it('closes bold and italics after a CJK full stop, comma or bracket', () => {
      expect(inline('**原因。**が含まれる')).toBe('<strong>原因。</strong>が含まれる');
      expect(inline('これは**原因。**です')).toBe('これは<strong>原因。</strong>です');
      expect(inline('*斜体、*次')).toBe('<em>斜体、</em>次');
      expect(inline('**（注）**本文')).toBe('<strong>（注）</strong>本文');
      expect(inline('~~削除。~~次')).toBe('<s>削除。</s>次');
    });

    it('opens bold before a CJK bracket', () => {
      expect(inline('**「注意」**です')).toBe('<strong>「注意」</strong>です');
      expect(inline('前の文。**「注意」**です')).toBe('前の文。<strong>「注意」</strong>です');
    });

    it('lets a CJK character on the other side of the run lift the punctuation condition', () => {
      expect(inline('**強調.**次')).toBe('<strong>強調.</strong>次'); // ASCII punctuation inside, CJK outside
      expect(inline('太字**(注)**です')).toBe('太字<strong>(注)</strong>です');
    });

    it('keeps the CommonMark result for text without CJK characters', () => {
      expect(inline('**a.**b')).toBe('**a.**b');
      expect(inline('a**"foo"**')).toBe('a**"foo"**');
      expect(inline('**foo bar **')).toBe('**foo bar **');
      expect(inline('foo_bar_')).toBe('foo_bar_');
      expect(inline('**a.** b')).toBe('<strong>a.</strong> b');
    });

    it('keeps underscores inside CJK words literal, like inside Latin words', () => {
      expect(inline('日本語_強調_です')).toBe('日本語_強調_です');
    });

    it('does not count an emoji as CJK', () => {
      expect(inline('**強調。**a')).toBe('<strong>強調。</strong>a');
      expect(inline('**強調😀**a')).toBe('**強調😀**a'); // punctuation (a symbol) inside, a letter outside: CommonMark result
    });

    it('reads astral code points next to the run', () => {
      expect(inline('**強調.**𠮷')).toBe('<strong>強調.</strong>𠮷'); // U+20BB7, Han
      expect(inline('𠮷**強調**。')).toBe('𠮷<strong>強調</strong>。');
    });
  });
});
