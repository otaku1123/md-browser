import type { MarkdownIt, StateBlock, StateInline } from 'markdown-it';

type KatexApi = typeof import('katex').default;

let katexPromise: Promise<KatexApi> | null = null;

// KaTeX and its fonts are large, so load them only when a document actually contains math.
// The stylesheet comes from the same lazy chunk; its font URLs resolve against the chunk.
function loadKatex(): Promise<KatexApi> {
  katexPromise ??= Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([m]) => m.default);
  return katexPromise;
}

const isSpace = (code: number): boolean => code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;
const isDigit = (code: number): boolean => code >= 0x30 && code <= 0x39;

/**
 * Inline math, following GitHub: `$x$` (the opening `$` is not followed by whitespace, the closing
 * one is not preceded by whitespace nor followed by a digit, so "$5 and $10" stays text),
 * `` $`x`$ `` and `$$x$$` (shown as a display equation). A `\$` outside a formula never reaches
 * this rule (markdown-it's escape rule consumes it); inside a formula the scan below skips it.
 */
function mathInline(state: StateInline, silent: boolean): boolean {
  const src = state.src;
  const start = state.pos;
  if (src.charCodeAt(start) !== 0x24) return false;

  let contentStart: number;
  let contentEnd = -1;
  let end = -1;
  let display = false;
  const next = src.charCodeAt(start + 1); // NaN at the end of the source

  if (next === 0x60) {
    // $`...`$ : a backtick run, then the same run followed by "$"
    let n = 1;
    while (src.charCodeAt(start + 1 + n) === 0x60) n++;
    contentStart = start + 1 + n;
    const ticks = '`'.repeat(n);
    for (let i = src.indexOf(ticks, contentStart); i !== -1; i = src.indexOf(ticks, i + 1)) {
      if (i > contentStart && src.charCodeAt(i + n) === 0x24 && src.charCodeAt(i - 1) !== 0x60) {
        contentEnd = i;
        end = i + n + 1;
        break;
      }
    }
  } else if (next === 0x24) {
    contentStart = start + 2;
    const i = src.indexOf('$$', contentStart);
    if (i > contentStart) {
      contentEnd = i;
      end = i + 2;
      display = true;
    }
  } else {
    contentStart = start + 1;
    if (Number.isNaN(next) || isSpace(next)) return false;
    for (let i = contentStart; i < src.length; i++) {
      const c = src.charCodeAt(i);
      if (c === 0x5c) {
        i++; // skip the escaped character
      } else if (c === 0x24 && !isSpace(src.charCodeAt(i - 1)) && !isDigit(src.charCodeAt(i + 1))) {
        contentEnd = i;
        end = i + 1;
        break;
      }
    }
  }
  if (end === -1 || src.slice(contentStart, contentEnd).trim() === '') return false;

  if (!silent) {
    const token = state.push('math_inline', 'span', 0);
    token.content = src.slice(contentStart, contentEnd).trim();
    token.markup = '$';
    token.meta = { display };
  }
  state.pos = end;
  return true;
}

/** Display math: `$$` on its own lines (or `$$x$$` on one line). */
function mathBlock(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  const first = state.bMarks[startLine] + state.tShift[startLine];
  if (state.src.slice(first, first + 2) !== '$$') return false;

  const firstText = state.src.slice(first + 2, state.eMarks[startLine]);
  const parts: string[] = [];
  let line = startLine;
  if (firstText.trim().length > 2 && firstText.trimEnd().endsWith('$$')) {
    parts.push(firstText.trimEnd().slice(0, -2));
  } else {
    parts.push(firstText);
    let closed = false;
    for (line = startLine + 1; line < endLine; line++) {
      const text = state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
      if (text.trimEnd().endsWith('$$')) {
        parts.push(text.trimEnd().slice(0, -2));
        closed = true;
        break;
      }
      parts.push(text);
    }
    if (!closed) return false;
  }
  const content = parts.join('\n').trim();
  if (content === '') return false;
  if (silent) return true;

  const token = state.push('math_block', 'div', 0);
  token.block = true;
  token.content = content;
  token.markup = '$$';
  token.map = [startLine, line + 1];
  state.line = line + 1;
  return true;
}

const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Placeholder for renderMath. The TeX source is text content, which survives DOMPurify. */
export function mathPlaceholder(source: string, display: boolean, inline = false): string {
  const tag = inline ? 'span' : 'div';
  return `<${tag} class="math ${display ? 'math-display' : 'math-inline'}">${escapeHtml(source)}</${tag}>`;
}

export function mathPlugin(md: MarkdownIt): void {
  // Before "backticks" so that "$`x`$" is not read as a code span.
  md.inline.ruler.before('backticks', 'math_inline', mathInline);
  md.block.ruler.before('fence', 'math_block', mathBlock, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });
  md.renderer.rules.math_inline = (tokens, idx) =>
    mathPlaceholder(tokens[idx].content, (tokens[idx].meta as { display: boolean }).display, true);
  md.renderer.rules.math_block = (tokens, idx) => mathPlaceholder(tokens[idx].content, true) + '\n';
}

/** Typesets the math placeholders in root with KaTeX; loads KaTeX only if there are any. */
export async function renderMath(root: ParentNode): Promise<void> {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('.math:not(.math-done)'));
  if (nodes.length === 0) return;

  const katex = await loadKatex();
  for (const node of nodes) {
    // KaTeX output is inserted after DOMPurify on purpose: with trust off it emits only
    // spans, MathML and inline styles built from the parsed formula, never raw input HTML.
    katex.render(node.textContent ?? '', node, {
      displayMode: node.classList.contains('math-display'),
      throwOnError: false, // a bad formula shows its source in red instead of throwing
      trust: false,
      strict: 'ignore',
    });
    node.classList.add('math-done');
  }
}
