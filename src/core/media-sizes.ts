// Display size of document images and diagrams: a scale of their natural width, from the settings
// panel (all items) or the − / n% / + buttons on an item (that item only, remembered per document).
// The buttons sit next to the item, not inside it: images and diagrams are buttons themselves
// (image-zoom.ts) and diagrams.ts replaces a diagram's content on every redraw.
import { t } from '../i18n';
import { loadItemSizes, saveItemSizes, SIZE_STEPS, type ItemSizes } from './media-sizes-store';

const KEY_ATTR = 'data-media-key';
/** Longer refs (e.g. data: URLs) are keyed by a hash instead. */
const MAX_REF_LENGTH = 200;

export interface MediaDoc {
  doc: string;
  items: ItemSizes;
}

let globalScale = 100;
let current: MediaDoc = { doc: '', items: Object.create(null) };

/** Short, stable hash (FNV-1a, 32 bit) so a diagram keeps its key when other content moves. */
export function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

/** The next size step up (dir > 0) or down, or `now` when there is none. */
export function stepScale(now: number, dir: number): number {
  const next = dir > 0 ? SIZE_STEPS.find((s) => s > now) : [...SIZE_STEPS].reverse().find((s) => s < now);
  return next ?? now;
}

const PX = /^\s*(\d+(?:\.\d+)?)(?:px)?\s*$/;
const px = (value: string | null | undefined): number | null => {
  const n = Number(PX.exec(value ?? '')?.[1]);
  return n > 0 ? n : null;
};

/** Width at 100%: the width attribute, else the natural width (null until the image has loaded). */
export function imageBaseWidth(img: HTMLImageElement): number | null {
  const width = px(img.getAttribute('width'));
  if (width) return width;
  if (!img.naturalWidth) return null;
  // Only a height given: keep the width that height implies.
  const height = px(img.getAttribute('height'));
  return height && img.naturalHeight ? (img.naturalWidth * height) / img.naturalHeight : img.naturalWidth;
}

/** Width at 100%: Mermaid sets width="100%" with a max-width style; PlantUML a width; else the viewBox. */
export function svgBaseWidth(svg: SVGSVGElement): number | null {
  const box = Number(svg.getAttribute('viewBox')?.trim().split(/[\s,]+/)[2]);
  return px(svg.style.maxWidth) ?? px(svg.style.width) ?? px(svg.getAttribute('width')) ?? (box > 0 ? box : null);
}

function baseWidth(el: HTMLElement): number | null {
  if (el.tagName === 'IMG') return el.classList.contains('img-missing') ? null : imageBaseWidth(el as HTMLImageElement);
  if (el.classList.contains('diagram-error')) return null;
  const svg = el.querySelector<SVGSVGElement>('.diagram-screen svg, :scope > svg');
  return svg ? svgBaseWidth(svg) : null;
}

const scaleOf = (key: string): number => (key in current.items ? current.items[key] : globalScale);

/** The element framed with the buttons: a link or <picture> around the image goes in whole. */
function frameTarget(img: HTMLImageElement): Element | null {
  const link = img.closest('a');
  if (link) return link.querySelectorAll('img').length === 1 ? link : null; // one set of buttons per frame
  return img.parentElement?.tagName === 'PICTURE' ? img.parentElement : img;
}

function button(step: number, text: string, label?: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.step = String(step);
  b.textContent = text;
  if (label) {
    b.setAttribute('aria-label', label);
    b.title = label;
  }
  return b;
}

function addFrame(target: Element, item: HTMLElement, tag: 'span' | 'div'): void {
  const frame = document.createElement(tag);
  frame.className = 'media-frame';
  const bar = document.createElement('span');
  bar.className = 'media-size';
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', t('mediaSize'));
  bar.append(button(-1, '−', t('mediaSmaller')), button(0, ''), button(1, '+', t('mediaLarger')));
  // Handled here so the click never reaches the zoom (image-zoom.ts) or a link around the image.
  bar.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-step]');
    if (b) resize(item, Number(b.dataset.step));
  });
  target.replaceWith(frame);
  frame.append(target, bar);
}

/**
 * Keys every image and diagram (`img:<ref>#<n>`, `diagram:<hash>#<n>`) and frames it with the size
 * buttons. Call on each render's new content before image refs are resolved and diagrams drawn.
 */
export function prepareMediaSizes(root: ParentNode): void {
  for (const el of root.querySelectorAll(`[${KEY_ATTR}]`)) el.removeAttribute(KEY_ATTR); // only ours count
  const seen = new Map<string, number>();
  const key = (id: string) => {
    const n = (seen.get(id) ?? 0) + 1;
    seen.set(id, n);
    return `${id}#${n}`;
  };
  for (const el of root.querySelectorAll<HTMLElement>('img, .diagram-mermaid, .diagram-plantuml')) {
    if (el.tagName === 'IMG') {
      const img = el as HTMLImageElement;
      const target = frameTarget(img);
      if (!target || img.closest('.diagram')) continue;
      const ref = img.getAttribute('src') ?? '';
      img.setAttribute(KEY_ATTR, key(`img:${ref.length > MAX_REF_LENGTH ? `#${hashText(ref)}` : ref}`));
      // The natural width is known only once loaded.
      img.addEventListener('load', () => applySize(img));
      addFrame(target, img, 'span');
    } else {
      const source = el.querySelector('.diagram-source')?.textContent ?? '';
      el.setAttribute(KEY_ATTR, key(`diagram:${hashText(source)}`));
      addFrame(el, el, 'div');
    }
  }
}

function applySize(el: HTMLElement): void {
  const key = el.getAttribute(KEY_ATTR);
  const frame = el.closest('.media-frame');
  if (!key || !frame) return;
  const scale = scaleOf(key);
  const base = baseWidth(el);
  if (base) {
    el.style.setProperty('--media-w', `${Math.round((base * scale) / 100)}px`);
    el.classList.add('media-scaled');
  } else {
    el.style.removeProperty('--media-w');
    el.classList.remove('media-scaled');
  }
  // Buttons only for something with a size: not for a missing image or a diagram that failed.
  frame.classList.toggle('media-ready', !!base);
  const [smaller, reset, larger] = frame.querySelectorAll<HTMLButtonElement>(':scope > .media-size > button');
  if (!reset) return;
  reset.textContent = `${scale}%`;
  reset.setAttribute('aria-label', t('mediaReset', { n: scale }));
  reset.title = reset.getAttribute('aria-label')!;
  reset.classList.toggle('media-size-custom', key in current.items);
  // aria-disabled, not disabled: a disabled button would drop the keyboard focus.
  smaller.setAttribute('aria-disabled', String(stepScale(scale, -1) === scale));
  larger.setAttribute('aria-disabled', String(stepScale(scale, 1) === scale));
}

/** Sizes every keyed item in root; call again after diagrams are redrawn. */
export function applyMediaSizes(root: ParentNode): void {
  for (const el of root.querySelectorAll<HTMLElement>(`[${KEY_ATTR}]`)) applySize(el);
}

export async function loadMediaDoc(doc: string): Promise<MediaDoc> {
  return { doc, items: await loadItemSizes(doc) };
}

/** Makes doc's saved sizes the current ones and applies them to the content just shown. */
export function showMediaSizes(content: ParentNode, doc: MediaDoc): void {
  current = doc;
  applyMediaSizes(content);
}

/** The settings panel's scale, used by every item without its own. */
export function setGlobalMediaScale(scale: number): void {
  if (scale === globalScale) return;
  globalScale = scale;
  applyMediaSizes(document);
}

/** dir: -1 smaller, +1 larger, 0 back to the settings panel's scale. */
function resize(el: HTMLElement, dir: number): void {
  const key = el.getAttribute(KEY_ATTR);
  if (!key) return;
  const { items } = current;
  if (dir === 0) {
    if (!(key in items)) return;
    delete items[key];
  } else {
    const now = scaleOf(key);
    const next = stepScale(now, dir);
    if (next === now) return;
    delete items[key]; // re-added last: the newest sizes are kept when over the cap
    items[key] = next;
  }
  applySize(el);
  if (current.doc) void saveItemSizes(current.doc, items);
}
