// Click an image in the document to see it at full size in an overlay (the image size setting may
// shrink it). The overlay scrolls when the image is larger than the window; a click or Esc closes it.
// Mermaid diagrams open the same way, scaled to fit the window, with Save SVG / Save PNG buttons.
// An overlay rather than a new tab: viewer images are blob: URLs that are revoked on re-render.
import { t } from '../i18n';
import { renderForExport } from './diagrams';
import { diagramFilename, savePng, saveSvg } from './diagram-export';

let overlay: HTMLElement | null = null;
let returnFocus: HTMLElement | null = null;

function close(): void {
  document.removeEventListener('keydown', onKeydown, true);
  overlay?.remove();
  overlay = null;
  returnFocus?.focus();
  returnFocus = null;
}

function show(label: string, children: Node[]): HTMLElement {
  close();
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  overlay = document.createElement('div');
  overlay.className = 'image-zoom';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', label);
  overlay.title = t('imageZoomClose');
  overlay.tabIndex = -1;
  overlay.append(...children);
  overlay.addEventListener('click', close);
  // On the document, not the overlay: Esc must close it wherever focus is.
  document.addEventListener('keydown', onKeydown, true);
  document.body.append(overlay);
  overlay.focus();
  return overlay;
}

// The dialog is modal: Tab cycles through its buttons (or stays on the overlay) instead of
// reaching the page behind it.
function onKeydown(e: KeyboardEvent): void {
  if (!overlay) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    close();
    return;
  }
  if (e.key !== 'Tab') return;
  e.preventDefault();
  const items = Array.from(overlay.querySelectorAll<HTMLElement>('button'));
  if (!items.length) {
    overlay.focus();
    return;
  }
  const i = items.indexOf(document.activeElement as HTMLElement);
  const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i + 1) % items.length;
  items[next].focus();
}

function zoomable(img: HTMLImageElement | null, content: HTMLElement): img is HTMLImageElement {
  return !!img && !img.closest('a') && !img.classList.contains('img-missing') && content.contains(img);
}

/** Makes document images reachable with Tab, like diagrams; call on each render's new content. */
export function prepareImageZoom(root: ParentNode): void {
  for (const img of root.querySelectorAll<HTMLImageElement>('img:not(.img-missing)')) {
    if (img.closest('a, .diagram')) continue; // links keep working as links; diagrams open as a whole
    img.tabIndex = 0;
    img.setAttribute('role', 'button');
    img.setAttribute('aria-label', t('imageZoomOpen', { alt: img.alt || t('imageZoom') }));
  }
}

function open(img: HTMLImageElement): void {
  const full = document.createElement('img');
  full.src = img.currentSrc || img.src;
  full.alt = img.alt;
  show(img.alt || t('imageZoom'), [full]);
}

function openDiagram(node: HTMLElement, index: number): void {
  const svg = node.querySelector<SVGSVGElement>('.diagram-screen svg, :scope > svg');
  if (!svg) return;
  const bg = getComputedStyle(document.body).backgroundColor;
  const bar = document.createElement('div');
  bar.className = 'diagram-actions';
  const status = document.createElement('span');
  status.className = 'diagram-save-error';
  status.setAttribute('role', 'alert');
  const button = (label: string, save: () => void | Promise<void>) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', async (e) => {
      e.stopPropagation(); // not a click on the backdrop
      status.textContent = '';
      try {
        await save();
      } catch (err) {
        status.textContent = t('diagramSaveFailed', { error: err instanceof Error ? err.message : String(err) });
      }
    });
    return b;
  };
  bar.append(
    button(t('saveSvg'), () => saveSvg(svg, bg, diagramFilename(index, 'svg'))),
    button(t('savePng'), async () => savePng(await renderForExport(node), bg, diagramFilename(index, 'png'))),
    status,
  );
  // A clone, so the document's copy keeps its own size; the id stays so Mermaid's scoped styles apply.
  const full = svg.cloneNode(true) as SVGSVGElement;
  full.removeAttribute('width');
  full.removeAttribute('height');
  full.classList.add('diagram-zoom-svg');
  bar.addEventListener('click', (e) => e.stopPropagation());
  show(t('diagramZoom'), [bar, full]);
}

/** Opens document images (not linked ones, which keep working as links) at full size on click. */
export function enableImageZoom(content: HTMLElement): void {
  content.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const target = e.target as Element;
    if (target instanceof HTMLImageElement && zoomable(target, content)) {
      e.preventDefault();
      open(target);
      return;
    }
    const diagram = target.closest?.<HTMLElement>('.diagram-mermaid:not(.diagram-error)');
    if (!diagram || target !== diagram) return;
    e.preventDefault();
    openDiagram(diagram, indexOf(content, diagram));
  });
  content.addEventListener('click', (e) => {
    const diagram = (e.target as Element).closest?.<HTMLElement>('.diagram-mermaid:not(.diagram-error)');
    if (diagram && content.contains(diagram)) {
      openDiagram(diagram, indexOf(content, diagram));
      return;
    }
    const img = (e.target as Element).closest?.('img') ?? null;
    if (!zoomable(img, content)) return;
    e.preventDefault();
    open(img);
  });
}

function indexOf(content: HTMLElement, diagram: HTMLElement): number {
  return Array.from(content.querySelectorAll('.diagram-mermaid')).indexOf(diagram) + 1;
}
