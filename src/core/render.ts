import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';
import taskLists from 'markdown-it-task-lists';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/common';

export interface TocItem {
  level: number;
  text: string;
  id: string;
}

export interface RenderResult {
  html: string;
  toc: TocItem[];
}

const DIAGRAM_LANGS = new Set(['mermaid']);
// PlantUML is not rendered yet; shown as a labelled code block.
const PLANTUML_LANGS = new Set(['plantuml', 'puml', 'uml']);

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
  .use(taskLists, { enabled: false });

const defaultFence = md.renderer.rules.fence!;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const lang = token.info.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  if (DIAGRAM_LANGS.has(lang)) {
    // Source goes in text content, not an attribute: DOMPurify drops attributes containing "-->".
    return `<div class="diagram diagram-${lang}"><pre class="diagram-source">${escapeHtml(token.content)}</pre></div>\n`;
  }
  if (PLANTUML_LANGS.has(lang)) {
    return `<div class="plantuml-placeholder"><div class="plantuml-note">PlantUML（未対応のためソースを表示）</div>${defaultFence(tokens, idx, options, env, self)}</div>`;
  }
  return defaultFence(tokens, idx, options, env, self);
};

// ChatGPT exports keep internal markers in Private Use Area characters:
//    type  arg  arg … 
// e.g. "cite" (source ids, unresolvable outside ChatGPT), "entity" (["organization","Name",…]),
// "image_group" (carousel spec). Keep entity names, drop everything else.
const CHATGPT_MARKER = /([\w-]+)((?:[^]*)*)/g;
const STRAY_MARKER_CHARS = /[-]/g;

function stripChatGptMarkers(src: string): string {
  if (!src.includes('')) return src;
  return src
    .replace(CHATGPT_MARKER, (_m, type: string, args: string) => {
      if (type !== 'entity') return '';
      try {
        const value: unknown = JSON.parse(args.split('')[1] ?? '');
        return Array.isArray(value) && typeof value[1] === 'string' ? value[1] : '';
      } catch {
        return '';
      }
    })
    .replace(STRAY_MARKER_CHARS, '');
}

export function renderMarkdown(src: string): RenderResult {
  const env = {};
  const tokens = md.parse(stripChatGptMarkers(src), env);

  const toc: TocItem[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'heading_open') continue;
    const id = t.attrGet('id');
    const inline = tokens[i + 1];
    if (!id || !inline) continue;
    const text = (inline.children ?? [])
      .filter((c) => c.type === 'text' || c.type === 'code_inline')
      .map((c) => c.content)
      .join('');
    toc.push({ level: Number(t.tag.slice(1)), text, id: String(id) });
  }

  const raw = md.renderer.render(tokens, md.options, env);
  const html = DOMPurify.sanitize(raw, { ADD_ATTR: ['target'] });
  return { html, toc };
}
