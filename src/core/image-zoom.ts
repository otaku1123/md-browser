// Click an image in the document to see it at full size in an overlay (the image size setting may
// shrink it). The overlay scrolls when the image is larger than the window; a click or Esc closes it.
// An overlay rather than a new tab: viewer images are blob: URLs that are revoked on re-render.
import { t } from '../i18n';

let overlay: HTMLElement | null = null;
let returnFocus: HTMLElement | null = null;

function close(): void {
  overlay?.remove();
  overlay = null;
  returnFocus?.focus();
  returnFocus = null;
}

function open(img: HTMLImageElement): void {
  close();
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  overlay = document.createElement('div');
  overlay.className = 'image-zoom';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', img.alt || t('imageZoom'));
  overlay.title = t('imageZoomClose');
  overlay.tabIndex = -1;
  const full = document.createElement('img');
  full.src = img.currentSrc || img.src;
  full.alt = img.alt;
  overlay.append(full);
  overlay.addEventListener('click', close);
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  document.body.append(overlay);
  overlay.focus();
}

/** Opens document images (not linked ones, which keep working as links) at full size on click. */
export function enableImageZoom(content: HTMLElement): void {
  content.addEventListener('click', (e) => {
    const img = (e.target as Element).closest?.('img');
    if (!img || img.closest('a') || img.classList.contains('img-missing') || !content.contains(img)) return;
    e.preventDefault();
    open(img);
  });
}
