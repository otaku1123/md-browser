// Reduces GitHub's HTML (GitHub Markdown API, mode "markdown": what github.com shows for a README)
// and renderMarkdown()'s to one canonical text, so gfm-compat.test.ts can compare the structure
// of the two and ignore the presentation. Every rule below names the difference it hides; the
// ones marked "intended" are differences md-browser keeps on purpose, so they are not reported.

export type Side = 'github' | 'ours';
/** The GitHub Markdown API mode the fixture was fetched with (scripts/gfm-fixtures.mjs). */
export type Mode = 'markdown' | 'gfm';

// Attributes that carry meaning for the reader; everything else (class, id, style, data-*,
// aria-*, rel, target, tabindex, role, lang on <pre>) is presentation or scripting.
const KEEP_ATTRS = new Set(['href', 'src', 'alt', 'title', 'type', 'checked', 'disabled', 'width', 'height', 'align', 'start', 'open', 'colspan', 'rowspan']);
// Classes that stand for a construct, not a look.
const KEEP_CLASSES = /^(markdown-alert(-\w+)?|contains-task-list|task-list-item|footnotes)$/;
const HEADINGS = 'h1, h2, h3, h4, h5, h6';
const BLOCKS = new Set(['P', 'DIV', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'PRE', 'BLOCKQUOTE', 'SECTION', 'DETAILS', 'SUMMARY', 'HR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'MATH']);

export function normalizeGfm(html: string, side: Side, mode: Mode = 'markdown'): string {
  const root = document.createElement('div');
  root.innerHTML = html;
  if (side === 'github') normalizeGitHub(root);
  else normalizeOurs(root);
  normalizeFootnotes(root);
  // The API's gfm mode adds no heading anchors, so there is nothing to compare our ids with.
  if (mode === 'gfm') for (const h of root.querySelectorAll(HEADINGS)) h.removeAttribute('id');
  normalizeCommon(root);
  return serialize(root, 0).join('\n');
}

function unwrap(el: Element): void {
  el.replaceWith(...Array.from(el.childNodes));
}

function replaceWithText(el: Element, text: string): void {
  el.replaceWith(el.ownerDocument.createTextNode(text));
}

/** A `<math>` element holding the TeX source: both sides end up here (see the rules). */
function mathBlock(doc: Document, source: string): Element {
  const el = doc.createElement('math');
  el.textContent = source.trim();
  return el;
}

function normalizeGitHub(root: HTMLElement): void {
  const doc = root.ownerDocument;
  // Headings come wrapped with a permalink: <div class="markdown-heading"><h2>…</h2><a href="#slug"></a></div>.
  for (const wrap of root.querySelectorAll('div.markdown-heading')) {
    const h = wrap.querySelector(HEADINGS);
    const anchor = wrap.querySelector('a.anchor');
    if (h && anchor) h.id = decodeURIComponent(anchor.getAttribute('href')?.slice(1) ?? '');
    anchor?.remove();
    unwrap(wrap);
  }
  // Images are wrapped in a link to themselves; proxied through camo with the original in data-canonical-src.
  for (const a of root.querySelectorAll('a[target="_blank"]')) {
    if (a.childNodes.length === 1 && a.firstElementChild?.tagName === 'IMG') unwrap(a);
  }
  for (const img of root.querySelectorAll('img[data-canonical-src]')) img.setAttribute('src', img.getAttribute('data-canonical-src')!);
  // Highlighted code: <div class="highlight"><pre>spans</pre></div>; the <pre> is handled below.
  for (const div of root.querySelectorAll('div.highlight')) unwrap(div);
  // Accessibility wrappers and icons.
  for (const el of root.querySelectorAll('markdown-accessiblity-table, g-emoji')) unwrap(el);
  // gfm mode wraps math for a client-side renderer, keeping the $ delimiters in the text.
  for (const el of root.querySelectorAll('math-renderer')) {
    const m = /^\$\$([\s\S]*)\$\$$/.exec(el.textContent?.trim() ?? '');
    if (m) el.replaceWith(mathBlock(doc, m[1]));
    else unwrap(el);
  }
  for (const el of root.querySelectorAll('.markdown-alert-title svg, section[data-footnotes] > h2')) el.remove();
  for (const section of root.querySelectorAll('section[data-footnotes]')) section.classList.add('footnotes');
  // markdown mode leaves math as text ($…$ inline, $$…$$ paragraph, ```math block); the inline
  // form is text on our side too, the block forms become <math>.
  for (const p of root.querySelectorAll('p')) {
    const m = /^\$\$([\s\S]*)\$\$$/.exec(p.textContent?.trim() ?? '');
    if (m && p.children.length === 0) p.replaceWith(mathBlock(doc, m[1]));
    // gfm mode: the <math-renderer> (now <math>) sat alone in a paragraph.
    else if (p.childNodes.length === 1 && p.firstElementChild?.tagName === 'MATH') unwrap(p);
  }
  for (const pre of root.querySelectorAll('pre[lang="math"]')) pre.replaceWith(mathBlock(doc, pre.textContent ?? ''));
}

function normalizeOurs(root: HTMLElement): void {
  const doc = root.ownerDocument;
  // Heading ids are percent-encoded (markdown-it-anchor + encodeURIComponent); GitHub's are not.
  for (const h of root.querySelectorAll(HEADINGS)) if (h.id) h.id = decodeURIComponent(h.id);
  // Intended: diagrams are drawn (diagrams.ts); GitHub's API shows the source as code.
  for (const d of root.querySelectorAll('.diagram')) {
    const pre = doc.createElement('pre');
    pre.textContent = d.querySelector('.diagram-source')?.textContent ?? '';
    d.replaceWith(pre);
  }
  // Math placeholders (math.ts) carry the TeX source as text.
  for (const el of root.querySelectorAll('.math-inline')) replaceWithText(el, `$${el.textContent}$`);
  for (const el of root.querySelectorAll('.math-display')) el.replaceWith(mathBlock(doc, el.textContent ?? ''));
  // markdown-it-footnote adds a rule before the section; markdown-it-task-lists wraps the item in a label.
  for (const el of root.querySelectorAll('hr.footnotes-sep')) el.remove();
  for (const el of root.querySelectorAll('li.task-list-item > label')) unwrap(el);
  // A raw <img> on a line of its own is an HTML block (no <p>) in CommonMark; GitHub's image
  // post-processing puts every image in a paragraph.
  for (const img of root.querySelectorAll('img')) {
    if (img.closest('p')) continue;
    const p = doc.createElement('p');
    img.replaceWith(p);
    p.append(img);
  }
  // markdown-it writes table alignment as style; GitHub as align.
  for (const cell of root.querySelectorAll<HTMLElement>('th[style], td[style]')) {
    const align = /text-align:\s*(\w+)/.exec(cell.getAttribute('style') ?? '')?.[1];
    if (align) cell.setAttribute('align', align);
  }
  // Intended: GitHub strips <abbr> and <font> (and every style attribute, dropped for both sides
  // below); a local viewer keeps the author's HTML.
  for (const el of root.querySelectorAll('abbr, font')) unwrap(el);
}

/**
 * Footnote ids differ in form (GitHub: fn-1 / fn-label, ours: fn-md-N) and both number repeated
 * references ("1-2", "[1:1]"). Notes are renumbered by position; references point at the note
 * and show its number; back-references all become the same arrow.
 */
function normalizeFootnotes(root: HTMLElement): void {
  const ids = new Map<string, string>();
  root.querySelectorAll('section li[id]').forEach((li, i) => {
    ids.set(li.id.replace(/^user-content-/, ''), `fn-${i + 1}`);
    li.id = `fn-${i + 1}`;
  });
  for (const a of root.querySelectorAll('sup > a[href^="#fn"]')) {
    const target = ids.get(a.getAttribute('href')!.slice(1).replace(/^user-content-/, ''));
    if (!target) continue;
    a.setAttribute('href', `#${target}`);
    a.textContent = target.slice(3);
  }
  for (const a of root.querySelectorAll('a[data-footnote-backref], a.footnote-backref')) {
    a.setAttribute('href', '#fnref');
    a.textContent = '↩';
  }
}

function normalizeCommon(root: HTMLElement): void {
  const doc = root.ownerDocument;
  // <s> (markdown-it) and <del> (GitHub) are both strikethrough.
  for (const s of root.querySelectorAll('s')) {
    const del = doc.createElement('del');
    del.append(...Array.from(s.childNodes));
    s.replaceWith(del);
  }
  // Code blocks: the text only (highlighting spans and the <code> wrapper are presentation).
  for (const pre of root.querySelectorAll('pre')) pre.textContent = (pre.textContent ?? '').replace(/\n$/, '');
  // Comments are not shown by either.
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  const comments: Node[] = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  for (const c of comments) c.parentNode?.removeChild(c);
  for (const el of root.querySelectorAll('*')) {
    for (const attr of Array.from(el.attributes)) {
      if (KEEP_ATTRS.has(attr.name)) continue;
      if (attr.name === 'id' && (el.matches(HEADINGS) || el.matches('section li'))) continue;
      if (attr.name === 'class') {
        const kept = attr.value.split(/\s+/).filter((c) => KEEP_CLASSES.test(c)).sort();
        if (kept.length) el.setAttribute('class', kept.join(' '));
        else el.removeAttribute('class');
        continue;
      }
      el.removeAttribute(attr.name);
    }
  }
  root.normalize();
}

function isBlock(node: Node | null): boolean {
  return node === null || (node.nodeType === Node.ELEMENT_NODE && BLOCKS.has((node as Element).tagName));
}

function serialize(node: Node, depth: number): string[] {
  const pad = '  '.repeat(depth);
  const lines: string[] = [];
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      let text = (child.textContent ?? '').replace(/[ \t\r\n]+/g, ' ');
      // Whitespace next to a block boundary is layout, not content.
      if (isBlock(child.previousSibling) || (child.previousSibling === null && isBlock(node))) text = text.trimStart();
      if (isBlock(child.nextSibling) || (child.nextSibling === null && isBlock(node))) text = text.trimEnd();
      if (text) lines.push(pad + JSON.stringify(text));
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element;
      const attrs = Array.from(el.attributes)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((a) => ` ${a.name}=${JSON.stringify(a.value)}`)
        .join('');
      lines.push(`${pad}<${el.tagName.toLowerCase()}${attrs}>`);
      lines.push(...serialize(el, depth + 1));
    }
  }
  return lines;
}
