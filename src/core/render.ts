import MarkdownIt, { type Token } from 'markdown-it';
import anchor from 'markdown-it-anchor';
import { full as emoji } from 'markdown-it-emoji';
import taskLists from 'markdown-it-task-lists';
import footnote from 'markdown-it-footnote';
import DOMPurify, { type UponSanitizeAttributeHookEvent } from 'dompurify';
import hljs from 'highlight.js/lib/common';
import { t } from '../i18n';
import { mathPlaceholder, mathPlugin } from './math';

export interface TocItem {
  level: number;
  text: string;
  id: string;
}

export interface RenderResult {
  html: string;
  toc: TocItem[];
}

// Fence language -> diagram kind, drawn after sanitizing by diagrams.ts.
const DIAGRAM_KINDS: Record<string, string> = { mermaid: 'mermaid', plantuml: 'plantuml', puml: 'plantuml', uml: 'plantuml' };

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: false,
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
      } catch {
        /* fall through to plain */
      }
    }
    return escapeHtml(code);
  },
})
  .use(anchor, {
    level: [1, 2, 3, 4, 5, 6],
    // Keep CJK characters; only normalise whitespace and strip punctuation.
    slugify: (s: string) =>
      encodeURIComponent(
        s
          .trim()
          .toLowerCase()
          .replace(/[\s]+/g, '-')
          .replace(/[!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~]/g, ''),
      ),
  })
  // label: the item text becomes the checkbox's accessible name.
  .use(taskLists, { enabled: false, label: true })
  .use(footnote)
  .use(mathPlugin)
  // :smile: -> emoji. Text shortcuts like ":)" are off: GitHub does not convert them.
  .use(emoji, { shortcuts: {} });

// GitHub alerts: a blockquote whose first line is only "[!NOTE]" (TIP, IMPORTANT, WARNING,
// CAUTION; case-insensitive) becomes a callout. Anything else stays an ordinary blockquote.
const ALERT_TITLES = {
  note: 'alertNote',
  tip: 'alertTip',
  important: 'alertImportant',
  warning: 'alertWarning',
  caution: 'alertCaution',
} as const;
const ALERT_MARKER = /^\[!(note|tip|important|warning|caution)\][ \t]*(?:\n|$)/i;

md.core.ruler.after('block', 'github_alerts', (state) => {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'blockquote_open') continue;
    const inline = tokens[i + 2];
    if (tokens[i + 1]?.type !== 'paragraph_open' || inline?.type !== 'inline') continue;
    const m = ALERT_MARKER.exec(inline.content);
    if (!m) continue;

    const type = m[1].toLowerCase() as keyof typeof ALERT_TITLES;
    tokens[i].tag = 'div';
    tokens[i].attrSet('class', `markdown-alert markdown-alert-${type}`);
    for (let j = i, depth = 0; j < tokens.length; j++) {
      if (tokens[j].type === 'blockquote_open') depth++;
      else if (tokens[j].type === 'blockquote_close' && --depth === 0) {
        tokens[j].tag = 'div';
        break;
      }
    }

    const title = new state.Token('html_block', '', 0);
    title.content = `<p class="markdown-alert-title">${escapeHtml(t(ALERT_TITLES[type]))}</p>\n`;
    inline.content = inline.content.slice(m[0].length);
    // A marker on its own paragraph leaves it empty: replace that paragraph with the title.
    tokens.splice(i + 1, inline.content.trim() ? 0 : 3, title);
  }
});

// Source line numbers: every block element gets data-line, the 1-based line in the file where it
// starts (front matter lines included), so search results and "go to line" can find it later
// (source-line.ts). Inline tokens and closing tags carry no line of their own.
export const LINE_ATTR = 'data-line';

md.core.ruler.after('block', 'source_line', (state) => {
  const offset = (state.env as { lineOffset?: number }).lineOffset ?? 0;
  for (const token of state.tokens) {
    if (token.map && token.nesting !== -1 && token.type !== 'inline') token.attrSet(LINE_ATTR, String(token.map[0] + offset + 1));
  }
});

function lineAttr(token: Token): string {
  const line = token.attrGet(LINE_ATTR);
  return line ? ` ${LINE_ATTR}="${line}"` : '';
}

// Rendered from a template, not renderToken, so the line attribute is added by hand.
const mathBlock = md.renderer.rules.math_block!;
md.renderer.rules.math_block = (tokens, idx, options, env, self) =>
  mathBlock(tokens, idx, options, env, self).replace(/^<div /, `<div${lineAttr(tokens[idx])} `);

const defaultFence = md.renderer.rules.fence!;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const lang = token.info.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  if (lang === 'math') return mathPlaceholder(token.content.trim(), true).replace(/^<div /, `<div${lineAttr(token)} `) + '\n';
  const kind = Object.hasOwn(DIAGRAM_KINDS, lang) ? DIAGRAM_KINDS[lang] : undefined;
  if (kind) {
    // Source goes in text content, not an attribute: DOMPurify drops attributes containing "-->".
    return `<div${lineAttr(token)} class="diagram diagram-${kind}"><pre class="diagram-source">${escapeHtml(token.content)}</pre></div>\n`;
  }
  return defaultFence(tokens, idx, options, env, self);
};

// ChatGPT exports keep internal markers in Private Use Area characters:
//   \uE200 type \uE202 arg \uE202 arg … \uE201
// e.g. "cite" (source ids, unresolvable outside ChatGPT), "entity" (["organization","Name",…]),
// "image_group" (carousel spec). Keep entity names, drop everything else.
// The inner class must exclude \uE202 too; otherwise unclosed markers backtrack exponentially (ReDoS).
const CHATGPT_MARKER = /\uE200([\w-]+)((?:\uE202[^\uE200-\uE202]*)*)\uE201/g;
const STRAY_MARKER_CHARS = /[\uE200-\uE202]/g;

function stripChatGptMarkers(src: string): string {
  if (!/[\uE200-\uE202]/.test(src)) return src;
  return src
    .replace(CHATGPT_MARKER, (_m, type: string, args: string) => {
      if (type !== 'entity') return '';
      try {
        const value: unknown = JSON.parse(args.split('\uE202')[1] ?? '');
        return Array.isArray(value) && typeof value[1] === 'string' ? value[1] : '';
      } catch {
        return '';
      }
    })
    .replace(STRAY_MARKER_CHARS, '');
}

// Front matter: YAML between "---" lines (closed by "---" or "...") or TOML between "+++" lines,
// at the very top of the file. Shown as a collapsed block instead of a stray rule + text.
const FRONT_MATTER =
  /^\uFEFF?(?:---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?(?:---|\.\.\.)|\+\+\+[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?\+\+\+)[ \t]*(?:\r?\n|$)/;

function splitFrontMatter(src: string): { frontMatter: string; body: string; bodyLine: number } {
  const m = FRONT_MATTER.exec(src);
  if (!m) return { frontMatter: '', body: src, bodyLine: 0 };
  const toml = m[0].replace(/^\uFEFF/, '').startsWith('+++');
  const lang = toml ? 'toml' : 'yaml';
  const code = md.options.highlight!((toml ? m[2] : m[1]) ?? '', lang, '');
  const html =
    `<details ${LINE_ATTR}="1" class="front-matter"><summary>${escapeHtml(t('frontMatter'))}</summary>` +
    `<pre><code class="hljs language-${lang}">${code}</code></pre></details>\n`;
  // Lines taken by the front matter: the body's first line is this many lines into the file.
  return { frontMatter: html, body: src.slice(m[0].length), bodyLine: m[0].split('\n').length - 1 };
}

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

function keepHeadingId(node: Element, data: UponSanitizeAttributeHookEvent): void {
  if (data.attrName === 'id' && HEADING_TAGS.has(node.nodeName.toLowerCase())) data.forceKeepAttr = true;
}

export function renderMarkdown(src: string): RenderResult {
  // docId namespaces footnote ids ("fn-md-1" rather than "fn1") so they can't collide with heading slugs.
  const { frontMatter, body, bodyLine } = splitFrontMatter(stripChatGptMarkers(src));
  const env = { docId: 'md', lineOffset: bodyLine };
  const tokens = md.parse(body, env);

  const toc: TocItem[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'heading_open') continue;
    const id = t.attrGet('id');
    const inline = tokens[i + 1];
    if (!id || !inline) continue;
    const text = (inline.children ?? [])
      .filter((c) => c.type === 'text' || c.type === 'code_inline' || c.type === 'emoji' || c.type === 'math_inline')
      .map((c) => c.content)
      .join('');
    toc.push({ level: Number(t.tag.slice(1)), text, id: String(id) });
  }

  const raw = frontMatter + md.renderer.render(tokens, md.options, env);
  // DOMPurify drops ids that match document / form properties ("name", "title", "length", …) to
  // stop DOM clobbering, which left those headings without the id the TOC links to. Heading
  // elements can't clobber anything (only form, img, embed, object and iframe are exposed as
  // named properties), so their ids are kept. Hook is scoped to this call: DOMPurify is global.
  DOMPurify.addHook('uponSanitizeAttribute', keepHeadingId);
  let html: string;
  try {
    html = DOMPurify.sanitize(raw, {
      ADD_ATTR: ['target'],
      // No legitimate use in a preview; prevents phishing forms posting to external sites.
      FORBID_TAGS: ['form'],
    });
  } finally {
    DOMPurify.removeHook('uponSanitizeAttribute', keepHeadingId);
  }
  return { html, toc };
}
