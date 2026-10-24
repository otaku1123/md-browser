import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../../src/core/render';

function dom(md: string): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = renderMarkdown(md).html;
  return div;
}

const sources = (el: HTMLElement, sel = '.math') => Array.from(el.querySelectorAll(sel)).map((n) => n.textContent);

describe('math syntax (GitHub rules)', () => {
  it('reads $...$ as inline math', () => {
    const el = dom('Euler: $e^{i\\pi} + 1 = 0$ done');
    expect(sources(el, '.math-inline')).toEqual(['e^{i\\pi} + 1 = 0']);
    expect(el.querySelector('p')?.textContent).toBe('Euler: e^{i\\pi} + 1 = 0 done');
  });

  it('does not treat "$5 and $10" as math', () => {
    expect(dom('It costs $5 and $10 total').querySelectorAll('.math')).toHaveLength(0);
  });

  it('requires no space inside the dollars', () => {
    expect(dom('a $ x $ b').querySelectorAll('.math')).toHaveLength(0);
    expect(dom('a $x $ b').querySelectorAll('.math')).toHaveLength(0);
    expect(dom('a $ x$ b').querySelectorAll('.math')).toHaveLength(0);
  });

  it('does not close on a dollar followed by a digit', () => {
    expect(dom('$a$1').querySelectorAll('.math')).toHaveLength(0);
    // The first "$" before a digit is skipped; the next valid one closes.
    expect(sources(dom('$a$1 b$'))).toEqual(['a$1 b']);
  });

  it('keeps an escaped dollar as text', () => {
    const el = dom('Pay \\$5 or \\$6 now');
    expect(el.querySelectorAll('.math')).toHaveLength(0);
    expect(el.textContent).toContain('Pay $5 or $6 now');
  });

  it('allows \\$ inside a formula', () => {
    expect(sources(dom('$a \\$ b$'))).toEqual(['a \\$ b']);
  });

  it('leaves code spans and code blocks untouched', () => {
    expect(dom('`$x$` and `$a$ $b$`').querySelectorAll('.math')).toHaveLength(0);
    expect(dom('```\n$$\nx\n$$\n$y$\n```').querySelectorAll('.math')).toHaveLength(0);
  });

  it('reads $`...`$ as inline math', () => {
    expect(sources(dom('see $`a_1 + b`$ here'), '.math-inline')).toEqual(['a_1 + b']);
    expect(sources(dom('see $`` a`b ``$ here'), '.math-inline')).toEqual(['a`b']);
  });

  it('reads $$ on its own lines as display math', () => {
    const el = dom('before\n\n$$\n\\sum_{i=1}^n i\n= \\frac{n(n+1)}{2}\n$$\n\nafter');
    expect(sources(el, '.math-display')).toEqual(['\\sum_{i=1}^n i\n= \\frac{n(n+1)}{2}']);
    expect(el.querySelector('div.math-display')).not.toBeNull();
  });

  it('reads single-line $$x$$ as display math', () => {
    expect(sources(dom('$$x^2$$'), '.math-display')).toEqual(['x^2']);
    expect(sources(dom('inline $$x^2$$ here'), '.math-display')).toEqual(['x^2']);
  });

  it('reads ```math fences as display math', () => {
    const el = dom('```math\n\\frac{a}{b}\n```');
    expect(sources(el, '.math-display')).toEqual(['\\frac{a}{b}']);
    expect(el.querySelector('pre')).toBeNull();
  });

  it('leaves an unclosed $$ block as text', () => {
    expect(dom('$$\nx\n').querySelectorAll('.math')).toHaveLength(0);
  });

  it('keeps TeX special characters as text through DOMPurify', () => {
    const el = dom('$a < b > c & "d" <img src=x onerror=alert(1)>$\n\n$$\n<script>x</script>\n$$');
    expect(el.querySelector('img, script')).toBeNull();
    expect(sources(el)).toEqual(['a < b > c & "d" <img src=x onerror=alert(1)>', '<script>x</script>']);
  });

  it('puts the TeX source of inline math in the TOC', () => {
    const { toc } = renderMarkdown('## Energy $E=mc^2$\n');
    expect(toc.map((h) => h.text)).toEqual(['Energy E=mc^2']);
  });
});
