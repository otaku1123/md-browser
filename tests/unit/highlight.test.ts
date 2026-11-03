import { describe, expect, it } from 'vitest';
import hljs from 'highlight.js/lib/common';
import { LAZY_LANGUAGES, fenceLanguages, lazyLanguageFor, loadHighlightLanguages } from '../../src/core/highlight';
import { renderMarkdown } from '../../src/core/render';

describe('fenceLanguages', () => {
  it('reads the first word of the info string of ``` and ~~~ fences, once each, in lowercase', () => {
    const src = '```Dockerfile\nFROM a\n```\n\n~~~ps1 title="x"\nGet-Item\n~~~\n\n   ````dockerfile\n````\n\ntext ```notafence\n';
    expect(fenceLanguages(src)).toEqual(['dockerfile', 'ps1']);
  });

  it('ignores fences without a language', () => {
    expect(fenceLanguages('```\nplain\n```\n')).toEqual([]);
  });
});

describe('lazyLanguageFor', () => {
  it('resolves module names and aliases, ignoring case', () => {
    expect(lazyLanguageFor('dockerfile')).toBe('dockerfile');
    expect(lazyLanguageFor('Docker')).toBe('dockerfile');
    expect(lazyLanguageFor('ps1')).toBe('powershell');
    expect(lazyLanguageFor('asm')).toBe('x86asm');
    expect(lazyLanguageFor('jinja2')).toBe('django');
  });

  it('knows nothing about bundled or unknown languages', () => {
    expect(lazyLanguageFor('ts')).toBeUndefined();
    expect(lazyLanguageFor('nosuchlang')).toBeUndefined();
  });

  it('lists no language that highlight.js/lib/common already bundles', () => {
    for (const name of LAZY_LANGUAGES) expect(hljs.getLanguage(name), name).toBeUndefined();
  });
});

describe('loadHighlightLanguages', () => {
  it('registers the languages of the fences so renderMarkdown highlights them', async () => {
    const src = '```dockerfile\nFROM alpine\n```\n\n```ps1\nGet-ChildItem -Path .\n```\n';
    expect(renderMarkdown(src).html).not.toContain('hljs-keyword');
    await loadHighlightLanguages(src);
    const root = document.createElement('div');
    root.innerHTML = renderMarkdown(src).html;
    const keywords = [...root.querySelectorAll('.hljs-keyword, .hljs-built_in')].map((el) => el.textContent);
    expect(keywords).toContain('FROM');
    expect(keywords).toContain('Get-ChildItem');
  });

  it('leaves unknown languages alone', async () => {
    await loadHighlightLanguages('```nosuchlang\nx\n```\n');
    expect(hljs.getLanguage('nosuchlang')).toBeUndefined();
  });

  it('loads every listed language', async () => {
    const src = LAZY_LANGUAGES.map((name) => `\`\`\`${name}\nx\n\`\`\``).join('\n\n');
    await loadHighlightLanguages(src);
    for (const name of LAZY_LANGUAGES) expect(hljs.getLanguage(name), name).toBeDefined();
  });
});
