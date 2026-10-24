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
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  document.body.append(overlay);
  overlay.focus();
  return overlay;
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
    const diagram = (e.target as Element).closest?.<HTMLElement>('.diagram-mermaid:not(.diagram-error)');
    if ((e.key !== 'Enter' && e.key !== ' ') || !diagram || e.target !== diagram) return;
    e.preventDefault();
    openDiagram(diagram, indexOf(content, diagram));
  });
  content.addEventListener('click', (e) => {
    const diagram = (e.target as Element).closest?.<HTMLElement>('.diagram-mermaid:not(.diagram-error)');
    if (diagram && content.contains(diagram)) {
      openDiagram(diagram, indexOf(content, diagram));
      return;
    }
    const img = (e.target as Element).closest?.('img');
    if (!img || img.closest('a') || img.classList.contains('img-missing') || !content.contains(img)) return;
    e.preventDefault();
    open(img);
  });
}

function indexOf(content: HTMLElement, diagram: HTMLElement): number {
  return Array.from(content.querySelectorAll('.diagram-mermaid')).indexOf(diagram) + 1;
}
